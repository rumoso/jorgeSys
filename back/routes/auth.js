const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT } = require('../middlewares');
const { limitePorIP, limitePorCorreo } = require('../helpers/limitadores');
const { login, seleccionarEmpresa, getSesion } = require('../controllers/auth');

const router = Router();

router.post('/login', [
    limitePorIP,
    limitePorCorreo,
    check('correo', 'Escribe tu correo').trim().notEmpty(),
    check('password', 'Escribe tu contraseña').notEmpty(),
    validarCamposStatusCode
], login);

router.post('/seleccionarEmpresa', [
    limitePorIP,
    check('idEmpresa', 'Escoge una empresa').isInt({ min: 1 }),
    validarCamposStatusCode
], seleccionarEmpresa);

router.get('/getSesion', [
    validarJWT
], getSesion);

module.exports = router;
