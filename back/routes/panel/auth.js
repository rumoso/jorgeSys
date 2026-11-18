const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode } = require('../../middlewares/validar-campos');
const { validarPanel } = require('../../middlewares/validar-panel');
const { limitePanelPorIP, limitePanelPorCorreo, limitePanelPorCuenta } = require('../../helpers/limitadores');
const { login, verificar2fa, getSesion } = require('../../controllers/panel/auth');

// Panel del superadministrador (009): /api/panel/auth. Nada de aquí acepta
// una sesión de empresa.
const router = Router();

router.post('/login', [
    limitePanelPorIP,
    limitePanelPorCorreo,
    check('correo', 'Escribe tu correo').trim().notEmpty(),
    check('password', 'Escribe tu contraseña').notEmpty(),
    validarCamposStatusCode
], login);

router.post('/verificar2fa', [
    limitePanelPorIP,
    limitePanelPorCuenta,
    check('codigo', 'Escribe el código de 6 dígitos').trim().notEmpty(),
    validarCamposStatusCode
], verificar2fa);

router.get('/getSesion', [
    validarPanel
], getSesion);

module.exports = router;
