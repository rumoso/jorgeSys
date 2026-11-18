const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const { getPorRevisar, getContadorPorRevisar, getFotoEvidencia, aprobarMarcaje, rechazarMarcaje } = require('../controllers/marcajes');

// Checador → Por revisar (análisis 005 §4).
const router = Router();

router.get('/getPorRevisar', [
    validarJWT,
    validarMenu('por_revisar')
], getPorRevisar);

router.get('/getContadorPorRevisar', [
    validarJWT,
    validarMenu('por_revisar')
], getContadorPorRevisar);

router.get('/getFotoEvidencia', [
    validarJWT,
    validarMenu('por_revisar'),
    check('idMarcaje', 'Falta el marcaje').isInt({ min: 1 }),
    validarCamposStatusCode
], getFotoEvidencia);

router.put('/aprobarMarcaje', [
    validarJWT,
    validarAccion('marcajes_Revisar'),
    check('idMarcaje', 'Falta el marcaje').isInt({ min: 1 }),
    validarCamposStatusCode
], aprobarMarcaje);

router.put('/rechazarMarcaje', [
    validarJWT,
    validarAccion('marcajes_Revisar'),
    check('idMarcaje', 'Falta el marcaje').isInt({ min: 1 }),
    check('motivo', 'Escribe el motivo del rechazo').trim().notEmpty(),
    check('motivo', 'El motivo admite hasta 250 caracteres').isLength({ max: 250 }),
    validarCamposStatusCode
], rechazarMarcaje);

module.exports = router;
