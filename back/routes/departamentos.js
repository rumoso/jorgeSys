const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const { getDepartamentos, insertUpdateDepartamento, disableDepartamento } = require('../controllers/departamentos');

const router = Router();

// También la usa la ficha del empleado (combo y alta al vuelo).
router.get('/getDepartamentos', [
    validarJWT,
    validarMenu(['departamentos', 'empleados'])
], getDepartamentos);

router.post('/insertUpdateDepartamento', [
    validarJWT,
    validarAccion('departamentos_CreateUpdate'),
    check('nombre', 'Escribe el nombre del departamento').isString().trim().notEmpty(),
    check('id', 'Departamento inválido').optional({ nullable: true }).isInt({ min: 1 }),
    validarCamposStatusCode
], insertUpdateDepartamento);

router.put('/disableDepartamento', [
    validarJWT,
    validarAccion('departamentos_Disable'),
    check('id', 'Falta el departamento').isInt({ min: 1 }),
    check('bActivo', 'Falta el estado').isBoolean(),
    validarCamposStatusCode
], disableDepartamento);

module.exports = router;
