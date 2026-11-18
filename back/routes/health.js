// Salud del API para monitoreo (analisis 060). Sin validarJWT a proposito: lo
// consulta un monitor externo, no un usuario. No devuelve versiones, rutas ni
// nada del servidor; solo si la API y la base responden.
const { Router } = require('express');
const { getHealth } = require('../controllers/health');

const router = Router();

router.get('/', getHealth);

module.exports = router;
