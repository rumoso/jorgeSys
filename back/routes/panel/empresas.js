const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode } = require('../../middlewares/validar-campos');
const { validarPanel } = require('../../middlewares/validar-panel');
const {
    getEmpresas, getEmpresaById, getCatalogosAlta, insertEmpresa, updateEmpresaDatos,
    suspenderEmpresa, reactivarEmpresa, getModulosEmpresa, setModulosEmpresa, setPlanEmpresa,
    iniciarBaja, revertirBaja, descargarExportacion
} = require('../../controllers/panel/empresas');

// Panel del superadministrador (009): /api/panel/empresas. Solo con la
// sesión del panel (x-token-panel); nada de aquí acepta una sesión de empresa.
const router = Router();

const idEmpresa = check('idEmpresa', 'Falta la empresa').isInt({ min: 1 });

router.get('/getEmpresas', [
    validarPanel
], getEmpresas);

router.get('/getEmpresaById', [
    validarPanel,
    idEmpresa,
    validarCamposStatusCode
], getEmpresaById);

router.get('/getCatalogosAlta', [
    validarPanel
], getCatalogosAlta);

router.post('/insertEmpresa', [
    validarPanel,
    check('nombreComercial', 'Escribe el nombre comercial').trim().notEmpty(),
    check('sucursal', 'Escribe el nombre de la primera sucursal').trim().notEmpty(),
    check('zonaHoraria', 'Escoge la zona horaria de la sucursal').trim().notEmpty(),
    check('correoAdmin', 'Escribe el correo del administrador').trim().notEmpty(),
    check('idPlan', 'Escoge el plan').isInt({ min: 1 }),
    validarCamposStatusCode
], insertEmpresa);

router.post('/updateEmpresaDatos', [
    validarPanel,
    idEmpresa,
    check('nombreComercial', 'Escribe el nombre comercial').trim().notEmpty(),
    validarCamposStatusCode
], updateEmpresaDatos);

router.post('/suspenderEmpresa', [
    validarPanel,
    idEmpresa,
    check('motivo', 'Escribe el motivo').trim().notEmpty(),
    validarCamposStatusCode
], suspenderEmpresa);

router.post('/reactivarEmpresa', [
    validarPanel,
    idEmpresa,
    check('motivo', 'Escribe el motivo').trim().notEmpty(),
    validarCamposStatusCode
], reactivarEmpresa);

// Baja definitiva (T29).
router.post('/iniciarBaja', [
    validarPanel,
    idEmpresa,
    check('nombreConfirmacion', 'Escribe el nombre de la empresa para confirmar').trim().notEmpty(),
    check('motivo', 'Escribe el motivo').trim().notEmpty(),
    validarCamposStatusCode
], iniciarBaja);

router.post('/revertirBaja', [
    validarPanel,
    idEmpresa,
    check('motivo', 'Escribe el motivo').trim().notEmpty(),
    validarCamposStatusCode
], revertirBaja);

router.get('/descargarExportacion', [
    validarPanel,
    idEmpresa,
    validarCamposStatusCode
], descargarExportacion);

router.get('/getModulosEmpresa', [
    validarPanel,
    idEmpresa,
    validarCamposStatusCode
], getModulosEmpresa);

router.post('/setModulosEmpresa', [
    validarPanel,
    idEmpresa,
    check('modulos', 'Faltan los módulos').isArray(),
    validarCamposStatusCode
], setModulosEmpresa);

router.post('/setPlanEmpresa', [
    validarPanel,
    idEmpresa,
    check('idPlan', 'Escoge el plan').isInt({ min: 1 }),
    validarCamposStatusCode
], setPlanEmpresa);

module.exports = router;
