const { Router } = require('express');
const { check } = require('express-validator');
const { validarJWT, validarAccion, validarCamposStatusCode, sinSoporte } = require('../middlewares');
const { getUserActions, getMenu, getPreferencias, setPreferencia, getAvisoPlan } = require('../controllers/global');

const router = Router();

router.get('/getUserActions', [
    validarJWT
], getUserActions);

router.get('/getMenu', [
    validarJWT
], getMenu);

// Preferencias: del usuario de la sesión; no aplican en una sesión de soporte (009).
router.get('/getPreferencias', [
    validarJWT,
    sinSoporte
], getPreferencias);

router.post('/setPreferencia', [
    validarJWT,
    sinSoporte,
    check('ambito', 'Falta el ámbito').notEmpty(),
    check('clave', 'Falta la clave').notEmpty(),
    validarCamposStatusCode
], setPreferencia);

// 009: uso del plan, solo para quien puede dar de alta, reactivar o cargar empleados.
router.get('/getAvisoPlan', [
    validarJWT,
    validarAccion(['empleados_CreateUpdate', 'empleados_Baja', 'empleados_Importar'])
], getAvisoPlan);

module.exports = router;
