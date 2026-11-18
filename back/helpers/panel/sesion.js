// Sesión del panel del superadministrador (análisis 009).
const { db } = require('../db');

const MSG_PANEL = 'Tu sesión del panel terminó. Vuelve a entrar.';

/**
 * La cuenta del token, si sigue activa, con segundo factor y la misma
 * versión de sesión; si no, null. `idSuperadmin` sale de un token firmado.
 */
const cuentaVigente = async (idSuperadmin, version) => {
    const id = Number(idSuperadmin);
    if (!Number.isInteger(id) || id <= 0) return null;
    const [cuenta] = await db.panel({ idSuperadmin: id }).query(`
        SELECT idSuperadmin, correo, nombre, bActivo, versionSesion, totpSecreto, totpUltimoPaso, ultimoAcceso
          FROM superadmins WHERE idSuperadmin = :id`, { replacements: { id } });
    if (!cuenta || !cuenta.bActivo || !cuenta.totpSecreto || Number(cuenta.versionSesion) !== Number(version)) return null;
    return cuenta;
};

/** Lo que va en `req.superadmin` y lo que ve el Front de la sesión. */
const datosSuperadmin = (cuenta) => ({
    idSuperadmin: cuenta.idSuperadmin,
    nombre: cuenta.nombre,
    correo: cuenta.correo
});

/** Sesión inválida del panel: 401 con su propio código (el Front regresa a /panel/entrar). */
const sesionPanelInvalida = (res, message = MSG_PANEL) =>
    res.status(401).json({ status_code: 1, message, data: { codigo: 'SESION_PANEL_INVALIDA' } });

module.exports = { cuentaVigente, datosSuperadmin, sesionPanelInvalida };
