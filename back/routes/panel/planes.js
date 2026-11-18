const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode } = require('../../middlewares/validar-campos');
const { validarPanel } = require('../../middlewares/validar-panel');
const { getPlanes, insertUpdatePlan, disablePlan, enablePlan } = require('../../controllers/panel/planes');

// Panel del superadministrador (009): /api/panel/planes.
const router = Router();

router.get('/getPlanes', [
    validarPanel
], getPlanes);

router.post('/insertUpdatePlan', [
    validarPanel,
    check('nombre', 'Escribe el nombre del plan').trim().notEmpty(),
    check('tipoCobro', 'Escoge el tipo de cobro').isIn(['LIMITE', 'POR_EMPLEADO']),
    validarCamposStatusCode
], insertUpdatePlan);

router.put('/disablePlan', [
    validarPanel,
    check('idPlan', 'Falta el plan').isInt({ min: 1 }),
    validarCamposStatusCode
], disablePlan);

router.put('/enablePlan', [
    validarPanel,
    check('idPlan', 'Falta el plan').isInt({ min: 1 }),
    validarCamposStatusCode
], enablePlan);

module.exports = router;
