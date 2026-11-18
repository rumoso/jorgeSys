// =============================================================================
// Panel → Sesión de soporte (análisis 009 §5, T24)
// =============================================================================
// /api/panel/soporte, con validarPanel. El superadministrador entra a una
// empresa ACTIVA o SUSPENDIDA con motivo obligatorio y por
// `soporte.sesion_minutos`. Recibe un token `soporte` que se usa como una
// sesión de empresa (cabecera `x-token`, validarJWT). Cada entrada y salida
// queda en la bitácora del producto y la empresa la ve en su Configuración
// (configuracion/getAccesosSoporte).
// =============================================================================

const { db, QueryTypes } = require('../../helpers/db');
const { Regla } = require('../../helpers/permisosEdicion');
const { tokenSoporte } = require('../../helpers/jwt');
const constantes = require('../../helpers/constantes');
const fechas = require('../../helpers/fechas');
const bitacoraProducto = require('../../helpers/panel/bitacoraProducto');
const { ESTADOS_SOPORTE, iso } = require('../../helpers/panel/soporte');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(`panel/${ donde }`, error);
    return res.json({ status_code: 2, message, data: null });
};

const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

/**
 * POST /api/panel/soporte/entrarEmpresa { idEmpresa, motivo }
 * data: { token, idSesionSoporte, vence (ISO), minutos, empresa: { idEmpresa, nombre, estado } }
 * El token va en `x-token` (como una sesión de empresa) hasta `vence` o hasta salirEmpresa.
 */
const entrarEmpresa = async (req, res) => {
    try {
        const minutos = await constantes.valor('soporte.sesion_minutos');
        const r = await db.transaccion(async (t) => {
            const id = idValido(req.body.idEmpresa);
            const [e] = id ? await db.panel(req).query(`
                SELECT /* panel: empresa a la que entra soporte */ idEmpresa, nombreComercial, estado
                  FROM empresas WHERE idEmpresa = :id FOR UPDATE`, { replacements: { id }, transaction: t }) : [];
            if (!e) throw new Regla('La empresa no existe');
            const motivo = String(req.body.motivo ?? '').trim().replace(/\s+/g, ' ');
            if (!motivo) throw new Regla('Escribe el motivo de la entrada');
            if (motivo.length > 500) throw new Regla('El motivo admite hasta 500 caracteres');
            if (!ESTADOS_SOPORTE.includes(e.estado)) {
                throw new Regla(`La empresa ${ e.nombreComercial } está ${ e.estado === 'EN_BAJA' ? 'en baja' : 'eliminada' }: soporte solo entra a empresas activas o suspendidas`);
            }
            const inicio = fechas.ahora();
            const vence = new Date(inicio.getTime() + minutos * 60 * 1000);
            const [idSesionSoporte] = await db.panel(req).query(`
                INSERT INTO soporte_sesiones (idEmpresa, idSuperadmin, nombreSuperadmin, motivo, inicio, vence)
                VALUES (:idEmpresa, :idSuperadmin, :nombre, :motivo, :inicio, :vence) /* panel: entrada de soporte a la empresa */`, {
                replacements: { idEmpresa: e.idEmpresa, idSuperadmin: req.idSuperadmin, nombre: req.superadmin.nombre, motivo, inicio, vence },
                type: QueryTypes.INSERT, transaction: t
            });
            await bitacoraProducto.registrar(req, {
                accion: 'SOPORTE_ENTRADA', idEmpresa: e.idEmpresa, objeto: String(idSesionSoporte),
                despues: { idSesionSoporte, estado: e.estado, minutos, vence: vence.toISOString() }, motivo
            }, t);
            return { e, idSesionSoporte, vence };
        });
        const token = tokenSoporte({ idSuperadmin: req.idSuperadmin, idEmpresa: r.e.idEmpresa, idSesionSoporte: r.idSesionSoporte }, minutos);
        return ok(res, `Entraste a ${ r.e.nombreComercial } como soporte por ${ minutos } minutos`, {
            token, idSesionSoporte: r.idSesionSoporte, vence: r.vence.toISOString(), minutos,
            empresa: { idEmpresa: r.e.idEmpresa, nombre: r.e.nombreComercial, estado: r.e.estado }
        });
    } catch (error) {
        return falla(res, 'entrarEmpresa', error, 'No fue posible entrar a la empresa');
    }
};

/**
 * POST /api/panel/soporte/salirEmpresa { idSesionSoporte }
 * Cierra la sesión de soporte (solo las propias). Repetible: si ya estaba cerrada o vencida, lo dice.
 * data: { id, inicio, fin } (ISO)
 */
const salirEmpresa = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const id = idValido(req.body.idSesionSoporte);
            const [s] = id ? await db.panel(req).query(`
                SELECT /* panel: sesión de soporte que se cierra */
                       ss.idSesionSoporte, ss.idEmpresa, ss.inicio, ss.vence, ss.fin, (ss.vence <= :ahora) AS bVencida,
                       e.nombreComercial
                  FROM soporte_sesiones ss JOIN empresas e ON e.idEmpresa = ss.idEmpresa
                 WHERE ss.idSesionSoporte = :id AND ss.idSuperadmin = :idSuperadmin FOR UPDATE`,
            { replacements: { id, idSuperadmin: req.idSuperadmin, ahora: fechas.ahora() }, transaction: t }) : [];
            if (!s) throw new Regla('La sesión de soporte no existe');
            if (s.fin) return { s, cerrada: false, fin: s.fin };
            // Ya vencida: se cierra a la hora en que venció (la duración real).
            const fin = Number(s.bVencida) ? s.vence : fechas.ahora();
            await db.panel(req).query(`
                UPDATE soporte_sesiones SET fin = :fin
                 WHERE idEmpresa = :idEmpresa AND idSesionSoporte = :id AND fin IS NULL /* panel: cierra la sesión de soporte */`,
            { replacements: { fin, idEmpresa: s.idEmpresa, id: s.idSesionSoporte }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, {
                accion: 'SOPORTE_SALIDA', idEmpresa: s.idEmpresa, objeto: String(s.idSesionSoporte),
                despues: { idSesionSoporte: s.idSesionSoporte, vencida: !!Number(s.bVencida) }
            }, t);
            return { s, cerrada: true, fin };
        });
        const fin = r.fin instanceof Date ? r.fin.toISOString() : iso(r.fin);
        return ok(res, r.cerrada ? `Saliste de ${ r.s.nombreComercial }` : 'La sesión de soporte ya estaba cerrada',
            { id: r.s.idSesionSoporte, inicio: iso(r.s.inicio), fin });
    } catch (error) {
        return falla(res, 'salirEmpresa', error, 'No fue posible cerrar la sesión de soporte');
    }
};

module.exports = { entrarEmpresa, salirEmpresa };
