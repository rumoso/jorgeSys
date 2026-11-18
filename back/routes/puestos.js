const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const { getPuestos, insertUpdatePuesto, disablePuesto } = require('../controllers/puestos');

const router = Router();

// También la usa la ficha del empleado (combo y alta al vuelo).
router.get('/getPuestos', [
    validarJWT,
    validarMenu(['puestos', 'empleados'])
], getPuestos);

router.post('/insertUpdatePuesto', [
    validarJWT,
    validarAccion('puestos_CreateUpdate'),
    check('nombre', 'Escribe el nombre del puesto').isString().trim().notEmpty(),
    check('id', 'Puesto inválido').optional({ nullable: true }).isInt({ min: 1 }),
    validarCamposStatusCode
], insertUpdatePuesto);

router.put('/disablePuesto', [
    validarJWT,
    validarAccion('puestos_Disable'),
    check('id', 'Falta el puesto').isInt({ min: 1 }),
    check('bActivo', 'Falta el estado').isBoolean(),
    validarCamposStatusCode
], disablePuesto);

module.exports = router;
