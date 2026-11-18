const { db } = require('../helpers/db');
const { leerToken } = require('../helpers/jwt');
const { sesionVigente } = require('../helpers/panel/soporte');

// Sesión inválida: único caso que responde 401 (el interceptor del Front lo
// usa para mandar al login). El cuerpo conserva el formato estándar.
const sesionInvalida = (res, message = 'Tu sesión terminó. Vuelve a entrar.', codigo = 'SESION_INVALIDA') =>
    res.status(401).json({ status_code: 1, message, data: { codigo } });

const MSG_ESTADO = {
    SUSPENDIDA: 'La empresa está suspendida.',
    EN_BAJA: 'La empresa fue dada de baja.',
    ELIMINADA: 'La empresa fue dada de baja.'
};

/**
 * Sesión de soporte (009, T25): el superadministrador dentro de una empresa.
 * Sin usuario (`req.uid = null`), con `req.soporte`, todas las sucursales
 * activas y todo lo de los módulos contratados (helpers/userActions.js).
 */
const validarSoporte = async (p, req, res, next) => {
    const s = await sesionVigente(p);
    if (!s) return sesionInvalida(res, 'La sesión de soporte terminó.', 'SESION_SOPORTE_INVALIDA');
    req.idEmpresa = s.idEmpresa;
    req.uid = null;
    req.soporte = { idSesionSoporte: s.idSesionSoporte, idSuperadmin: s.idSuperadmin, nombre: s.nombre,
        motivo: s.motivo, vence: s.vence, empresa: s.empresa };
    req.todasSucursales = true;
    req.sucursalesPermitidas = s.sucursales;
    next();
};

/**
 * Valida el token de sesión y pone en `req`:
 *   uid, idEmpresa (LA ÚNICA empresa que usa el servidor, LP-1),
 *   todasSucursales y sucursalesPermitidas (ids activos).
 *
 * En cada petición confirma contra la base que la cuenta y su acceso a la
 * empresa siguen activos, que la empresa no está suspendida y que las
 * versiones de sesión coinciden: quitar el acceso, desactivar o cambiar la
 * contraseña invalida el token en la siguiente petición.
 *
 * También acepta el token `soporte` (009): ver validarSoporte.
 */
const validarJWT = async (req, res, next) => {
    const p = leerToken(req.header('x-token'));
    try {
        if (p?.t === 'soporte') return await validarSoporte(p, req, res, next);
    } catch (error) {
        console.error('validarJWT (soporte)', error);
        return res.json({ status_code: 2, message: 'No fue posible validar la sesión', data: null });
    }
    if (!p || p.t !== 'sesion' || !p.uid || !p.e) return sesionInvalida(res);

    req.idEmpresa = Number(p.e);
    try {
        const [fila] = await db.empresa(req).query(`
            SELECT u.idUsuario, u.bActivo AS cuentaActiva, u.versionSesion AS vCuenta,
                   ue.bActivo AS accesoActivo, ue.versionSesion AS vAcceso,
                   ue.bTodasSucursales, e.estado,
                   (SELECT GROUP_CONCAT(s.idSucursal)
                      FROM sucursales s
                     WHERE s.idEmpresa = :idEmpresa AND s.bActivo = 1
                       AND (ue.bTodasSucursales = 1 OR EXISTS (
                            SELECT 1 FROM usuarios_empresa_sucursales x
                             WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = ue.idUsuario
                               AND x.idSucursal = s.idSucursal))) AS sucursales
              FROM usuarios_empresa ue
              JOIN usuarios u ON u.idUsuario = ue.idUsuario
              JOIN empresas e ON e.idEmpresa = ue.idEmpresa
             WHERE ue.idEmpresa = :idEmpresa AND ue.idUsuario = :uid`, { replacements: { uid: p.uid } });

        if (!fila || !fila.cuentaActiva || !fila.accesoActivo
            || Number(fila.vCuenta) !== Number(p.v) || Number(fila.vAcceso) !== Number(p.ve)) {
            return sesionInvalida(res);
        }
        if (fila.estado !== 'ACTIVA') return sesionInvalida(res, MSG_ESTADO[fila.estado] || MSG_ESTADO.SUSPENDIDA);

        req.uid = Number(p.uid);
        req.todasSucursales = !!fila.bTodasSucursales;
        req.sucursalesPermitidas = fila.sucursales ? String(fila.sucursales).split(',').map(Number) : [];
        next();
    } catch (error) {
        console.error('validarJWT', error);
        return res.json({ status_code: 2, message: 'No fue posible validar la sesión', data: null });
    }
};

/**
 * Lo personal (Mi cuenta, contraseña, preferencias) no aplica en una sesión
 * de soporte: no hay usuario. Va después de validarJWT.
 */
const sinSoporte = (req, res, next) => (req.soporte
    ? res.json({ status_code: 1, message: 'No aplica en una sesión de soporte', data: { codigo: 'NO_APLICA_SOPORTE' } })
    : next());

module.exports = { validarJWT, sesionInvalida, sinSoporte };
