const { Router } = require('express');
const { check } = require('express-validator')

const { validarCampos } = require('../middlewares/validar-campos')
const { esRolValido, existeEmail } = require('../helpers/db-validators/user-validator');

const { 
  cbxChoferesCombo
 } = require('../controllers/choferesController');


const router = Router();

router.post('/cbxChoferesCombo', cbxChoferesCombo);

module.exports = router;