const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const { getFormasSucursal, setFormaSucursal, getFormasEmpleado, setFormaEmpleado } = require('../controllers/formasChecado');

// Checador → Formas de checar (análisis 005 §2).
const router = Router();

router.get('/getFormasSucursal', [
    validarJWT,
    validarMenu('formas_checar')
], getFormasSucursal);

// También la pestaña Face ID de la ficha del empleado.
router.get('/getFormasEmpleado', [
    validarJWT,
    validarMenu(['formas_checar', 'empleados']),
    check('idEmpleado', 'Falta el empleado').isInt({ min: 1 }),
    validarCamposStatusCode
], getFormasEmpleado);

router.post('/setFormaSucursal', [
    validarJWT,
    validarAccion('formas_Configurar'),
    check('idSucursal', 'Falta la sucursal').isInt({ min: 1 }),
    check('forma', 'Falta la forma').trim().notEmpty(),
    check('bActiva', 'Falta el estado').isBoolean({ strict: true }),
    validarCamposStatusCode
], setFormaSucursal);

router.post('/setFormaEmpleado', [
    validarJWT,
    validarAccion('formas_Configurar'),
    check('idEmpleado', 'Falta el empleado').isInt({ min: 1 }),
    check('forma', 'Falta la forma').trim().notEmpty(),
    check('bPermitida', 'Indica si se permite').custom(v => v === null || typeof v === 'boolean'),
    validarCamposStatusCode
], setFormaEmpleado);

module.exports = router;
