const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode } = require('../../middlewares/validar-campos');
const { validarPanel } = require('../../middlewares/validar-panel');
const { entrarEmpresa, salirEmpresa } = require('../../controllers/panel/soporte');

// Panel del superadministrador (009): /api/panel/soporte. Entrar a una
// empresa y salir; el token de soporte que se recibe se usa en `x-token`.
const router = Router();

router.post('/entrarEmpresa', [
    validarPanel,
    check('idEmpresa', 'Falta la empresa').isInt({ min: 1 }),
    check('motivo', 'Escribe el motivo de la entrada').trim().notEmpty(),
    validarCamposStatusCode
], entrarEmpresa);

router.post('/salirEmpresa', [
    validarPanel,
    check('idSesionSoporte', 'Falta la sesión de soporte').isInt({ min: 1 }),
    validarCamposStatusCode
], salirEmpresa);

module.exports = router;
