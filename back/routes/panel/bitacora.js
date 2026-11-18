const { Router } = require('express');
const { validarPanel } = require('../../middlewares/validar-panel');
const { getBitacora, getFiltrosBitacora } = require('../../controllers/panel/bitacora');

// Panel del superadministrador (009): /api/panel/bitacora. Solo consultas: la
// bitácora del producto no se edita ni se borra.
const router = Router();

router.get('/getBitacora', [
    validarPanel
], getBitacora);

router.get('/getFiltrosBitacora', [
    validarPanel
], getFiltrosBitacora);

module.exports = router;
