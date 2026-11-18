#!/usr/bin/env node
// Elimina a mano las fotos de evidencia vencidas (análisis 005, T24). El
// servidor ya lo hace solo cada 24 horas (helpers/tareaFotosVencidas.js).
//     npm run fotos:vencidas
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.TZ = 'UTC';
const { dbConnection } = require('../database/config');
const { limpiarFotosVencidas } = require('../helpers/tareaFotosVencidas');

(async () => {
    try {
        const r = await limpiarFotosVencidas();
        console.log(`✔ Revisadas ${ r.revisadas }, eliminadas ${ r.borradas }, con error ${ r.errores }`);
        await dbConnection.close();
        process.exit(r.errores ? 1 : 0);
    } catch (e) {
        console.error('✘', e.message);
        await dbConnection.close().catch(() => {});
        process.exit(1);
    }
})();
