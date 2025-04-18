const { Router } = require('express');
const { check } = require('express-validator')

const { validarCampos } = require('../middlewares/validar-campos')
const { esRolValido, existeEmail } = require('../helpers/db-validators/user-validator');

const { 
  getClientsListWithPage
  , cbxGetCustomersCombo
  , getClientByID
  , insertClient
  , updateClient
  , deleteClient
  , getClientsToSale
  , cbxDireccionCliente
 } = require('../controllers/customersController');


const router = Router();

router.post('/getClientsListWithPage', getClientsListWithPage);

router.post('/cbxGetCustomersCombo', cbxGetCustomersCombo);

router.post('/getClientByID', [
  check('idClient','Id obligatorio').not().isEmpty(),
  check('idClient','Id debe ser numérico').isNumeric(),
  validarCampos
], getClientByID);

router.post('/insertClient', [
  check('name','Nombre obligatorio').not().isEmpty(),

  validarCampos
], insertClient);

router.post('/updateClient', [
  check('idClient','Id obligatorio').not().isEmpty(),
  check('idClient','Id debe ser numérico').isNumeric(),

  check('name','Nombre obligatorio').not().isEmpty(),

  validarCampos
], updateClient);

router.post('/deleteClient', [
  check('idClient','Id obligatorio').not().isEmpty(),
  check('idClient','Id debe ser numérico').isNumeric(),
  validarCampos
], deleteClient);

router.post('/getClientsToSale', getClientsToSale);

router.post('/cbxDireccionCliente', cbxDireccionCliente);

module.exports = router;