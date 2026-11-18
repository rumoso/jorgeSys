const { Router } = require('express');
const { validarPanel } = require('../../middlewares/validar-panel');
const { getCobroMes, exportarCobroMes } = require('../../controllers/panel/cobro');

// Panel del superadministrador (009): /api/panel/cobro. Solo consultas.
const router = Router();

router.get('/getCobroMes', [
    validarPanel
], getCobroMes);

router.get('/exportarCobroMes', [
    validarPanel
], exportarCobroMes);

module.exports = router;
