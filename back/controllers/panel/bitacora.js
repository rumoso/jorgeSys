// =============================================================================
// Panel → Bitácora del producto (análisis 009 §10, T34)
// =============================================================================
// /api/panel/bitacora, con validarPanel. Solo lectura: la bitácora no se edita
// ni se borra (disparadores de 009b y el guardián). Las fechas del filtro son
// días de `producto.zona_horaria`.
// =============================================================================

const { db } = require('../../helpers/db');
const { Regla } = require('../../helpers/permisosEdicion');
const constantes = require('../../helpers/constantes');
const fechas = require('../../helpers/fechas');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(`panel/${ donde }`, error);
    return res.json({ status_code: 2, message, data: null });
};

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const json = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
};

/** Inicio del día `fecha` en la zona del producto (o lanza si no es fecha). */
const inicioDia = (fecha, zona) => {
    if (!RE_FECHA.test(String(fecha))) throw new Regla('Las fechas van como AAAA-MM-DD');
    try {
        return fechas.limitesDia(String(fecha), zona);
    } catch {
        throw new Regla(`La fecha ${ fecha } no es válida`);
    }
};

/**
 * GET /api/panel/bitacora/getBitacora?desde=&hasta=&idSuperadmin=&idEmpresa=&accion=&pagina=1&porPagina=50
 * desde y hasta: días (AAAA-MM-DD) del producto, incluidos. Del más reciente al más viejo.
 * data: { total, pagina, porPagina, filas: [{ idBitacora, fecha, idSuperadmin, nombreSuperadmin, accion, idEmpresa,
 *         empresa, objeto, antes, despues, motivo, ip }] }
 */
const getBitacora = async (req, res) => {
    try {
        const zona = await constantes.valor('producto.zona_horaria');
        const desde = req.query.desde ? inicioDia(req.query.desde, zona).inicio : null;
        const hasta = req.query.hasta ? inicioDia(req.query.hasta, zona).fin : null;
        const idSuperadmin = idValido(req.query.idSuperadmin);
        const idEmpresa = idValido(req.query.idEmpresa);
        const accion = req.query.accion ? String(req.query.accion).trim().slice(0, 60) : null;
        const porPagina = Math.min(Math.max(Number(req.query.porPagina) || 50, 1), 200);
        const pagina = Math.max(Number(req.query.pagina) || 1, 1);
        const filtros = `
             WHERE (:desde IS NULL OR b.fecha >= :desde)
               AND (:hasta IS NULL OR b.fecha < :hasta)
               AND (:idSuperadmin IS NULL OR b.idSuperadmin = :idSuperadmin)
               AND (:idEmpresa IS NULL OR b.idEmpresa = :idEmpresa)
               AND (:accion IS NULL OR b.accion = :accion)`;
        const replacements = { desde, hasta, idSuperadmin, idEmpresa, accion };
        const [{ total }] = await db.panel(req).query(`SELECT COUNT(*) AS total FROM bitacora_producto b ${ filtros }`, { replacements });
        const filas = await db.panel(req).query(`
            SELECT /* panel: bitácora del producto con el nombre de la empresa */
                   b.idBitacora, b.fecha, b.idSuperadmin, b.nombreSuperadmin, b.accion, b.idEmpresa,
                   e.nombreComercial AS empresa, b.objeto, b.antes, b.despues, b.motivo, b.ip
              FROM bitacora_producto b
              LEFT JOIN empresas e ON e.idEmpresa = b.idEmpresa
              ${ filtros }
             ORDER BY b.idBitacora DESC
             LIMIT ${ porPagina } OFFSET ${ (pagina - 1) * porPagina }`, { replacements });
        return ok(res, `${ Number(total) } movimiento(s)`, {
            total: Number(total), pagina, porPagina,
            filas: filas.map(f => ({ ...f, antes: json(f.antes), despues: json(f.despues) }))
        });
    } catch (error) {
        return falla(res, 'getBitacora', error, 'No fue posible consultar la bitácora');
    }
};

/**
 * GET /api/panel/bitacora/getFiltrosBitacora: lo que llena los combos de filtros.
 * data: { superadmins: [{ idSuperadmin, nombre }], acciones: [texto] }
 */
const getFiltrosBitacora = async (req, res) => {
    try {
        const superadmins = await db.panel(req).query('SELECT idSuperadmin, nombre FROM superadmins ORDER BY nombre');
        const acciones = (await db.panel(req).query('SELECT DISTINCT accion FROM bitacora_producto ORDER BY accion')).map(x => x.accion);
        return ok(res, 'Filtros de la bitácora', { superadmins, acciones });
    } catch (error) {
        return falla(res, 'getFiltrosBitacora', error, 'No fue posible consultar los filtros');
    }
};

module.exports = { getBitacora, getFiltrosBitacora };
