const { Router } = require('express');
const { check } = require('express-validator')

const { validarCampos } = require('../middlewares/validar-campos')
const { esRolValido, existeEmail } = require('../helpers/db-validators/user-validator');

const { 

    login
    , getMenuByPermissions
    
} = require('../controllers/authController');


const router = Router();

router.post('/login', [
    check('username','Usuario obligatorio').not().isEmpty(),
    check('pwd','Contraseña obligatoria').not().isEmpty(),
    validarCampos
], login);

router.post('/getMenuByPermissions',[
    check('idUser','Usuario obligatorio').not().isEmpty(),
    validarCampos

], getMenuByPermissions );

module.exports = router;