const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const {
    getRoles, getCatalogoPermisos, getPermisosRol, getMenuDeRol,
    insertUpdateRol, disableRol, setPermisosRol, getBitacoraPermisos
} = require('../controllers/roles');

const router = Router();

// La pantalla de Usuarios también usa la lista de roles y el catálogo (para
// asignar roles y permisos directos): mismo permiso de ver, mismo contrato.
router.get('/getRoles', [
    validarJWT,
    validarMenu(['roles', 'usuarios'])
], getRoles);

router.get('/getCatalogoPermisos', [
    validarJWT,
    validarMenu(['roles', 'usuarios'])
], getCatalogoPermisos);

router.get('/getPermisosRol', [
    validarJWT,
    validarMenu('roles'),
    check('idRol', 'Falta el rol').isInt({ min: 1 }),
    validarCamposStatusCode
], getPermisosRol);

router.get('/getMenuDeRol', [
    validarJWT,
    validarMenu('roles'),
    check('idRol', 'Falta el rol').isInt({ min: 1 }),
    validarCamposStatusCode
], getMenuDeRol);

router.get('/getBitacoraPermisos', [
    validarJWT,
    validarMenu(['roles', 'usuarios'])
], getBitacoraPermisos);

router.post('/insertUpdateRol', [
    validarJWT,
    validarAccion('roles_CreateUpdate'),
    check('nombre', 'Escribe el nombre del rol').trim().notEmpty(),
    check('nombre', 'El nombre admite hasta 80 caracteres').isLength({ max: 80 }),
    check('descripcion', 'La descripción admite hasta 250 caracteres').optional({ nullable: true }).isLength({ max: 250 }),
    validarCamposStatusCode
], insertUpdateRol);

router.put('/disableRol', [
    validarJWT,
    validarAccion('roles_Disable'),
    check('idRol', 'Falta el rol').isInt({ min: 1 }),
    check('bActivo', 'Falta el estado').isBoolean(),
    validarCamposStatusCode
], disableRol);

router.post('/setPermisosRol', [
    validarJWT,
    validarAccion('roles_Permisos'),
    check('idRol', 'Falta el rol').isInt({ min: 1 }),
    check('menus', 'Los menús deben ser una lista').optional().isArray(),
    check('acciones', 'Las acciones deben ser una lista').optional().isArray(),
    validarCamposStatusCode
], setPermisosRol);

module.exports = router;
