#!/usr/bin/env node
// Asegura a mano los días programados de todas las empresas activas
// (análisis 006, T8). El servidor ya lo hace solo una vez al día
// (helpers/tareaDiasProgramados.js). Solo crea los días que faltan.
//     npm run dias:asegurar
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.TZ = 'UTC';
const { dbConnection } = require('../database/config');
const { asegurarTodas } = require('../helpers/tareaDiasProgramados');

(async () => {
    try {
        const r = await asegurarTodas({ forzar: true });
        console.log(`✔ ${ r.empresas } empresa(s), ${ r.empleados } empleado(s) activo(s), ${ r.creados } día(s) creado(s), ${ r.errores } error(es)`);
        await dbConnection.close();
        process.exit(r.errores ? 1 : 0);
    } catch (e) {
        console.error('✘', e.message);
        await dbConnection.close().catch(() => {});
        process.exit(1);
    }
})();
