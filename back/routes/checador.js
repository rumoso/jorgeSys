const { Router } = require('express');
const { check } = require('express-validator');
const { validarCamposStatusCode } = require('../middlewares');
const { validarDispositivo } = require('../middlewares/validar-dispositivo');
const { subirFotoEvidencia } = require('../middlewares/subir-foto-evidencia');
const { limiteVinculacion, limitePorDispositivo } = require('../helpers/limitadores');
const { vincular, latido, getReto, checar, checarConNumero } = require('../controllers/checador');

// El dispositivo checador (análisis 005): SIN sesión de usuario. Nadie inicia
// sesión en el dispositivo; lo que lo identifica es su llave (encabezado
// `x-dispositivo`), salvo al vincular, que usa el código de un solo uso.
// Las excepciones están declaradas en scripts/auditar-permisos.js.
const router = Router();

router.post('/vincular', [
    limiteVinculacion,
    check('codigo', 'Escribe el código').trim().notEmpty(),
    validarCamposStatusCode
], vincular);

router.post('/latido', [
    validarDispositivo
], latido);

router.get('/getReto', [
    validarDispositivo
], getReto);

router.post('/checar', [
    validarDispositivo,
    limitePorDispositivo,
    subirFotoEvidencia
], checar);

router.post('/checarConNumero', [
    validarDispositivo,
    limitePorDispositivo,
    subirFotoEvidencia
], checarConNumero);

module.exports = router;
