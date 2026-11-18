const { leerToken } = require('../helpers/jwt');
const { cuentaVigente, datosSuperadmin, sesionPanelInvalida } = require('../helpers/panel/sesion');

/**
 * Sesión del panel del superadministrador (análisis 009). Lee la cabecera
 * `x-token-panel` (nunca `x-token`) y solo acepta el token de tipo `panel`.
 *
 * En cada petición confirma que la cuenta sigue activa y que su versión de
 * sesión coincide. Pone `req.idSuperadmin` y `req.superadmin`; NUNCA pone
 * `req.idEmpresa`: el panel no tiene empresa de sesión.
 */
const validarPanel = async (req, res, next) => {
    const p = leerToken(req.header('x-token-panel'));
    if (!p || p.t !== 'panel' || !p.sa) return sesionPanelInvalida(res);
    try {
        const cuenta = await cuentaVigente(p.sa, p.v);
        if (!cuenta) return sesionPanelInvalida(res);
        req.idSuperadmin = Number(cuenta.idSuperadmin);
        req.superadmin = datosSuperadmin(cuenta);
        next();
    } catch (error) {
        console.error('validarPanel', error);
        return res.json({ status_code: 2, message: 'No fue posible validar la sesión del panel', data: null });
    }
};

module.exports = { validarPanel };
