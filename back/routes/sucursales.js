const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const { getSucursales, getZonasHorarias, insertUpdateSucursal, disableSucursal } = require('../controllers/sucursales');

const router = Router();

// La usan Sucursales y los modales de Usuarios (asignar sucursales).
router.get('/getSucursales', [
    validarJWT,
    validarMenu(['sucursales', 'usuarios'])
], getSucursales);

router.get('/getZonasHorarias', [
    validarJWT,
    validarMenu('sucursales')
], getZonasHorarias);

router.post('/insertUpdateSucursal', [
    validarJWT,
    validarAccion('sucursales_CreateUpdate'),
    check('nombre', 'Escribe el nombre de la sucursal').trim().notEmpty(),
    check('nombre', 'El nombre admite hasta 100 caracteres').isLength({ max: 100 }),
    check('direccion', 'La dirección admite hasta 250 caracteres').optional({ nullable: true }).isLength({ max: 250 }),
    check('zonaHoraria', 'Escoge la zona horaria').notEmpty(),
    validarCamposStatusCode
], insertUpdateSucursal);

router.put('/disableSucursal', [
    validarJWT,
    validarAccion('sucursales_Disable'),
    check('idSucursal', 'Falta la sucursal').isInt({ min: 1 }),
    check('bActivo', 'Falta el estado').isBoolean(),
    validarCamposStatusCode
], disableSucursal);

module.exports = router;
