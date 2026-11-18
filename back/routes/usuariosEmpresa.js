const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode, validarJWT, validarAccion, validarMenu } = require('../middlewares');
const {
    getUsuariosEmpresa, darAcceso, updateUsuarioEmpresa, getPermisosDirectos, setPermisosDirectos,
    quitarAcceso, restablecerPassword
} = require('../controllers/usuariosEmpresa');

const router = Router();

router.get('/getUsuariosEmpresa', [
    validarJWT,
    validarMenu('usuarios')
], getUsuariosEmpresa);

router.get('/getPermisosDirectos', [
    validarJWT,
    validarMenu('usuarios'),
    check('idUsuario', 'Falta el usuario').isInt({ min: 1 }),
    validarCamposStatusCode
], getPermisosDirectos);

router.post('/darAcceso', [
    validarJWT,
    validarAccion('usuarios_DarAcceso'),
    check('correo', 'Escribe el correo').trim().notEmpty(),
    check('roles', 'Los roles deben ser una lista').optional().isArray(),
    validarCamposStatusCode
], darAcceso);

router.post('/updateUsuarioEmpresa', [
    validarJWT,
    validarAccion('usuarios_Editar'),
    check('idUsuario', 'Falta el usuario').isInt({ min: 1 }),
    check('roles', 'Los roles deben ser una lista').optional().isArray(),
    validarCamposStatusCode
], updateUsuarioEmpresa);

router.post('/setPermisosDirectos', [
    validarJWT,
    validarAccion('usuarios_Editar'),
    check('idUsuario', 'Falta el usuario').isInt({ min: 1 }),
    check('menus', 'Los menús deben ser una lista').optional().isArray(),
    check('acciones', 'Las acciones deben ser una lista').optional().isArray(),
    validarCamposStatusCode
], setPermisosDirectos);

router.put('/quitarAcceso', [
    validarJWT,
    validarAccion('usuarios_QuitarAcceso'),
    check('idUsuario', 'Falta el usuario').isInt({ min: 1 }),
    validarCamposStatusCode
], quitarAcceso);

router.put('/restablecerPassword', [
    validarJWT,
    validarAccion('usuarios_RestablecerPassword'),
    check('idUsuario', 'Falta el usuario').isInt({ min: 1 }),
    check('password', 'Escribe la contraseña nueva').notEmpty(),
    validarCamposStatusCode
], restablecerPassword);

module.exports = router;
