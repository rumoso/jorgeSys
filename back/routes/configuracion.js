const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const {
    getConfiguracion, getConfiguracionSucursal, getBitacoraConfiguracion, getAccesosSoporte,
    setConfiguracion, confirmarConfiguracion, setExcepcionSucursal
} = require('../controllers/configuracion');

const router = Router();

router.get('/getConfiguracion', [
    validarJWT,
    validarMenu('configuracion')
], getConfiguracion);

// También la usa el modal de Sucursales (sección Configuración).
router.get('/getConfiguracionSucursal', [
    validarJWT,
    validarMenu(['configuracion', 'sucursales']),
    check('idSucursal', 'Falta la sucursal').isInt({ min: 1 }),
    validarCamposStatusCode
], getConfiguracionSucursal);

router.get('/getBitacoraConfiguracion', [
    validarJWT,
    validarMenu('configuracion')
], getBitacoraConfiguracion);

// 009: cuándo entró soporte del proveedor a esta empresa, quién y por qué.
router.get('/getAccesosSoporte', [
    validarJWT,
    validarMenu('configuracion')
], getAccesosSoporte);

router.post('/setConfiguracion', [
    validarJWT,
    validarAccion('configuracion_Editar'),
    check('valores', 'Los valores deben ser una lista').isArray({ min: 1, max: 100 }),
    check('valores.*.clave', 'Falta la clave del ajuste').isString().notEmpty(),
    validarCamposStatusCode
], setConfiguracion);

router.post('/confirmarConfiguracion', [
    validarJWT,
    validarAccion('configuracion_Editar'),
    check('claves', 'Las claves deben ser una lista').isArray({ min: 1, max: 100 }),
    validarCamposStatusCode
], confirmarConfiguracion);

router.post('/setExcepcionSucursal', [
    validarJWT,
    validarAccion('configuracion_Editar'),
    check('idSucursal', 'Falta la sucursal').isInt({ min: 1 }),
    check('clave', 'Falta la clave del ajuste').isString().notEmpty(),
    validarCamposStatusCode
], setExcepcionSucursal);

module.exports = router;
