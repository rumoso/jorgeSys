const { db, QueryTypes } = require('../helpers/db');
const { permisosDe, permisosDeRol, contiene, invalidarEmpresa, menuDe, modulosDe } = require('../helpers/userActions');
const { Regla, prepararCambio } = require('../helpers/permisosEdicion');
const { registrar, diferencia } = require('../helpers/bitacoraPermisos');

const MSG_NO_EXISTE = 'El rol no existe';
const MSG_PROTEGIDO = 'El rol Administrador no se puede modificar: siempre tiene todo lo contratado';

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const fallo = (res, nombre, e, message) => {
    if (e instanceof Regla) return res.json({ status_code: 1, message: e.message, data: e.data });
    console.error(nombre, e);
    return res.json({ status_code: 2, message, data: null });
};

const rolDeEmpresa = async (req, idRol, transaction) => {
    const [rol] = await db.empresa(req).query(`
        SELECT idRol, nombre, descripcion, bActivo, bProtegido, plantilla
          FROM roles WHERE idEmpresa = :idEmpresa AND idRol = :idRol`,
    { replacements: { idRol: Number(idRol) || 0 }, transaction });
    return rol;
};

/** Menús y acciones MARCADOS de un rol (sin resolver). */
const marcadosDeRol = async (req, idRol, transaction) => ({
    menus: (await db.empresa(req).query(
        'SELECT menu FROM roles_menus WHERE idEmpresa = :idEmpresa AND idRol = :idRol ORDER BY menu',
        { replacements: { idRol }, transaction })).map(x => x.menu),
    acciones: (await db.empresa(req).query(
        'SELECT accion FROM roles_acciones WHERE idEmpresa = :idEmpresa AND idRol = :idRol ORDER BY accion',
        { replacements: { idRol }, transaction })).map(x => x.accion)
});

const guardarMarcados = async (req, idRol, { menus, acciones }, transaction) => {
    const o = { replacements: { idRol }, transaction };
    await db.empresa(req).query('DELETE FROM roles_menus WHERE idEmpresa = :idEmpresa AND idRol = :idRol', { ...o, type: QueryTypes.DELETE });
    await db.empresa(req).query('DELETE FROM roles_acciones WHERE idEmpresa = :idEmpresa AND idRol = :idRol', { ...o, type: QueryTypes.DELETE });
    for (const menu of menus) {
        await db.empresa(req).query('INSERT INTO roles_menus (idEmpresa, idRol, menu) VALUES (:idEmpresa, :idRol, :menu)',
            { replacements: { idRol, menu }, type: QueryTypes.INSERT, transaction });
    }
    for (const accion of acciones) {
        await db.empresa(req).query('INSERT INTO roles_acciones (idEmpresa, idRol, accion) VALUES (:idEmpresa, :idRol, :accion)',
            { replacements: { idRol, accion }, type: QueryTypes.INSERT, transaction });
    }
};

/** GET /api/roles/getRoles?estado=activos|todos */
const getRoles = async (req, res) => {
    try {
        const soloActivos = req.query.estado !== 'todos';
        const data = await db.empresa(req).query(`
            SELECT r.idRol, r.nombre, r.descripcion, r.bActivo, r.bProtegido, r.plantilla,
                   (SELECT COUNT(*)
                      FROM usuarios_empresa_roles uer
                      JOIN usuarios_empresa ue ON ue.idEmpresa = uer.idEmpresa AND ue.idUsuario = uer.idUsuario
                     WHERE uer.idEmpresa = :idEmpresa AND uer.idRol = r.idRol AND ue.bActivo = 1) AS usuarios
              FROM roles r
             WHERE r.idEmpresa = :idEmpresa AND (:soloActivos = 0 OR r.bActivo = 1)
             ORDER BY r.bProtegido DESC, r.bActivo DESC, r.nombre`, { replacements: { soloActivos: soloActivos ? 1 : 0 } });
        return ok(res, `${ data.length } rol(es)`, data);
    } catch (e) {
        return fallo(res, 'getRoles', e, 'No fue posible consultar los roles');
    }
};

/**
 * GET /api/roles/getCatalogoPermisos
 * Módulos contratados → menús → acciones, para la matriz, y lo que el
 * usuario de la sesión puede otorgar (lo demás se ve deshabilitado).
 */
const getCatalogoPermisos = async (req, res) => {
    try {
        const modulos = await modulosDe(req);
        const filas = await db.global.query(`
            SELECT mo.modulo, mo.nombre AS moduloNombre, cm.menu, cm.titulo, cm.icono,
                   a.accion, a.etiqueta
              FROM cat_menus cm
              JOIN cat_modulos mo ON mo.modulo = cm.modulo
              LEFT JOIN cat_acciones a ON a.menu = cm.menu
             WHERE cm.bActivo = 1 AND mo.bSiempre = 0 AND mo.modulo IN (:modulos)
             ORDER BY mo.orden, cm.orden, a.orden`, { replacements: { modulos } });
        const grupos = new Map();
        for (const f of filas) {
            if (!grupos.has(f.modulo)) grupos.set(f.modulo, { modulo: f.modulo, nombre: f.moduloNombre, menus: [] });
            const g = grupos.get(f.modulo);
            let m = g.menus.find(x => x.menu === f.menu);
            if (!m) { m = { menu: f.menu, titulo: f.titulo, icono: f.icono, acciones: [] }; g.menus.push(m); }
            if (f.accion) m.acciones.push({ accion: f.accion, etiqueta: f.etiqueta });
        }
        const p = await permisosDe(req);
        return ok(res, 'Catálogo de permisos', {
            modulos: [...grupos.values()],
            otorgables: { admin: p.admin, menus: [...p.menus], acciones: [...p.acciones] }
        });
    } catch (e) {
        return fallo(res, 'getCatalogoPermisos', e, 'No fue posible consultar el catálogo de permisos');
    }
};

/** GET /api/roles/getPermisosRol?idRol= */
const getPermisosRol = async (req, res) => {
    try {
        const rol = await rolDeEmpresa(req, req.query.idRol);
        if (!rol) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        const marcados = rol.bProtegido
            ? (({ menus, acciones }) => ({ menus: [...menus], acciones: [...acciones] }))(await permisosDeRol(req, rol.idRol))
            : await marcadosDeRol(req, rol.idRol);
        return ok(res, 'Permisos del rol', { rol, ...marcados });
    } catch (e) {
        return fallo(res, 'getPermisosRol', e, 'No fue posible consultar los permisos del rol');
    }
};

/** GET /api/roles/getMenuDeRol?idRol= ("Ver como") */
const getMenuDeRol = async (req, res) => {
    try {
        const p = await permisosDeRol(req, Number(req.query.idRol) || 0);
        if (!p) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        return ok(res, 'Menú del rol', await menuDe(req, p));
    } catch (e) {
        return fallo(res, 'getMenuDeRol', e, 'No fue posible armar el menú del rol');
    }
};

/** POST /api/roles/insertUpdateRol { idRol?, nombre, descripcion?, copiarDe? } */
const insertUpdateRol = async (req, res) => {
    const idRol = req.body.idRol ? Number(req.body.idRol) : null;
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    const descripcion = String(req.body.descripcion || '').trim() || null;
    try {
        const id = await db.transaccion(async (transaction) => {
            const [repetido] = await db.empresa(req).query(`
                SELECT idRol FROM roles WHERE idEmpresa = :idEmpresa AND nombre = :nombre AND idRol <> :idRol`,
            { replacements: { nombre, idRol: idRol || 0 }, transaction });
            if (repetido) throw new Regla(`Ya existe un rol llamado "${ nombre }"`);

            if (idRol) {
                const rol = await rolDeEmpresa(req, idRol, transaction);
                if (!rol) throw new Regla(MSG_NO_EXISTE);
                if (rol.bProtegido) throw new Regla(MSG_PROTEGIDO);
                await db.empresa(req).query(`
                    UPDATE roles SET nombre = :nombre, descripcion = :descripcion
                     WHERE idEmpresa = :idEmpresa AND idRol = :idRol`,
                { replacements: { nombre, descripcion, idRol }, type: QueryTypes.UPDATE, transaction });
                await registrar(req, { tipo: 'ROL_EDITADO', idRol, descripcion: `Rol "${ rol.nombre }" editado`,
                    antes: { nombre: rol.nombre, descripcion: rol.descripcion }, despues: { nombre, descripcion } }, transaction);
                return idRol;
            }

            let copia = null;
            if (req.body.copiarDe) {
                const origen = await rolDeEmpresa(req, req.body.copiarDe, transaction);
                if (!origen) throw new Regla('El rol a copiar no existe');
                const otorgante = req.permisos;
                if (!otorgante.acciones.has('roles_Permisos') && !otorgante.admin) {
                    throw new Regla('Para copiar los permisos de un rol necesitas el permiso de asignar permisos');
                }
                if (!contiene(otorgante, await permisosDeRol(req, origen.idRol))) {
                    throw new Regla(`No puedes copiar "${ origen.nombre }": tiene permisos que tú no tienes`);
                }
                copia = origen.bProtegido
                    ? (({ menus, acciones }) => ({ menus: [...menus], acciones: [...acciones] }))(await permisosDeRol(req, origen.idRol))
                    : await marcadosDeRol(req, origen.idRol, transaction);
                copia = await prepararCambio(req, { menus: [], acciones: [] }, copia, { admin: true });
            }

            const [nuevo] = await db.empresa(req).query(`
                INSERT INTO roles (idEmpresa, nombre, descripcion) VALUES (:idEmpresa, :nombre, :descripcion)`,
            { replacements: { nombre, descripcion }, type: QueryTypes.INSERT, transaction });
            if (copia) await guardarMarcados(req, nuevo, copia, transaction);
            await registrar(req, { tipo: 'ROL_CREADO', idRol: nuevo, descripcion: `Rol "${ nombre }" creado`,
                despues: { nombre, descripcion, copiadoDe: req.body.copiarDe || null, ...(copia || {}) } }, transaction);
            return nuevo;
        });
        return ok(res, idRol ? 'Rol actualizado correctamente' : 'Rol creado correctamente', { id });
    } catch (e) {
        if (e?.original?.errno === 1062) return res.json({ status_code: 1, message: `Ya existe un rol llamado "${ nombre }"`, data: null });
        return fallo(res, 'insertUpdateRol', e, 'No fue posible guardar el rol');
    }
};

/** PUT /api/roles/disableRol { idRol, bActivo } */
const disableRol = async (req, res) => {
    const bActivo = req.body.bActivo ? 1 : 0;
    try {
        const rol = await rolDeEmpresa(req, req.body.idRol);
        if (!rol) throw new Regla(MSG_NO_EXISTE);
        if (rol.bProtegido) throw new Regla(MSG_PROTEGIDO);
        // Activar o desactivar da o quita lo que el rol tiene: sin escalada.
        if (!contiene(req.permisos, await permisosDeRol(req, rol.idRol))) {
            throw new Regla(`No puedes ${ bActivo ? 'activar' : 'desactivar' } "${ rol.nombre }": tiene permisos que tú no tienes`);
        }
        await db.transaccion(async (transaction) => {
            await db.empresa(req).query('UPDATE roles SET bActivo = :bActivo WHERE idEmpresa = :idEmpresa AND idRol = :idRol',
                { replacements: { bActivo, idRol: rol.idRol }, type: QueryTypes.UPDATE, transaction });
            await registrar(req, { tipo: 'ROL_ESTADO', idRol: rol.idRol,
                descripcion: `Rol "${ rol.nombre }" ${ bActivo ? 'activado' : 'desactivado' }`,
                antes: { bActivo: rol.bActivo }, despues: { bActivo } }, transaction);
        });
        invalidarEmpresa(req.idEmpresa);
        return ok(res, bActivo ? `Rol ${ rol.nombre } activado` : `Rol ${ rol.nombre } desactivado: sus usuarios pierden lo que les daba`,
            { id: rol.idRol });
    } catch (e) {
        return fallo(res, 'disableRol', e, 'No fue posible cambiar el estado del rol');
    }
};

/** POST /api/roles/setPermisosRol { idRol, menus[], acciones[] } */
const setPermisosRol = async (req, res) => {
    try {
        const rol = await rolDeEmpresa(req, req.body.idRol);
        if (!rol) throw new Regla(MSG_NO_EXISTE);
        if (rol.bProtegido) throw new Regla(MSG_PROTEGIDO);
        await db.transaccion(async (transaction) => {
            const actual = await marcadosDeRol(req, rol.idRol, transaction);
            const nuevo = await prepararCambio(req, actual, req.body, req.permisos);
            await guardarMarcados(req, rol.idRol, nuevo, transaction);
            const cambios = { menus: diferencia(actual.menus, nuevo.menus), acciones: diferencia(actual.acciones, nuevo.acciones) };
            await registrar(req, { tipo: 'ROL_PERMISOS', idRol: rol.idRol,
                descripcion: `Permisos del rol "${ rol.nombre }": +${ cambios.menus.agregados.length + cambios.acciones.agregados.length } `
                    + `−${ cambios.menus.quitados.length + cambios.acciones.quitados.length }`,
                antes: actual, despues: nuevo }, transaction);
        });
        invalidarEmpresa(req.idEmpresa);
        return ok(res, 'Permisos del rol guardados. Aplican en la siguiente acción de sus usuarios.', { id: rol.idRol });
    } catch (e) {
        return fallo(res, 'setPermisosRol', e, 'No fue posible guardar los permisos del rol');
    }
};

/** GET /api/roles/getBitacoraPermisos?idRol=&idUsuario= (últimos 200) */
const getBitacoraPermisos = async (req, res) => {
    try {
        const data = await db.empresa(req).query(`
            SELECT b.idBitacora, b.tipo, b.idRol, b.idUsuario, b.descripcion, b.antes, b.despues, b.fecha,
                   b.idSesionSoporte, IF(b.idSesionSoporte IS NULL, a.nombre, 'Soporte') AS autor, af.nombre AS afectado
              FROM bitacora_permisos b
              LEFT JOIN usuarios a ON a.idUsuario = b.idUsuarioAutor
              LEFT JOIN usuarios af ON af.idUsuario = b.idUsuario
             WHERE b.idEmpresa = :idEmpresa
               AND (:idRol = 0 OR b.idRol = :idRol)
               AND (:idUsuario = 0 OR b.idUsuario = :idUsuario)
             ORDER BY b.idBitacora DESC
             LIMIT 200`, { replacements: { idRol: Number(req.query.idRol) || 0, idUsuario: Number(req.query.idUsuario) || 0 } });
        return ok(res, `${ data.length } movimiento(s)`, data);
    } catch (e) {
        return fallo(res, 'getBitacoraPermisos', e, 'No fue posible consultar la bitácora');
    }
};

module.exports = {
    getRoles, getCatalogoPermisos, getPermisosRol, getMenuDeRol,
    insertUpdateRol, disableRol, setPermisosRol, getBitacoraPermisos
};
