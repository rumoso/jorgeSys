const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const {
    getDispositivos, insertDispositivo, regenerarCodigo, deleteDispositivoPendiente, revocarDispositivo, getEstadoVinculacion
} = require('../controllers/dispositivos');

// Checador → Dispositivos (análisis 005), con sesión. Los endpoints SIN
// sesión del propio dispositivo están en routes/checador.js.
const router = Router();

router.get('/getDispositivos', [
    validarJWT,
    validarMenu('dispositivos')
], getDispositivos);

router.get('/getEstadoVinculacion', [
    validarJWT,
    validarMenu('dispositivos'),
    check('idDispositivo', 'Falta el dispositivo').isInt({ min: 1 }),
    validarCamposStatusCode
], getEstadoVinculacion);

router.post('/insertDispositivo', [
    validarJWT,
    validarAccion('dispositivos_CreateUpdate'),
    check('idSucursal', 'Escoge la sucursal').isInt({ min: 1 }),
    check('nombre', 'Escribe el nombre del dispositivo').trim().notEmpty(),
    check('nombre', 'El nombre admite hasta 80 caracteres').isLength({ max: 80 }),
    validarCamposStatusCode
], insertDispositivo);

router.post('/regenerarCodigo', [
    validarJWT,
    validarAccion('dispositivos_CreateUpdate'),
    check('idDispositivo', 'Falta el dispositivo').isInt({ min: 1 }),
    validarCamposStatusCode
], regenerarCodigo);

router.delete('/deleteDispositivoPendiente', [
    validarJWT,
    validarAccion('dispositivos_CreateUpdate'),
    check('idDispositivo', 'Falta el dispositivo').isInt({ min: 1 }),
    validarCamposStatusCode
], deleteDispositivoPendiente);

router.put('/revocarDispositivo', [
    validarJWT,
    validarAccion('dispositivos_Revocar'),
    check('idDispositivo', 'Falta el dispositivo').isInt({ min: 1 }),
    validarCamposStatusCode
], revocarDispositivo);

module.exports = router;
