const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const {
    getConsentimientoTexto, insertConsentimientoTexto, getRostroEmpleado, aceptarConsentimiento,
    retirarConsentimiento, getRetoRegistro, registrarRostro
} = require('../controllers/faceid');

// Face ID (análisis 005 §6): consentimiento y registro del rostro, con sesión.
const router = Router();

// El texto se edita en Formas de checar y se muestra en la ficha del empleado.
router.get('/getConsentimientoTexto', [
    validarJWT,
    validarMenu(['formas_checar', 'empleados'])
], getConsentimientoTexto);

router.post('/insertConsentimientoTexto', [
    validarJWT,
    validarAccion('consentimiento_Editar'),
    check('texto', 'Escribe el texto del consentimiento').trim().isLength({ min: 50 }).withMessage('El texto es demasiado corto'),
    check('texto', 'El texto admite hasta 5000 caracteres').isLength({ max: 5000 }),
    validarCamposStatusCode
], insertConsentimientoTexto);

router.get('/getRostroEmpleado', [
    validarJWT,
    validarMenu('empleados'),
    check('idEmpleado', 'Falta el empleado').isInt({ min: 1 }),
    validarCamposStatusCode
], getRostroEmpleado);

router.post('/aceptarConsentimiento', [
    validarJWT,
    validarAccion('rostros_Registrar'),
    check('idEmpleado', 'Falta el empleado').isInt({ min: 1 }),
    check('version', 'Falta la versión del texto').isInt({ min: 1 }),
    check('medio', 'Indica cómo consta la aceptación').isIn(['PAPEL_FIRMADO', 'EN_PANTALLA']),
    validarCamposStatusCode
], aceptarConsentimiento);

router.post('/retirarConsentimiento', [
    validarJWT,
    validarAccion('rostros_Registrar'),
    check('idEmpleado', 'Falta el empleado').isInt({ min: 1 }),
    validarCamposStatusCode
], retirarConsentimiento);

router.get('/getRetoRegistro', [
    validarJWT,
    validarAccion('rostros_Registrar')
], getRetoRegistro);

router.post('/registrarRostro', [
    validarJWT,
    validarAccion('rostros_Registrar'),
    check('idEmpleado', 'Falta el empleado').isInt({ min: 1 }),
    validarCamposStatusCode
], registrarRostro);

module.exports = router;
