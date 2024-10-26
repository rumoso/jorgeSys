const { Router } = require('express');
const { check } = require('express-validator')

const { validarCampos } = require('../middlewares/validar-campos')
const { esRolValido, existeEmail } = require('../helpers/db-validators/user-validator');

const { 
  saveFlete
  , getFletesListWithPage
  , getFleteByID
  , save_cargas_repartos
  , getCargasDescargas

  , app_getCargasDescargasByChofer
  , app_insertCargaDescargaMovimiento
  , app_getFoliosByReparto
  , app_insertFolio
  , app_getFolioByID
  , deleteFolio
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

router.post('/save_cargas_repartos', [
  check('idFlete','idFlete obligatorio').not().isEmpty(),
  check('idFlete','El idFlete debe ser numérico').isNumeric(),

  check('idDireccionCliente','idDireccionCliente obligatorio').not().isEmpty(),
  check('idDireccionCliente','El idDireccionCliente debe ser numérico').isNumeric(),

  check('fechaCita','La fechaCita es obligatorio').not().isEmpty(),
  check('horaCita','La horaCita es obligatorio').not().isEmpty(),

  check('idConductor','idConductor obligatorio').not().isEmpty(),
  check('idConductor','El idConductor debe ser numérico').isNumeric(),

  check('idUnidad','idUnidad obligatorio').not().isEmpty(),
  check('idUnidad','El idUnidad debe ser numérico').isNumeric(),
  
  validarCampos
], save_cargas_repartos);

router.post('/getCargasDescargas', [
  check('idFlete','idFlete obligatorio').not().isEmpty(),
  check('idFlete','El idFlete debe ser numérico').isNumeric(),

  validarCampos
], getCargasDescargas);

router.post('/app_getCargasDescargasByChofer', [
  check('idConductor','idConductor obligatorio').not().isEmpty(),
  check('idConductor','El idConductor debe ser numérico').isNumeric(),

  validarCampos
], app_getCargasDescargasByChofer);

router.post('/app_insertCargaDescargaMovimiento', [
  check('idCargaReparto','idCargaReparto obligatorio').not().isEmpty(),
  check('idCargaReparto','El idCargaReparto debe ser numérico').isNumeric(),

  check('idMovimientoType','idMovimientoType obligatorio').not().isEmpty(),
  check('idMovimientoType','El idMovimientoType debe ser numérico').isNumeric(),

  check('latGPS','latGPS obligatorio').not().isEmpty(),
  check('longGPS','longGPS obligatorio').not().isEmpty(),

  validarCampos
], app_insertCargaDescargaMovimiento);

router.post('/app_getFoliosByReparto', [
  check('idCargaReparto','idCargaReparto obligatorio').not().isEmpty(),
  check('idCargaReparto','El idCargaReparto debe ser numérico').isNumeric(),

  validarCampos
], app_getFoliosByReparto);

router.post('/app_insertFolio', [
  check('idCargaReparto','idCargaReparto obligatorio').not().isEmpty(),
  check('idCargaReparto','El idCargaReparto debe ser numérico').isNumeric(),

  check('folio','folio obligatorio').not().isEmpty(),

  validarCampos
], app_insertFolio);

router.post('/app_getFolioByID', [
  check('idFolio','idFolio obligatorio').not().isEmpty(),
  check('idFolio','El idFolio debe ser numérico').isNumeric(),

  validarCampos
], app_getFolioByID);

router.post('/deleteFolio', [
  check('idFolio','idFolio obligatorio').not().isEmpty(),
  check('idFolio','El idFolio debe ser numérico').isNumeric(),

  validarCampos
], deleteFolio);

module.exports = router;