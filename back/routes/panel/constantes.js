const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode } = require('../../middlewares/validar-campos');
const { validarPanel } = require('../../middlewares/validar-panel');
const {
    getConstantes, getValoresEmpresas, getConstantesDeEmpresa, getImpactoGlobal,
    setValorGlobal, setValorEmpresa, quitarValorEmpresa,
    insertConstante, updateDefinicionConstante, disableConstante, enableConstante
} = require('../../controllers/panel/constantes');

// Panel del superadministrador (009): /api/panel/constantes. Valores (global y
// por empresa) y catálogo de las constantes del sistema.
const router = Router();

const clave = check('clave', 'Falta la clave de la constante').isString().trim().notEmpty();
const idEmpresa = check('idEmpresa', 'Falta la empresa').isInt({ min: 1 });

router.get('/getConstantes', [
    validarPanel
], getConstantes);

router.get('/getValoresEmpresas', [
    validarPanel,
    clave,
    validarCamposStatusCode
], getValoresEmpresas);

router.get('/getConstantesDeEmpresa', [
    validarPanel,
    idEmpresa,
    validarCamposStatusCode
], getConstantesDeEmpresa);

router.get('/getImpactoGlobal', [
    validarPanel,
    clave,
    validarCamposStatusCode
], getImpactoGlobal);

router.post('/setValorGlobal', [
    validarPanel,
    clave,
    validarCamposStatusCode
], setValorGlobal);

router.post('/setValorEmpresa', [
    validarPanel,
    clave,
    idEmpresa,
    validarCamposStatusCode
], setValorEmpresa);

router.post('/quitarValorEmpresa', [
    validarPanel,
    clave,
    idEmpresa,
    validarCamposStatusCode
], quitarValorEmpresa);

router.post('/insertConstante', [
    validarPanel,
    clave,
    check('tipoDato', 'Escoge el tipo de dato').isString().notEmpty(),
    check('control', 'Escoge el control').isString().notEmpty(),
    check('etiqueta', 'Escribe la etiqueta').trim().notEmpty(),
    check('grupo', 'Escribe el grupo').trim().notEmpty(),
    validarCamposStatusCode
], insertConstante);

router.post('/updateDefinicionConstante', [
    validarPanel,
    clave,
    check('control', 'Escoge el control').isString().notEmpty(),
    check('etiqueta', 'Escribe la etiqueta').trim().notEmpty(),
    check('grupo', 'Escribe el grupo').trim().notEmpty(),
    validarCamposStatusCode
], updateDefinicionConstante);

router.put('/disableConstante', [
    validarPanel,
    clave,
    check('claveConfirmacion', 'Escribe la clave para confirmar').isString().trim().notEmpty(),
    validarCamposStatusCode
], disableConstante);

router.put('/enableConstante', [
    validarPanel,
    clave,
    validarCamposStatusCode
], enableConstante);

module.exports = router;
