#!/usr/bin/env node
// Conteo de empleados activos de todas las empresas (análisis 009, T21). El
// servidor ya lo hace solo cada hora (helpers/panel/conteo.js). Repetible el
// mismo día: conserva el mayor número del día.
//     npm run conteo:empleados [-- --fecha AAAA-MM-DD]
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.TZ = 'UTC';
const { dbConnection } = require('../database/config');
const { contarEmpleados } = require('../helpers/panel/conteo');

const i = process.argv.indexOf('--fecha');
const fecha = i > 0 ? process.argv[i + 1] : null;

(async () => {
    try {
        if (fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) throw new Error('--fecha va como AAAA-MM-DD');
        const r = await contarEmpleados(fecha);
        console.log(`✔ Conteo del ${ r.fecha }: ${ r.empresas } empresa(s), ${ r.empleados } empleado(s) activo(s)`);
        await dbConnection.close();
    } catch (e) {
        console.error('✘', e.message);
        await dbConnection.close().catch(() => {});
        process.exit(1);
    }
})();
