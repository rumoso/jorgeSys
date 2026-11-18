// =============================================================================
// Panel → Planes (análisis 009 §7, T19)
// =============================================================================
// /api/panel/planes, todo con validarPanel. Cada plan soporta las dos formas
// de cobro: LIMITE (hasta N empleados activos por un precio fijo) y
// POR_EMPLEADO (precio por cada empleado activo; máximo del mes). Un plan no
// se borra: se desactiva, y no si alguna empresa lo tiene vigente.
// =============================================================================

const { db, QueryTypes } = require('../../helpers/db');
const { Regla } = require('../../helpers/permisosEdicion');
const bitacoraProducto = require('../../helpers/panel/bitacoraProducto');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(`panel/${ donde }`, error);
    return res.json({ status_code: 2, message, data: null });
};

const TIPOS = ['LIMITE', 'POR_EMPLEADO'];
const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

const publico = (p) => ({
    idPlan: p.idPlan, nombre: p.nombre, tipoCobro: p.tipoCobro,
    limiteEmpleados: p.limiteEmpleados === null ? null : Number(p.limiteEmpleados),
    precio: Number(p.precio), bActivo: !!p.bActivo, empresas: Number(p.empresas || 0)
});

/** El plan con cuántas empresas lo tienen vigente (con bloqueo si se va a escribir). */
const planDe = async (req, idPlan, transaction, bloquear = false) => {
    const id = idValido(idPlan);
    const [p] = id ? await db.panel(req).query(`
        SELECT idPlan, nombre, tipoCobro, limiteEmpleados, precio, bActivo
          FROM cat_planes WHERE idPlan = :id ${ bloquear ? 'FOR UPDATE' : '' }`, { replacements: { id }, transaction }) : [];
    if (!p) throw new Regla('El plan no existe');
    const [u] = await db.panel(req).query(`
        SELECT /* panel: cuántas empresas tienen vigente este plan */ COUNT(*) AS n
          FROM empresas_planes WHERE idPlan = :id AND vigente = 1`, { replacements: { id }, transaction });
    return publico({ ...p, empresas: u.n });
};

/**
 * GET /api/panel/planes/getPlanes?soloActivos=1
 * data: [{ idPlan, nombre, tipoCobro, limiteEmpleados, precio, bActivo, empresas }] (empresas con el plan vigente)
 */
const getPlanes = async (req, res) => {
    try {
        const soloActivos = ['1', 'true'].includes(String(req.query.soloActivos));
        const filas = await db.panel(req).query(`
            SELECT /* panel: catálogo de planes con cuántas empresas lo tienen vigente */
                   p.idPlan, p.nombre, p.tipoCobro, p.limiteEmpleados, p.precio, p.bActivo,
                   (SELECT COUNT(*) FROM empresas_planes ep WHERE ep.idPlan = p.idPlan AND ep.vigente = 1) AS empresas
              FROM cat_planes p
             WHERE (:soloActivos = 0 OR p.bActivo = 1)
             ORDER BY p.bActivo DESC, p.nombre`, { replacements: { soloActivos: soloActivos ? 1 : 0 } });
        return ok(res, `${ filas.length } plan(es)`, filas.map(publico));
    } catch (error) {
        return falla(res, 'getPlanes', error, 'No fue posible consultar los planes');
    }
};

/** Valida y normaliza lo que viene del navegador. */
const validar = (b) => {
    const nombre = String(b.nombre ?? '').trim().replace(/\s+/g, ' ');
    if (!nombre) throw new Regla('Escribe el nombre del plan');
    if (nombre.length > 100) throw new Regla('El nombre del plan admite hasta 100 caracteres');
    const tipoCobro = String(b.tipoCobro || '');
    if (!TIPOS.includes(tipoCobro)) throw new Regla('Escoge el tipo de cobro: con límite de empleados o por empleado');
    let limiteEmpleados = null;
    if (tipoCobro === 'LIMITE') {
        limiteEmpleados = Number(b.limiteEmpleados);
        if (!Number.isInteger(limiteEmpleados) || limiteEmpleados < 1 || limiteEmpleados > 1000000) {
            throw new Regla('El límite de empleados debe ser un número entero mayor a 0');
        }
    }
    const precio = Number(b.precio);
    if (b.precio === '' || b.precio === null || b.precio === undefined || !Number.isFinite(precio) || precio < 0 || precio > 9999999999.99) {
        throw new Regla(tipoCobro === 'LIMITE' ? 'Escribe el precio fijo del plan (0 o más)' : 'Escribe el precio por empleado (0 o más)');
    }
    return { nombre, tipoCobro, limiteEmpleados, precio: Math.round(precio * 100) / 100 };
};

/**
 * POST /api/panel/planes/insertUpdatePlan { idPlan?, nombre, tipoCobro, limiteEmpleados?, precio } → data: { id }
 * El tipo de cobro de un plan que alguna empresa tiene vigente no se cambia (cambiaría lo que se le cobra).
 */
const insertUpdatePlan = async (req, res) => {
    const idPlan = idValido(req.body.idPlan);
    try {
        const r = await db.transaccion(async (t) => {
            const d = validar(req.body);
            const [otro] = await db.panel(req).query(
                'SELECT idPlan FROM cat_planes WHERE nombre = :nombre AND idPlan <> :id',
                { replacements: { nombre: d.nombre, id: idPlan || 0 }, transaction: t });
            if (otro) throw new Regla(`Ya existe un plan llamado ${ d.nombre }`);

            if (!idPlan) {
                const [id] = await db.panel(req).query(`
                    INSERT INTO cat_planes (nombre, tipoCobro, limiteEmpleados, precio)
                    VALUES (:nombre, :tipoCobro, :limiteEmpleados, :precio)`,
                { replacements: d, type: QueryTypes.INSERT, transaction: t });
                await bitacoraProducto.registrar(req, { accion: 'PLAN_ALTA', objeto: String(id), despues: d }, t);
                return { id, nuevo: true, cambio: true };
            }

            const actual = await planDe(req, idPlan, t, true);
            const antes = { nombre: actual.nombre, tipoCobro: actual.tipoCobro, limiteEmpleados: actual.limiteEmpleados, precio: actual.precio };
            if (Object.keys(d).every(k => d[k] === antes[k])) return { id: idPlan, nuevo: false, cambio: false };
            if (actual.empresas && d.tipoCobro !== actual.tipoCobro) {
                throw new Regla(`No se puede cambiar el tipo de cobro: ${ actual.empresas } empresa(s) tienen este plan. Crea un plan nuevo y cámbialas a él.`);
            }
            await db.panel(req).query(`
                UPDATE cat_planes SET nombre = :nombre, tipoCobro = :tipoCobro, limiteEmpleados = :limiteEmpleados, precio = :precio
                 WHERE idPlan = :idPlan`,
            { replacements: { ...d, idPlan }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'PLAN_CAMBIO', objeto: String(idPlan), antes, despues: d }, t);
            return { id: idPlan, nuevo: false, cambio: true };
        });
        return ok(res, r.nuevo ? 'Plan creado' : r.cambio ? 'Plan actualizado' : 'Sin cambios que guardar', { id: r.id });
    } catch (error) {
        if (error?.original?.errno === 1062) return no(res, 'Ya existe un plan con ese nombre');
        return falla(res, 'insertUpdatePlan', error, 'No fue posible guardar el plan');
    }
};

/** PUT /api/panel/planes/disablePlan { idPlan } → data: { id }. No si alguna empresa lo tiene vigente. */
const disablePlan = async (req, res) => {
    try {
        const p = await db.transaccion(async (t) => {
            const plan = await planDe(req, req.body.idPlan, t, true);
            if (!plan.bActivo) throw new Regla(`El plan ${ plan.nombre } ya está desactivado`);
            if (plan.empresas) {
                throw new Regla(`No se puede desactivar el plan ${ plan.nombre }: lo tienen ${ plan.empresas } empresa(s). Cámbialas de plan primero.`);
            }
            await db.panel(req).query('UPDATE cat_planes SET bActivo = 0 WHERE idPlan = :id',
                { replacements: { id: plan.idPlan }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'PLAN_DESACTIVADO', objeto: String(plan.idPlan),
                antes: { bActivo: true }, despues: { bActivo: false } }, t);
            return plan;
        });
        return ok(res, `Plan ${ p.nombre } desactivado`, { id: p.idPlan });
    } catch (error) {
        return falla(res, 'disablePlan', error, 'No fue posible desactivar el plan');
    }
};

/** PUT /api/panel/planes/enablePlan { idPlan } → data: { id } */
const enablePlan = async (req, res) => {
    try {
        const p = await db.transaccion(async (t) => {
            const plan = await planDe(req, req.body.idPlan, t, true);
            if (plan.bActivo) throw new Regla(`El plan ${ plan.nombre } ya está activo`);
            await db.panel(req).query('UPDATE cat_planes SET bActivo = 1 WHERE idPlan = :id',
                { replacements: { id: plan.idPlan }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'PLAN_ACTIVADO', objeto: String(plan.idPlan),
                antes: { bActivo: false }, despues: { bActivo: true } }, t);
            return plan;
        });
        return ok(res, `Plan ${ p.nombre } activado`, { id: p.idPlan });
    } catch (error) {
        return falla(res, 'enablePlan', error, 'No fue posible activar el plan');
    }
};

module.exports = { getPlanes, insertUpdatePlan, disablePlan, enablePlan };
