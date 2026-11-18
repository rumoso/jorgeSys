const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, sinSoporte } = require('../middlewares');
const { getMiCuenta, updateMiCuenta, cambiarPassword } = require('../controllers/cuenta');

const router = Router();

router.get('/getMiCuenta', [
    validarJWT,
    sinSoporte
], getMiCuenta);

router.post('/updateMiCuenta', [
    validarJWT,
    sinSoporte,
    check('nombre', 'Escribe tu nombre').trim().notEmpty(),
    check('nombre', 'El nombre admite hasta 150 caracteres').isLength({ max: 150 }),
    validarCamposStatusCode
], updateMiCuenta);

router.post('/cambiarPassword', [
    validarJWT,
    sinSoporte,
    check('actual', 'Escribe tu contraseña actual').notEmpty(),
    check('nueva', 'Escribe la contraseña nueva').notEmpty(),
    validarCamposStatusCode
], cambiarPassword);

module.exports = router;
