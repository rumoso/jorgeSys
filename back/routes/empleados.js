const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const { subirArchivo } = require('../middlewares/multer-config');
const {
    getEmpleados, getEmpleado, getSiguienteNumero, getCatalogosEmpleado, getEmpleadosActivosEn,
    insertUpdateEmpleado, getPreciosEmpleado, setPrecioEmpleado, bajaEmpleado, reingresoEmpleado,
    setFotoEmpleado, deleteFotoEmpleado, getFotoEmpleado
} = require('../controllers/empleados');
const { getPlantillaImportacion, previsualizarImportacion, importarEmpleados } = require('../controllers/empleadosImportacion');

const router = Router();

const idEmpleadoQuery = check('idEmpleado', 'Falta el empleado').isInt({ min: 1 });
const idEmpleadoBody = check('idEmpleado', 'Falta el empleado').isInt({ min: 1 });

// ── Consultas (menú Empleados) ──
router.get('/getEmpleados', [
    validarJWT,
    validarMenu('empleados')
], getEmpleados);

router.get('/getEmpleado', [
    validarJWT,
    validarMenu('empleados'),
    idEmpleadoQuery,
    validarCamposStatusCode
], getEmpleado);

router.get('/getSiguienteNumero', [
    validarJWT,
    validarMenu('empleados')
], getSiguienteNumero);

router.get('/getCatalogosEmpleado', [
    validarJWT,
    validarMenu('empleados')
], getCatalogosEmpleado);

router.get('/getEmpleadosActivosEn', [
    validarJWT,
    validarMenu('empleados'),
    check('fecha', 'Falta la fecha').notEmpty(),
    validarCamposStatusCode
], getEmpleadosActivosEn);

// Binario: la foto se entrega solo con sesión, empresa y alcance.
router.get('/getFotoEmpleado', [
    validarJWT,
    validarMenu('empleados'),
    idEmpleadoQuery,
    validarCamposStatusCode
], getFotoEmpleado);

// ── Alta y edición ──
router.post('/insertUpdateEmpleado', [
    validarJWT,
    validarAccion('empleados_CreateUpdate'),
    check('idEmpleado', 'Empleado inválido').optional({ nullable: true }).isInt({ min: 1 }),
    validarCamposStatusCode
], insertUpdateEmpleado);

// ── Precio por hora (su propio permiso, también para verlo) ──
router.get('/getPreciosEmpleado', [
    validarJWT,
    validarAccion('empleados_Precio'),
    idEmpleadoQuery,
    validarCamposStatusCode
], getPreciosEmpleado);

router.post('/setPrecioEmpleado', [
    validarJWT,
    validarAccion('empleados_Precio'),
    idEmpleadoBody,
    check('aPartirDe', 'Falta la fecha "a partir de"').notEmpty(),
    validarCamposStatusCode
], setPrecioEmpleado);

// ── Baja y reingreso ──
router.post('/bajaEmpleado', [
    validarJWT,
    validarAccion('empleados_Baja'),
    idEmpleadoBody,
    check('fechaBaja', 'Falta la fecha de baja').notEmpty(),
    validarCamposStatusCode
], bajaEmpleado);

router.post('/reingresoEmpleado', [
    validarJWT,
    validarAccion('empleados_Baja'),
    idEmpleadoBody,
    check('fechaIngreso', 'Falta la fecha de reingreso').notEmpty(),
    validarCamposStatusCode
], reingresoEmpleado);

// ── Foto (multipart: archivo + idEmpleado) ──
router.post('/setFotoEmpleado', [
    validarJWT,
    validarAccion('empleados_CreateUpdate'),
    subirArchivo('imagen'),
    idEmpleadoBody,
    validarCamposStatusCode
], setFotoEmpleado);

router.delete('/deleteFotoEmpleado', [
    validarJWT,
    validarAccion('empleados_CreateUpdate'),
    idEmpleadoQuery,
    validarCamposStatusCode
], deleteFotoEmpleado);

// ── Alta masiva desde Excel ──
router.get('/getPlantillaImportacion', [
    validarJWT,
    validarAccion('empleados_Importar')
], getPlantillaImportacion);

router.post('/previsualizarImportacion', [
    validarJWT,
    validarAccion('empleados_Importar'),
    subirArchivo('excel')
], previsualizarImportacion);

router.post('/importarEmpleados', [
    validarJWT,
    validarAccion('empleados_Importar'),
    check('renglones', 'Faltan los renglones').isArray({ min: 1 }),
    validarCamposStatusCode
], importarEmpleados);

module.exports = router;
