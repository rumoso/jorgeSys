const bcrypt = require('bcryptjs');
const { db, QueryTypes } = require('../helpers/db');
const { tokenSesion } = require('../helpers/jwt');
const { hashPassword, passwordValido, PASSWORD_MIN } = require('../helpers/sesion');

// Mi cuenta: cualquier usuario con sesión, solo sobre SU cuenta (req.uid).
// La cuenta es global: el nombre y la contraseña valen en todas sus empresas.

/** GET /api/cuenta/getMiCuenta */
const getMiCuenta = async (req, res) => {
    try {
        const [data] = await db.global.query(
            'SELECT idUsuario, nombre, correo, fechaAlta FROM usuarios WHERE idUsuario = :uid',
            { replacements: { uid: req.uid } });
        return res.json({ status_code: 0, message: 'Mi cuenta', data });
    } catch (error) {
        console.error('getMiCuenta', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar tu cuenta', data: null });
    }
};

/** POST /api/cuenta/updateMiCuenta { nombre } */
const updateMiCuenta = async (req, res) => {
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    try {
        await db.global.query('UPDATE usuarios SET nombre = :nombre WHERE idUsuario = :uid',
            { replacements: { nombre, uid: req.uid }, type: QueryTypes.UPDATE });
        return res.json({ status_code: 0, message: 'Nombre actualizado correctamente', data: { id: req.uid } });
    } catch (error) {
        console.error('updateMiCuenta', error);
        return res.json({ status_code: 2, message: 'No fue posible actualizar tu nombre', data: null });
    }
};

/**
 * POST /api/cuenta/cambiarPassword { actual, nueva }
 * Sube la versión de la cuenta (cierra las demás sesiones abiertas) y regresa
 * un token nuevo para no sacar a quien la cambió.
 */
const cambiarPassword = async (req, res) => {
    const { actual, nueva } = req.body;
    try {
        if (!passwordValido(nueva)) {
            return res.json({ status_code: 1, message: `La contraseña nueva debe tener al menos ${ PASSWORD_MIN } caracteres`, data: null });
        }
        const [cuenta] = await db.global.query('SELECT passwordHash FROM usuarios WHERE idUsuario = :uid',
            { replacements: { uid: req.uid } });
        if (!cuenta || !bcrypt.compareSync(String(actual || ''), cuenta.passwordHash)) {
            return res.json({ status_code: 1, message: 'La contraseña actual no es correcta', data: null });
        }
        if (actual === nueva) {
            return res.json({ status_code: 1, message: 'La contraseña nueva debe ser distinta de la actual', data: null });
        }

        await db.global.query(`
            UPDATE usuarios SET passwordHash = :hash, versionSesion = versionSesion + 1 WHERE idUsuario = :uid`,
        { replacements: { hash: hashPassword(nueva), uid: req.uid }, type: QueryTypes.UPDATE });

        const [v] = await db.empresa(req).query(`
            SELECT u.versionSesion AS vCuenta, ue.versionSesion AS vAcceso
              FROM usuarios_empresa ue JOIN usuarios u ON u.idUsuario = ue.idUsuario
             WHERE ue.idEmpresa = :idEmpresa AND ue.idUsuario = :uid`, { replacements: { uid: req.uid } });
        const token = tokenSesion({ idUsuario: req.uid, idEmpresa: req.idEmpresa, versionCuenta: v.vCuenta, versionAcceso: v.vAcceso });

        return res.json({ status_code: 0, message: 'Contraseña cambiada. Se cerraron tus otras sesiones.', data: { token } });
    } catch (error) {
        console.error('cambiarPassword', error);
        return res.json({ status_code: 2, message: 'No fue posible cambiar tu contraseña', data: null });
    }
};

module.exports = { getMiCuenta, updateMiCuenta, cambiarPassword };
