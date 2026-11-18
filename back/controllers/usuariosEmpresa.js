const { db, QueryTypes } = require('../helpers/db');
const { tokenSesion } = require('../helpers/jwt');
const { normalizarCorreo, correoValido, hashPassword, passwordValido, PASSWORD_MIN } = require('../helpers/sesion');
const { permisosDeRol, contiene, invalidar } = require('../helpers/userActions');
const { Regla, prepararCambio, administradoresActivos } = require('../helpers/permisosEdicion');
const { registrar, diferencia } = require('../helpers/bitacoraPermisos');

const MSG_NO_EXISTE = 'El usuario no existe en esta empresa';
const MSG_ULTIMO_ADMIN = 'La empresa debe conservar al menos un usuario activo con el rol Administrador';

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const regla = (res, message, data = null) => res.json({ status_code: 1, message, data });
const error = (res, nombre, e, message) => {
    if (e instanceof Regla) return regla(res, e.message, e.data);
    console.error(nombre, e);
    return res.json({ status_code: 2, message, data: null });
};

// ── Sucursales del acceso ────────────────────────────────────────────────────

/** Sucursales pedidas: únicas y activas de ESTA empresa. Si no, "no existe". */
const validarSucursales = async (req, ids, transaction) => {
    const unicas = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!unicas.length) throw new Regla('Escoge al menos una sucursal o marca "Todas"');
    const filas = await db.empresa(req).query(`
        SELECT idSucursal FROM sucursales
         WHERE idEmpresa = :idEmpresa AND bActivo = 1 AND idSucursal IN (:ids)`,
    { replacements: { ids: unicas }, transaction });
    if (filas.length !== unicas.length) throw new Regla('Una de las sucursales no existe');
    return unicas;
};

/** Reemplaza las sucursales del acceso (vacío si tiene todas). */
const guardarSucursales = async (req, idUsuario, todas, ids, transaction) => {
    await db.empresa(req).query(
        'DELETE FROM usuarios_empresa_sucursales WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario',
        { replacements: { idUsuario }, type: QueryTypes.DELETE, transaction });
    if (todas) return;
    for (const idSucursal of ids) {
        await db.empresa(req).query(`
            INSERT INTO usuarios_empresa_sucursales (idEmpresa, idUsuario, idSucursal)
            VALUES (:idEmpresa, :idUsuario, :idSucursal)`,
        { replacements: { idUsuario, idSucursal }, type: QueryTypes.INSERT, transaction });
    }
};

// ── Roles del acceso ─────────────────────────────────────────────────────────

/** Roles pedidos: únicos, activos y de ESTA empresa. Si no, "no existe". */
const validarRoles = async (req, ids, transaction) => {
    const unicos = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!unicos.length) return [];
    const filas = await db.empresa(req).query(`
        SELECT idRol, nombre, bProtegido FROM roles
         WHERE idEmpresa = :idEmpresa AND bActivo = 1 AND idRol IN (:ids)`,
    { replacements: { ids: unicos }, transaction });
    if (filas.length !== unicos.length) throw new Regla('Uno de los roles no existe');
    return filas;
};

const rolesDeUsuario = async (req, idUsuario, transaction) => db.empresa(req).query(`
    SELECT r.idRol, r.nombre, r.bProtegido, r.bActivo
      FROM usuarios_empresa_roles uer
      JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
     WHERE uer.idEmpresa = :idEmpresa AND uer.idUsuario = :idUsuario`,
{ replacements: { idUsuario }, transaction });

/** Sin escalada: cada rol que se agrega o se quita debe estar contenido en lo que tiene quien lo cambia. */
const revisarEscaladaRoles = async (req, antes, despues) => {
    const { agregados, quitados } = diferencia(antes.map(r => r.idRol), despues.map(r => r.idRol));
    const todos = [...antes, ...despues];
    for (const idRol of [...agregados, ...quitados]) {
        if (!contiene(req.permisos, await permisosDeRol(req, idRol))) {
            const nombre = todos.find(r => r.idRol === idRol)?.nombre || 'ese rol';
            throw new Regla(`No puedes ${ agregados.includes(idRol) ? 'asignar' : 'quitar' } el rol "${ nombre }": tiene permisos que tú no tienes`);
        }
    }
    return { agregados, quitados };
};

const guardarRoles = async (req, idUsuario, roles, transaction) => {
    await db.empresa(req).query(
        'DELETE FROM usuarios_empresa_roles WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario',
        { replacements: { idUsuario }, type: QueryTypes.DELETE, transaction });
    for (const r of roles) {
        await db.empresa(req).query(`
            INSERT INTO usuarios_empresa_roles (idEmpresa, idUsuario, idRol) VALUES (:idEmpresa, :idUsuario, :idRol)`,
        { replacements: { idUsuario, idRol: r.idRol }, type: QueryTypes.INSERT, transaction });
    }
};

// ── Permisos directos ────────────────────────────────────────────────────────

const directosDe = async (req, idUsuario, transaction) => ({
    menus: (await db.empresa(req).query(
        'SELECT menu FROM usuarios_empresa_menus WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario ORDER BY menu',
        { replacements: { idUsuario }, transaction })).map(x => x.menu),
    acciones: (await db.empresa(req).query(
        'SELECT accion FROM usuarios_empresa_acciones WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario ORDER BY accion',
        { replacements: { idUsuario }, transaction })).map(x => x.accion)
});

/** ¿Con estos roles y sus permisos directos conservaría una acción? (para no quitarse a sí mismo) */
const conservaAccion = async (req, roles, directos, accion) => {
    if (directos.acciones.includes(accion)) return true;
    for (const r of roles) {
        const p = await permisosDeRol(req, r.idRol);
        if (p && p.acciones.has(accion)) return true;
    }
    return false;
};

// ── Otros ────────────────────────────────────────────────────────────────────

/** Acceso activo de un usuario en ESTA empresa (o undefined). */
const accesoEnEmpresa = async (req, idUsuario, transaction) => {
    const [fila] = await db.empresa(req).query(`
        SELECT ue.idUsuario, ue.bTodasSucursales, ue.versionSesion, u.nombre
          FROM usuarios_empresa ue JOIN usuarios u ON u.idUsuario = ue.idUsuario
         WHERE ue.idEmpresa = :idEmpresa AND ue.idUsuario = :idUsuario AND ue.bActivo = 1`,
    { replacements: { idUsuario }, transaction });
    return fila;
};

/** Token nuevo para quien cambia su propia contraseña desde aquí. */
const tokenPropio = async (req) => {
    const [f] = await db.empresa(req).query(`
        SELECT u.versionSesion AS vCuenta, ue.versionSesion AS vAcceso
          FROM usuarios_empresa ue JOIN usuarios u ON u.idUsuario = ue.idUsuario
         WHERE ue.idEmpresa = :idEmpresa AND ue.idUsuario = :uid`, { replacements: { uid: req.uid } });
    return tokenSesion({ idUsuario: req.uid, idEmpresa: req.idEmpresa, versionCuenta: f.vCuenta, versionAcceso: f.vAcceso });
};

// ── Endpoints ────────────────────────────────────────────────────────────────

/** GET /api/usuariosEmpresa/getUsuariosEmpresa */
const getUsuariosEmpresa = async (req, res) => {
    try {
        const data = await db.empresa(req).query(`
            SELECT u.idUsuario, u.correo, u.nombre, u.bActivo AS cuentaActiva,
                   ue.bTodasSucursales, ue.fechaAlta,
                   (SELECT GROUP_CONCAT(s.idSucursal ORDER BY s.nombre)
                      FROM usuarios_empresa_sucursales x
                      JOIN sucursales s ON s.idEmpresa = x.idEmpresa AND s.idSucursal = x.idSucursal
                     WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = ue.idUsuario) AS idsSucursales,
                   (SELECT GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ')
                      FROM usuarios_empresa_sucursales x
                      JOIN sucursales s ON s.idEmpresa = x.idEmpresa AND s.idSucursal = x.idSucursal
                     WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = ue.idUsuario) AS sucursalesNombres,
                   (SELECT GROUP_CONCAT(r.idRol ORDER BY r.nombre)
                      FROM usuarios_empresa_roles uer
                      JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
                     WHERE uer.idEmpresa = :idEmpresa AND uer.idUsuario = ue.idUsuario) AS idsRoles,
                   (SELECT GROUP_CONCAT(CONCAT(r.nombre, IF(r.bActivo = 1, '', ' (inactivo)')) ORDER BY r.nombre SEPARATOR ', ')
                      FROM usuarios_empresa_roles uer
                      JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
                     WHERE uer.idEmpresa = :idEmpresa AND uer.idUsuario = ue.idUsuario) AS rolesNombres,
                   EXISTS (SELECT 1
                             FROM usuarios_empresa_roles uer
                             JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
                            WHERE uer.idEmpresa = :idEmpresa AND uer.idUsuario = ue.idUsuario
                              AND r.bProtegido = 1 AND r.bActivo = 1) AS esAdministrador,
                   (SELECT COUNT(*) FROM usuarios_empresa_menus x
                     WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = ue.idUsuario)
                 + (SELECT COUNT(*) FROM usuarios_empresa_acciones x
                     WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = ue.idUsuario) AS permisosDirectos
              FROM usuarios_empresa ue
              JOIN usuarios u ON u.idUsuario = ue.idUsuario
             WHERE ue.idEmpresa = :idEmpresa AND ue.bActivo = 1
             ORDER BY u.nombre`);
        for (const f of data) {
            f.sucursales = f.idsSucursales ? String(f.idsSucursales).split(',').map(Number) : [];
            f.roles = f.idsRoles ? String(f.idsRoles).split(',').map(Number) : [];
            delete f.idsSucursales;
            delete f.idsRoles;
            f.esAdministrador = !!Number(f.esAdministrador);
            f.permisosDirectos = Number(f.permisosDirectos);
            f.esYo = f.idUsuario === req.uid;
        }
        return ok(res, `${ data.length } usuario(s)`, data);
    } catch (e) {
        return error(res, 'getUsuariosEmpresa', e, 'No fue posible consultar los usuarios');
    }
};

/**
 * POST /api/usuariosEmpresa/darAcceso
 * { correo, nombre?, password?, roles[], bTodasSucursales, sucursales[] }
 * Correo existente → liga la cuenta (sin tocar su nombre ni su contraseña).
 * Correo nuevo → crea la cuenta con nombre y contraseña inicial.
 */
const darAcceso = async (req, res) => {
    const correo = normalizarCorreo(req.body.correo);
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    const password = req.body.password;
    const todas = req.body.bTodasSucursales !== false && req.body.bTodasSucursales !== 0;
    if (!correoValido(correo)) return regla(res, 'Escribe un correo válido');
    try {
        const resultado = await db.transaccion(async (transaction) => {
            const ids = todas ? [] : await validarSucursales(req, req.body.sucursales, transaction);
            const roles = await validarRoles(req, req.body.roles, transaction);
            await revisarEscaladaRoles(req, [], roles);

            let [cuenta] = await db.global.query(
                'SELECT idUsuario, nombre, bActivo FROM usuarios WHERE correo = :correo',
                { replacements: { correo }, transaction });
            let creada = false;

            if (!cuenta) {
                if (!nombre || !password) {
                    throw new Regla('No hay una cuenta con ese correo. Escribe su nombre y una contraseña inicial para crearla.',
                        { requiereDatos: true });
                }
                if (!passwordValido(password)) throw new Regla(`La contraseña inicial debe tener al menos ${ PASSWORD_MIN } caracteres`);
                const [idUsuario] = await db.global.query(`
                    INSERT INTO usuarios (correo, passwordHash, nombre) VALUES (:correo, :hash, :nombre)`,
                { replacements: { correo, hash: hashPassword(password), nombre }, type: QueryTypes.INSERT, transaction });
                cuenta = { idUsuario, nombre, bActivo: 1 };
                creada = true;
            }
            if (!cuenta.bActivo) throw new Regla('Esa cuenta está desactivada en el sistema');

            const [previo] = await db.empresa(req).query(`
                SELECT bActivo FROM usuarios_empresa WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario`,
            { replacements: { idUsuario: cuenta.idUsuario }, transaction });
            if (previo?.bActivo) throw new Regla(`${ cuenta.nombre } ya tiene acceso a esta empresa`);

            if (previo) {
                await db.empresa(req).query(`
                    UPDATE usuarios_empresa
                       SET bActivo = 1, bTodasSucursales = :todas, versionSesion = versionSesion + 1
                     WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario`,
                { replacements: { idUsuario: cuenta.idUsuario, todas: todas ? 1 : 0 }, type: QueryTypes.UPDATE, transaction });
            } else {
                await db.empresa(req).query(`
                    INSERT INTO usuarios_empresa (idEmpresa, idUsuario, bTodasSucursales)
                    VALUES (:idEmpresa, :idUsuario, :todas)`,
                { replacements: { idUsuario: cuenta.idUsuario, todas: todas ? 1 : 0 }, type: QueryTypes.INSERT, transaction });
            }
            await guardarSucursales(req, cuenta.idUsuario, todas, ids, transaction);
            await guardarRoles(req, cuenta.idUsuario, roles, transaction);
            await registrar(req, { tipo: 'USUARIO_ROLES', idUsuario: cuenta.idUsuario,
                descripcion: `Acceso dado a ${ cuenta.nombre }`, antes: null, despues: { roles: roles.map(r => r.nombre) } }, transaction);
            return { cuenta, creada };
        });

        const { cuenta, creada } = resultado;
        invalidar(req.idEmpresa, cuenta.idUsuario);
        return ok(res, creada
            ? `Cuenta creada y con acceso: ${ cuenta.nombre }. Entrégale su contraseña inicial.`
            : `Se dio acceso a la cuenta existente de ${ cuenta.nombre }`,
        { id: cuenta.idUsuario, creada });
    } catch (e) {
        return error(res, 'darAcceso', e, 'No fue posible dar el acceso');
    }
};

/**
 * POST /api/usuariosEmpresa/updateUsuarioEmpresa { idUsuario, roles[], bTodasSucursales, sucursales[] }
 * El cambio aplica en la siguiente petición del usuario, sin cerrar su sesión.
 */
const updateUsuarioEmpresa = async (req, res) => {
    const idUsuario = Number(req.body.idUsuario);
    const todas = !!req.body.bTodasSucursales;
    try {
        await db.transaccion(async (transaction) => {
            const acceso = await accesoEnEmpresa(req, idUsuario, transaction);
            if (!acceso) throw new Regla(MSG_NO_EXISTE);
            const ids = todas ? [] : await validarSucursales(req, req.body.sucursales, transaction);
            const antes = await rolesDeUsuario(req, idUsuario, transaction);
            // Un rol inactivo que el usuario ya tenía se conserva aunque no venga en la lista.
            const pedidos = await validarRoles(req, req.body.roles, transaction);
            const inactivos = antes.filter(r => !r.bActivo);
            const despues = [...pedidos, ...inactivos.filter(r => !pedidos.some(p => p.idRol === r.idRol))];
            const { agregados, quitados } = await revisarEscaladaRoles(req, antes, despues);

            const perdiaAdmin = antes.some(r => r.bProtegido && r.bActivo) && !despues.some(r => r.bProtegido);
            if (perdiaAdmin && await administradoresActivos(req, idUsuario, transaction) === 0) {
                throw new Regla(MSG_ULTIMO_ADMIN);
            }
            if (idUsuario === req.uid && req.permisos.acciones.has('usuarios_Editar')
                && !await conservaAccion(req, despues, await directosDe(req, idUsuario, transaction), 'usuarios_Editar')) {
                throw new Regla('No puedes quitarte el último rol que te permite administrar usuarios');
            }

            await db.empresa(req).query(`
                UPDATE usuarios_empresa SET bTodasSucursales = :todas
                 WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario`,
            { replacements: { idUsuario, todas: todas ? 1 : 0 }, type: QueryTypes.UPDATE, transaction });
            await guardarSucursales(req, idUsuario, todas, ids, transaction);
            if (agregados.length || quitados.length) {
                await guardarRoles(req, idUsuario, despues, transaction);
                await registrar(req, { tipo: 'USUARIO_ROLES', idUsuario, descripcion: `Roles de ${ acceso.nombre }`,
                    antes: { roles: antes.map(r => r.nombre).sort() }, despues: { roles: despues.map(r => r.nombre).sort() } }, transaction);
            }
        });
        invalidar(req.idEmpresa, idUsuario);
        return ok(res, 'Acceso actualizado. Aplica en la siguiente acción del usuario.', { id: idUsuario });
    } catch (e) {
        return error(res, 'updateUsuarioEmpresa', e, 'No fue posible actualizar el acceso');
    }
};

/** GET /api/usuariosEmpresa/getPermisosDirectos?idUsuario= */
const getPermisosDirectos = async (req, res) => {
    try {
        const idUsuario = Number(req.query.idUsuario) || 0;
        if (!await accesoEnEmpresa(req, idUsuario)) return regla(res, MSG_NO_EXISTE);
        // También lo que ya le dan sus roles activos, para que la pantalla lo
        // muestre como "por su rol" y no se dé dos veces.
        const menus = new Set(), acciones = new Set();
        for (const r of (await rolesDeUsuario(req, idUsuario)).filter(x => x.bActivo)) {
            const p = await permisosDeRol(req, r.idRol);
            if (!p) continue;
            p.menus.forEach(m => menus.add(m));
            p.acciones.forEach(a => acciones.add(a));
        }
        return ok(res, 'Permisos directos', {
            ...(await directosDe(req, idUsuario)),
            porRoles: { menus: [...menus].sort(), acciones: [...acciones].sort() }
        });
    } catch (e) {
        return error(res, 'getPermisosDirectos', e, 'No fue posible consultar los permisos directos');
    }
};

/** POST /api/usuariosEmpresa/setPermisosDirectos { idUsuario, menus[], acciones[] } */
const setPermisosDirectos = async (req, res) => {
    const idUsuario = Number(req.body.idUsuario);
    try {
        if (idUsuario === req.uid) throw new Regla('No puedes cambiar tus propios permisos directos');
        await db.transaccion(async (transaction) => {
            const acceso = await accesoEnEmpresa(req, idUsuario, transaction);
            if (!acceso) throw new Regla(MSG_NO_EXISTE);
            const actual = await directosDe(req, idUsuario, transaction);
            const nuevo = await prepararCambio(req, actual, req.body, req.permisos);
            const o = { replacements: { idUsuario }, transaction, type: QueryTypes.DELETE };
            await db.empresa(req).query('DELETE FROM usuarios_empresa_menus WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario', o);
            await db.empresa(req).query('DELETE FROM usuarios_empresa_acciones WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario', o);
            for (const menu of nuevo.menus) {
                await db.empresa(req).query(`
                    INSERT INTO usuarios_empresa_menus (idEmpresa, idUsuario, menu) VALUES (:idEmpresa, :idUsuario, :menu)`,
                { replacements: { idUsuario, menu }, type: QueryTypes.INSERT, transaction });
            }
            for (const accion of nuevo.acciones) {
                await db.empresa(req).query(`
                    INSERT INTO usuarios_empresa_acciones (idEmpresa, idUsuario, accion) VALUES (:idEmpresa, :idUsuario, :accion)`,
                { replacements: { idUsuario, accion }, type: QueryTypes.INSERT, transaction });
            }
            await registrar(req, { tipo: 'USUARIO_PERMISOS', idUsuario, descripcion: `Permisos directos de ${ acceso.nombre }`,
                antes: actual, despues: nuevo }, transaction);
        });
        invalidar(req.idEmpresa, idUsuario);
        return ok(res, 'Permisos directos guardados. Aplican en la siguiente acción del usuario.', { id: idUsuario });
    } catch (e) {
        return error(res, 'setPermisosDirectos', e, 'No fue posible guardar los permisos directos');
    }
};

/** PUT /api/usuariosEmpresa/quitarAcceso { idUsuario } — la cuenta sigue en sus otras empresas. */
const quitarAcceso = async (req, res) => {
    const idUsuario = Number(req.body.idUsuario);
    try {
        if (idUsuario === req.uid) return regla(res, 'No puedes quitarte a ti mismo el acceso');
        const acceso = await accesoEnEmpresa(req, idUsuario);
        if (!acceso) return regla(res, MSG_NO_EXISTE);
        const roles = await rolesDeUsuario(req, idUsuario);
        if (roles.some(r => r.bProtegido && r.bActivo) && await administradoresActivos(req, idUsuario) === 0) {
            return regla(res, MSG_ULTIMO_ADMIN);
        }
        // Quitar el acceso a alguien con más permisos que uno mismo también es escalada.
        for (const r of roles.filter(x => x.bActivo)) {
            if (!contiene(req.permisos, await permisosDeRol(req, r.idRol))) {
                return regla(res, `No puedes quitar el acceso a ${ acceso.nombre }: tiene el rol "${ r.nombre }", con permisos que tú no tienes`);
            }
        }
        await db.empresa(req).query(`
            UPDATE usuarios_empresa SET bActivo = 0, versionSesion = versionSesion + 1
             WHERE idEmpresa = :idEmpresa AND idUsuario = :idUsuario`,
        { replacements: { idUsuario }, type: QueryTypes.UPDATE });
        invalidar(req.idEmpresa, idUsuario);
        return ok(res, 'Acceso quitado. La cuenta conserva sus otras empresas.', { id: idUsuario });
    } catch (e) {
        return error(res, 'quitarAcceso', e, 'No fue posible quitar el acceso');
    }
};

/**
 * PUT /api/usuariosEmpresa/restablecerPassword { idUsuario, password }
 * Solo si la cuenta pertenece ÚNICAMENTE a esta empresa: la contraseña es
 * global, y el administrador de A no debe cambiar con qué entra esa persona
 * a la empresa B (tareas/001, Notas).
 */
const restablecerPassword = async (req, res) => {
    const idUsuario = Number(req.body.idUsuario);
    const { password } = req.body;
    try {
        if (!passwordValido(password)) return regla(res, `La contraseña debe tener al menos ${ PASSWORD_MIN } caracteres`);
        const acceso = await accesoEnEmpresa(req, idUsuario);
        if (!acceso) return regla(res, MSG_NO_EXISTE);

        const [otras] = await db.sinEmpresa.query(`
            SELECT /* sin-empresa: saber si la cuenta entra a otras empresas antes de cambiar su contraseña global */
                   COUNT(*) AS n
              FROM usuarios_empresa
             WHERE idUsuario = :idUsuario AND idEmpresa <> :idEmpresa AND bActivo = 1`,
        { replacements: { idUsuario, idEmpresa: req.idEmpresa } });
        if (Number(otras.n) > 0) {
            return regla(res, 'Esta cuenta también entra a otras empresas: su contraseña la cambia la propia persona en Mi cuenta.');
        }

        await db.global.query(`
            UPDATE usuarios SET passwordHash = :hash, versionSesion = versionSesion + 1 WHERE idUsuario = :idUsuario`,
        { replacements: { idUsuario, hash: hashPassword(password) }, type: QueryTypes.UPDATE });
        const token = idUsuario === req.uid ? await tokenPropio(req) : undefined;
        return ok(res, 'Contraseña restablecida. Entrégasela al usuario.', { id: idUsuario, token });
    } catch (e) {
        return error(res, 'restablecerPassword', e, 'No fue posible restablecer la contraseña');
    }
};

module.exports = {
    getUsuariosEmpresa, darAcceso, updateUsuarioEmpresa, getPermisosDirectos, setPermisosDirectos,
    quitarAcceso, restablecerPassword
};
