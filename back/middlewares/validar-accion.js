const { permisosDe } = require('../helpers/userActions');

// Requieren validarJWT antes en la cadena.

const sinPermiso = (res, message) => res.json({ status_code: 1, message, data: { codigo: 'SIN_PERMISO' } });

/**
 * validarAccion('clave') o validarAccion(['una', 'otra']) (cualquiera de
 * ellas). Pone `req.permisos` para que el controlador lo reutilice.
 */
const validarAccion = (claves) => {
    const lista = Array.isArray(claves) ? claves : [claves];
    return async (req, res, next) => {
        try {
            req.permisos = await permisosDe(req);
            if (lista.some(c => req.permisos.acciones.has(c))) return next();
            return sinPermiso(res, 'No tienes permiso para hacer esto');
        } catch (error) {
            console.error('validarAccion', error);
            return res.json({ status_code: 2, message: 'No fue posible validar tus permisos', data: null });
        }
    };
};

/** validarMenu('clave') o validarMenu(['una', 'otra']): para las consultas de una pantalla. */
const validarMenu = (claves) => {
    const lista = Array.isArray(claves) ? claves : [claves];
    return async (req, res, next) => {
        try {
            req.permisos = await permisosDe(req);
            if (lista.some(c => req.permisos.menus.has(c))) return next();
            return sinPermiso(res, 'No tienes acceso a esta pantalla');
        } catch (error) {
            console.error('validarMenu', error);
            return res.json({ status_code: 2, message: 'No fue posible validar tus permisos', data: null });
        }
    };
};

module.exports = { validarAccion, validarMenu };
