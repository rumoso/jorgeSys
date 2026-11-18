// =============================================================================
// Qué puede un usuario en la empresa de su sesión (análisis 002)
// =============================================================================
// Lo que puede = roles ACTIVOS + permisos directos, filtrado por los módulos
// que la empresa tiene contratados. No hay "negar".
//
// El rol protegido (Administrador) tiene TODO lo contratado, también lo que
// el producto agregue después: no depende de filas en roles_acciones.
//
// Los menús del módulo General (Hoy) los tiene todo usuario, tenga o no rol.
// Marcar una acción da también su menú.
//
// Caché en memoria por empresa y usuario (ARQUITECTURA §3.6). Quien cambia
// roles o permisos la invalida, y el cambio aplica en la siguiente petición.
// =============================================================================

const { db } = require('./db');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const llave = (idEmpresa, uid) => `${ idEmpresa }:${ uid }`;

/** Módulos que aplican a la empresa: los contratados y los "siempre", disponibles. */
const modulosDe = async (req) => (await db.empresa(req).query(`
    SELECT m.modulo
      FROM cat_modulos m
     WHERE m.estado = 'DISPONIBLE'
       AND (m.bSiempre = 1 OR EXISTS (
            SELECT 1 FROM empresas_modulos em WHERE em.idEmpresa = :idEmpresa AND em.modulo = m.modulo))`))
    .map(x => x.modulo);

/** Todo lo contratado: lo que tiene el Administrador. */
const todoLoContratado = async (modulos) => {
    const menus = await db.global.query(
        'SELECT menu FROM cat_menus WHERE bActivo = 1 AND modulo IN (:modulos)', { replacements: { modulos } });
    const acciones = await db.global.query(`
        SELECT a.accion FROM cat_acciones a JOIN cat_menus m ON m.menu = a.menu
         WHERE m.bActivo = 1 AND m.modulo IN (:modulos)`, { replacements: { modulos } });
    return { menus: new Set(menus.map(x => x.menu)), acciones: new Set(acciones.map(x => x.accion)) };
};

/** Menús del módulo General: los ve todo usuario. */
const menusSiempre = async () => (await db.global.query(`
    SELECT cm.menu FROM cat_menus cm JOIN cat_modulos mo ON mo.modulo = cm.modulo
     WHERE cm.bActivo = 1 AND mo.bSiempre = 1`)).map(x => x.menu);

/** Completa: menús de las acciones marcadas, General, y filtra por lo contratado. */
const resolver = async (modulos, menusMarcados, accionesMarcadas) => {
    const todo = await todoLoContratado(modulos);
    const acciones = new Set([...accionesMarcadas].filter(a => todo.acciones.has(a)));
    const menusDeAcciones = acciones.size
        ? (await db.global.query('SELECT DISTINCT menu FROM cat_acciones WHERE accion IN (:acciones)',
            { replacements: { acciones: [...acciones] } })).map(x => x.menu)
        : [];
    const menus = new Set([...menusMarcados, ...menusDeAcciones, ...(await menusSiempre())].filter(m => todo.menus.has(m)));
    return { menus, acciones };
};

const calcular = async (req, uid) => {
    const modulos = await modulosDe(req);

    const [admin] = await db.empresa(req).query(`
        SELECT 1 AS si
          FROM usuarios_empresa_roles uer
          JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
         WHERE uer.idEmpresa = :idEmpresa AND uer.idUsuario = :uid
           AND r.bActivo = 1 AND r.bProtegido = 1
         LIMIT 1`, { replacements: { uid } });
    if (admin) return { admin: true, ...(await todoLoContratado(modulos)) };

    const menus = await db.empresa(req).query(`
        SELECT rm.menu
          FROM roles_menus rm
          JOIN usuarios_empresa_roles uer ON uer.idEmpresa = rm.idEmpresa AND uer.idRol = rm.idRol
          JOIN roles r ON r.idEmpresa = rm.idEmpresa AND r.idRol = rm.idRol
         WHERE rm.idEmpresa = :idEmpresa AND uer.idUsuario = :uid AND r.bActivo = 1
        UNION
        SELECT x.menu FROM usuarios_empresa_menus x
         WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = :uid`, { replacements: { uid } });
    const acciones = await db.empresa(req).query(`
        SELECT ra.accion
          FROM roles_acciones ra
          JOIN usuarios_empresa_roles uer ON uer.idEmpresa = ra.idEmpresa AND uer.idRol = ra.idRol
          JOIN roles r ON r.idEmpresa = ra.idEmpresa AND r.idRol = ra.idRol
         WHERE ra.idEmpresa = :idEmpresa AND uer.idUsuario = :uid AND r.bActivo = 1
        UNION
        SELECT x.accion FROM usuarios_empresa_acciones x
         WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = :uid`, { replacements: { uid } });

    return { admin: false, ...(await resolver(modulos, menus.map(x => x.menu), acciones.map(x => x.accion))) };
};

/**
 * Permisos de un usuario en la empresa de `req`: { admin, menus: Set, acciones: Set }.
 * Sin `uid`, los del usuario de la sesión (en soporte, todo lo contratado).
 */
const permisosDe = async (req, uid = req.uid) => {
    // Sesión de soporte (009): sin usuario, todo lo de los módulos contratados.
    const soporte = !!req.soporte && (uid === null || uid === undefined);
    const k = llave(req.idEmpresa, soporte ? 'soporte' : uid);
    const guardado = cache.get(k);
    if (guardado && guardado.vence > Date.now()) return guardado.permisos;
    const permisos = soporte
        ? { admin: true, ...(await todoLoContratado(await modulosDe(req))) }
        : await calcular(req, uid);
    cache.set(k, { permisos, vence: Date.now() + TTL_MS });
    return permisos;
};

/** Lo que daría un rol por sí solo ("Ver como" y la revisión de escalada). */
const permisosDeRol = async (req, idRol) => {
    const modulos = await modulosDe(req);
    const [rol] = await db.empresa(req).query(
        'SELECT bProtegido FROM roles WHERE idEmpresa = :idEmpresa AND idRol = :idRol', { replacements: { idRol } });
    if (!rol) return null;
    if (rol.bProtegido) return { admin: true, ...(await todoLoContratado(modulos)) };
    const menus = await db.empresa(req).query(
        'SELECT menu FROM roles_menus WHERE idEmpresa = :idEmpresa AND idRol = :idRol', { replacements: { idRol } });
    const acciones = await db.empresa(req).query(
        'SELECT accion FROM roles_acciones WHERE idEmpresa = :idEmpresa AND idRol = :idRol', { replacements: { idRol } });
    return { admin: false, ...(await resolver(modulos, menus.map(x => x.menu), acciones.map(x => x.accion))) };
};

/** ¿`otorgante` tiene todo lo de `permisos`? (regla de no escalada) */
const contiene = (otorgante, permisos) => {
    if (otorgante.admin) return true;
    if (permisos.admin) return false;
    return [...permisos.acciones].every(a => otorgante.acciones.has(a))
        && [...permisos.menus].every(m => otorgante.menus.has(m));
};

const invalidar = (idEmpresa, uid) => cache.delete(llave(idEmpresa, uid));
const invalidarEmpresa = (idEmpresa) => {
    for (const k of cache.keys()) if (k.startsWith(`${ idEmpresa }:`)) cache.delete(k);
};

/**
 * El menú de la sesión, agrupado por módulo:
 *  - módulos contratados: solo sus menús permitidos;
 *  - módulos "próximamente": todos sus menús, bloqueados (invitación);
 *  - módulos disponibles no contratados: no aparecen.
 */
const menuDe = async (req, permisos) => {
    const filas = await db.global.query(`
        SELECT mo.modulo, mo.nombre AS moduloNombre, mo.estado, mo.bSiempre, mo.orden AS ordenModulo,
               cm.menu, cm.titulo, cm.icono, cm.ruta, cm.bInferior, cm.orden
          FROM cat_menus cm
          JOIN cat_modulos mo ON mo.modulo = cm.modulo
         WHERE cm.bActivo = 1
         ORDER BY mo.orden, cm.orden`);
    const grupos = new Map();
    for (const f of filas) {
        const bloqueado = f.estado === 'PROXIMAMENTE';
        if (!bloqueado && !permisos.menus.has(f.menu)) continue;
        if (!grupos.has(f.modulo)) {
            grupos.set(f.modulo, { modulo: f.modulo, nombre: f.bSiempre ? null : f.moduloNombre, bloqueado, items: [] });
        }
        grupos.get(f.modulo).items.push({
            menu: f.menu, titulo: f.titulo, icono: f.icono, ruta: f.ruta, inferior: !!f.bInferior, bloqueado
        });
    }
    return [...grupos.values()];
};

module.exports = { permisosDe, permisosDeRol, contiene, invalidar, invalidarEmpresa, menuDe, modulosDe, todoLoContratado };
