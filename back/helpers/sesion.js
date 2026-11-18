const bcrypt = require('bcryptjs');
const { db, QueryTypes } = require('./db');

const PASSWORD_MIN = 8;

/** El correo se guarda y compara en minúsculas y sin espacios. */
const normalizarCorreo = (correo) => String(correo || '').replace(/\s+/g, '').toLowerCase();

const correoValido = (correo) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo);

const hashPassword = (password) => bcrypt.hashSync(String(password), bcrypt.genSaltSync(10));

const passwordValido = (password) => typeof password === 'string' && password.length >= PASSWORD_MIN;

/** Bitácora de sesiones (global). Nunca rompe el login si falla. */
const registrarBitacora = async ({ correo, idUsuario = null, idEmpresa = null, ip = null, resultado, motivo = null }) => {
    try {
        await db.global.query(`
            INSERT INTO bitacora_sesiones (correo, idUsuario, idEmpresa, ip, resultado, motivo)
            VALUES (:correo, :idUsuario, :idEmpresa, :ip, :resultado, :motivo)`, {
            replacements: { correo: String(correo || '').slice(0, 150), idUsuario, idEmpresa, ip, resultado, motivo },
            type: QueryTypes.INSERT
        });
    } catch (error) {
        console.error('registrarBitacora', error);
    }
};

/** Empresas a las que la cuenta tiene acceso activo (cruza empresas a propósito). */
const empresasDeUsuario = (idUsuario) => db.sinEmpresa.query(`
    SELECT /* sin-empresa: las empresas de una cuenta, para entrar y para el selector */
           e.idEmpresa, e.nombreComercial AS nombre, e.estado, ue.versionSesion AS vAcceso
      FROM usuarios_empresa ue
      JOIN empresas e ON e.idEmpresa = ue.idEmpresa
     WHERE ue.idUsuario = :idUsuario AND ue.bActivo = 1
     ORDER BY e.nombreComercial`, { replacements: { idUsuario } });

/**
 * Lo que el Front necesita de la sesión: usuario, empresa actual, sus otras
 * empresas activas y las sucursales a las que tiene acceso. Los permisos
 * van aparte (global/getMenu y global/getUserActions). `req` ya pasó por validarJWT (o trae uid/idEmpresa equivalentes).
 */
const datosSesion = async (req) => {
    if (req.soporte) return datosSesionSoporte(req);
    const [usuario] = await db.global.query(
        'SELECT idUsuario, nombre, correo FROM usuarios WHERE idUsuario = :uid',
        { replacements: { uid: req.uid } });

    const [acceso] = await db.empresa(req).query(`
        SELECT e.idEmpresa, e.nombreComercial AS nombre, ue.bTodasSucursales
          FROM usuarios_empresa ue
          JOIN empresas e ON e.idEmpresa = ue.idEmpresa
         WHERE ue.idEmpresa = :idEmpresa AND ue.idUsuario = :uid`, { replacements: { uid: req.uid } });

    const sucursales = await db.empresa(req).query(`
        SELECT s.idSucursal, s.nombre, s.zonaHoraria
          FROM sucursales s
         WHERE s.idEmpresa = :idEmpresa AND s.bActivo = 1
           AND (:todas = 1 OR EXISTS (
                SELECT 1 FROM usuarios_empresa_sucursales x
                 WHERE x.idEmpresa = :idEmpresa AND x.idUsuario = :uid AND x.idSucursal = s.idSucursal))
         ORDER BY s.nombre`, { replacements: { uid: req.uid, todas: acceso?.bTodasSucursales ? 1 : 0 } });

    const empresas = (await empresasDeUsuario(req.uid))
        .filter(e => e.estado === 'ACTIVA')
        .map(({ idEmpresa, nombre }) => ({ idEmpresa, nombre }));

    return {
        usuario,
        empresa: acceso ? { idEmpresa: acceso.idEmpresa, nombre: acceso.nombre } : null,
        empresas,
        todasSucursales: !!acceso?.bTodasSucursales,
        sucursales,
        soporte: null
    };
};

/**
 * Sesión de soporte (009): sin usuario de la empresa. El nombre es "Soporte",
 * todas las sucursales activas y `soporte` con la empresa y cuándo vence.
 */
async function datosSesionSoporte(req) {
    const sucursales = await db.empresa(req).query(`
        SELECT s.idSucursal, s.nombre, s.zonaHoraria
          FROM sucursales s
         WHERE s.idEmpresa = :idEmpresa AND s.bActivo = 1
         ORDER BY s.nombre`);
    const { idSesionSoporte, nombre, motivo, vence, empresa } = req.soporte;
    return {
        usuario: { idUsuario: null, nombre: 'Soporte', correo: null },
        empresa: { idEmpresa: req.idEmpresa, nombre: empresa },
        empresas: [],
        todasSucursales: true,
        sucursales,
        soporte: { idSesionSoporte, empresa, vence, superadmin: nombre, motivo }
    };
}

/**
 * Sucursales que el usuario de la sesión puede ver y cambiar (001):
 * { todas: true } o { todas: false, ids: Set }.
 */
const alcanceSucursales = async (req, transaction) => {
    // Sesión de soporte (009): todas las sucursales.
    if (req.soporte) return { todas: true, ids: null, incluye: () => true };
    const [acceso] = await db.empresa(req).query(`
        SELECT bTodasSucursales FROM usuarios_empresa
         WHERE idEmpresa = :idEmpresa AND idUsuario = :uid`, { replacements: { uid: req.uid }, transaction });
    if (acceso?.bTodasSucursales) return { todas: true, ids: null, incluye: () => true };
    const ids = new Set((await db.empresa(req).query(`
        SELECT idSucursal FROM usuarios_empresa_sucursales
         WHERE idEmpresa = :idEmpresa AND idUsuario = :uid`, { replacements: { uid: req.uid }, transaction }))
        .map(x => x.idSucursal));
    return { todas: false, ids, incluye: (id) => ids.has(Number(id)) };
};

module.exports = {
    PASSWORD_MIN, normalizarCorreo, correoValido, hashPassword, passwordValido,
    registrarBitacora, empresasDeUsuario, datosSesion, alcanceSucursales
};
