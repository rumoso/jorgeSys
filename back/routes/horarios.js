const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const {
    getSucursalesHorarios,
    getHorarioEmpleado, revisarHorario, setHorarioEmpleado,
    getPlantilla, setPlantilla, previsualizarAplicar, aplicarPlantilla,
    getDiasEmpleado, getDiasSucursal, setDia, setDiaVarios, regresarDia, getSalidaPlantilla,
    getHorariosPorAjustar, getBitacoraHorarios
} = require('../controllers/horarios');

// Análisis 006. Las consultas de la ficha del empleado (pestaña Horario) se
// abren con el menú Empleados o Horarios; las de la pantalla Horarios, con
// el menú Horarios. Cada escritura exige su acción.

const router = Router();

const MENU_FICHA = ['horarios', 'empleados'];
const idEmpleadoQuery = check('idEmpleado', 'Falta el empleado').isInt({ min: 1 });
const idEmpleadoBody = check('idEmpleado', 'Falta el empleado').isInt({ min: 1 });
const idSucursalQuery = check('idSucursal', 'Falta la sucursal').isInt({ min: 1 });
const idSucursalBody = check('idSucursal', 'Falta la sucursal').isInt({ min: 1 });
const fechaQuery = check('fecha', 'Falta la fecha').notEmpty();
const fechaBody = check('fecha', 'Falta la fecha').notEmpty();
const diasBody = check('dias', 'Faltan los días del horario').isArray({ min: 1, max: 7 });

// ── Sucursales ──
router.get('/getSucursalesHorarios', [
    validarJWT,
    validarMenu(MENU_FICHA)
], getSucursalesHorarios);

// ── Horario del empleado ──
router.get('/getHorarioEmpleado', [
    validarJWT,
    validarMenu(MENU_FICHA),
    idEmpleadoQuery,
    validarCamposStatusCode
], getHorarioEmpleado);

// No guarda: calcula horas, tipos y avisos para el editor y la plantilla.
router.post('/revisarHorario', [
    validarJWT,
    validarAccion(['horarios_Editar', 'horarios_Plantilla']),
    diasBody,
    validarCamposStatusCode
], revisarHorario);

router.post('/setHorarioEmpleado', [
    validarJWT,
    validarAccion('horarios_Editar'),
    idEmpleadoBody,
    diasBody,
    check('aPartirDe', 'Falta la fecha "a partir de"').notEmpty(),
    validarCamposStatusCode
], setHorarioEmpleado);

// ── Plantilla de la sucursal ──
router.get('/getPlantilla', [
    validarJWT,
    validarMenu(MENU_FICHA),
    idSucursalQuery,
    validarCamposStatusCode
], getPlantilla);

router.post('/setPlantilla', [
    validarJWT,
    validarAccion('horarios_Plantilla'),
    idSucursalBody,
    diasBody,
    validarCamposStatusCode
], setPlantilla);

router.get('/previsualizarAplicar', [
    validarJWT,
    validarAccion('horarios_Plantilla'),
    idSucursalQuery,
    validarCamposStatusCode
], previsualizarAplicar);

router.post('/aplicarPlantilla', [
    validarJWT,
    validarAccion('horarios_Plantilla'),
    idSucursalBody,
    check('idEmpleados', 'Escoge a qué empleados aplicar la plantilla').isArray({ min: 1 }),
    check('aPartirDe', 'Falta la fecha "a partir de"').notEmpty(),
    validarCamposStatusCode
], aplicarPlantilla);

// ── Días ──
router.get('/getDiasEmpleado', [
    validarJWT,
    validarMenu(MENU_FICHA),
    idEmpleadoQuery,
    check('desde', 'Falta la fecha inicial').notEmpty(),
    check('hasta', 'Falta la fecha final').notEmpty(),
    validarCamposStatusCode
], getDiasEmpleado);

router.get('/getDiasSucursal', [
    validarJWT,
    validarMenu('horarios'),
    idSucursalQuery,
    fechaQuery,
    validarCamposStatusCode
], getDiasSucursal);

router.post('/setDia', [
    validarJWT,
    validarAccion('horarios_CambiarDia'),
    idEmpleadoBody,
    fechaBody,
    check('estado', 'Escoge si el día es laborable o descanso').notEmpty(),
    validarCamposStatusCode
], setDia);

router.post('/setDiaVarios', [
    validarJWT,
    validarAccion('horarios_CambiarDia'),
    idSucursalBody,
    fechaBody,
    check('idEmpleados', 'Escoge a qué empleados cambiar el día').isArray({ min: 1 }),
    check('estado', 'Escoge si el día es laborable o descanso').notEmpty(),
    validarCamposStatusCode
], setDiaVarios);

router.post('/regresarDia', [
    validarJWT,
    validarAccion('horarios_CambiarDia'),
    idEmpleadoBody,
    fechaBody,
    validarCamposStatusCode
], regresarDia);

router.get('/getSalidaPlantilla', [
    validarJWT,
    validarMenu(MENU_FICHA),
    idSucursalQuery,
    fechaQuery,
    validarCamposStatusCode
], getSalidaPlantilla);

// ── Listas ──
router.get('/getHorariosPorAjustar', [
    validarJWT,
    validarMenu('horarios')
], getHorariosPorAjustar);

router.get('/getBitacoraHorarios', [
    validarJWT,
    validarMenu(MENU_FICHA)
], getBitacoraHorarios);

module.exports = router;
