const { Router } = require('express');
const { check } = require('express-validator')

const { validarCampos } = require('../middlewares/validar-campos')
const { esRolValido, existeEmail } = require('../helpers/db-validators/user-validator');

const { 
  saveFlete
  , getFletesListWithPage
  , getFleteByID
 } = require('../controllers/fletesController');


const router = Router();

router.post('/saveFlete', [
  check('titulo','Nombre obligatorio').not().isEmpty(),

  check('idCliente','El Cliente es obligatorio').not().isEmpty(),
  check('idCliente','El Cliente debe ser numérico').isNumeric(),
  
  validarCampos
], saveFlete);

router.post('/getFletesListWithPage', getFletesListWithPage);

router.post('/getFleteByID', [

  check('idFlete','El Flete es obligatorio').not().isEmpty(),
  check('idFlete','El Flete debe ser numérico').isNumeric(),
  
  validarCampos
], getFleteByID);

module.exports = router;