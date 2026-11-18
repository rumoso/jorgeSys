// =============================================================================
// Política de checado (análisis 005 §2)
// =============================================================================
// Dado un empleado, una sucursal y una forma, dice si la forma está permitida
// y con qué configuración:
//
//     excepción del empleado (formas_empleado)  →  la de la sucursal (formas_sucursal)
//
// Sin renglón en ninguna: no está permitida. Una forma "próximamente" del
// catálogo nunca está permitida.
//
// Caché en memoria por empresa (la empresa va en la llave, ARQUITECTURA §3.6).
// Quien cambie la política (controllers/formasChecado.js) llama a invalidar.
// =============================================================================

const { db } = require('./db');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();          // idEmpresa → { vence, sucursal: Map, empleado: Map }
let catalogoCache = null;         // { vence, formas: Map }

const parse = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return null; }
};

/** Catálogo global de formas: Map forma → { forma, nombre, estado, evidencias[], verificaciones[] }. */
const catalogo = async () => {
    if (catalogoCache && catalogoCache.vence > Date.now()) return catalogoCache.formas;
    const filas = await db.global.query(`
        SELECT forma, nombre, descripcion, icono, estado, evidencias, verificaciones, orden
          FROM cat_formas_checado ORDER BY orden, forma`);
    const formas = new Map(filas.map(f => [f.forma, {
        ...f, evidencias: parse(f.evidencias) || [], verificaciones: parse(f.verificaciones) || []
    }]));
    catalogoCache = { vence: Date.now() + TTL_MS, formas };
    return formas;
};

const politicaDe = async (req) => {
    const idEmpresa = Number(req.idEmpresa);
    const guardada = cache.get(idEmpresa);
    if (guardada && guardada.vence > Date.now()) return guardada;
    const suc = await db.empresa(req).query(
        'SELECT idSucursal, forma, bActiva, configuracion FROM formas_sucursal WHERE idEmpresa = :idEmpresa');
    const emp = await db.empresa(req).query(
        'SELECT idEmpleado, forma, bPermitida, configuracion FROM formas_empleado WHERE idEmpresa = :idEmpresa');
    const p = {
        vence: Date.now() + TTL_MS,
        sucursal: new Map(suc.map(x => [`${ x.idSucursal }:${ x.forma }`, { activa: !!x.bActiva, configuracion: parse(x.configuracion) }])),
        empleado: new Map(emp.map(x => [`${ x.idEmpleado }:${ x.forma }`, { permitida: !!x.bPermitida, configuracion: parse(x.configuracion) }]))
    };
    cache.set(idEmpresa, p);
    return p;
};

/**
 * { permitida, motivo, origen ('EMPLEADO' | 'SUCURSAL' | null), configuracion, verificaciones[], forma (catálogo) }
 */
const formaPermitida = async (req, { idEmpleado, idSucursal, forma }) => {
    const def = (await catalogo()).get(forma);
    if (!def) return { permitida: false, motivo: `La forma de checar "${ forma }" no existe`, origen: null, configuracion: null, verificaciones: [] };
    if (def.estado !== 'DISPONIBLE') {
        return { permitida: false, motivo: `La forma "${ def.nombre }" todavía no está disponible`, origen: null, configuracion: null, verificaciones: [], forma: def };
    }
    const p = await politicaDe(req);
    const exc = p.empleado.get(`${ idEmpleado }:${ forma }`);
    const suc = p.sucursal.get(`${ idSucursal }:${ forma }`);
    let permitida = false;
    let origen = null;
    let configuracion = null;
    if (exc) { permitida = exc.permitida; origen = 'EMPLEADO'; configuracion = exc.configuracion ?? suc?.configuracion ?? null; }
    else if (suc) { permitida = suc.activa; origen = 'SUCURSAL'; configuracion = suc.configuracion; }

    // La configuración puede apagar verificaciones, nunca agregar una que la forma no admite.
    const pedidas = Array.isArray(configuracion?.verificaciones) ? configuracion.verificaciones : def.verificaciones;
    const verificaciones = def.verificaciones.filter(v => pedidas.includes(v));

    return {
        permitida,
        motivo: permitida ? null
            : origen === 'EMPLEADO' ? `El empleado no tiene permitido checar por "${ def.nombre }"`
                : `La sucursal no tiene activa la forma "${ def.nombre }"`,
        origen, configuracion, verificaciones, forma: def
    };
};

/** Al cambiar la política de una empresa (o el catálogo, sin empresa). */
const invalidar = (idEmpresa = null) => {
    if (!idEmpresa) { cache.clear(); catalogoCache = null; return; }
    cache.delete(Number(idEmpresa));
};

module.exports = { formaPermitida, catalogo, invalidar };
