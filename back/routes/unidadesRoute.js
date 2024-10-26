const { Router } = require('express');
const { check } = require('express-validator')

const { validarCampos } = require('../middlewares/validar-campos')
const { esRolValido, existeEmail } = require('../helpers/db-validators/user-validator');

const { 
  cbxUnidadesCombo
 } = require('../controllers/unidadesController');


const router = Router();

router.post('/cbxUnidadesCombo', cbxUnidadesCombo);

module.exports = router;