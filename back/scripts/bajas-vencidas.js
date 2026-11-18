#!/usr/bin/env node
// Eliminación de las empresas cuya baja ya venció (análisis 009, T30). El
// servidor ya lo hace solo cada día (helpers/panel/eliminacionEmpresa.js).
// Borra todos los datos de cada una, biometría incluida (LP-5); conserva la
// fila de la empresa (ELIMINADA), su historial, sus planes y sus conteos.
//     npm run bajas:vencidas            (elimina)
//     npm run bajas:vencidas -- --ver   (solo lista las vencidas)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.TZ = 'UTC';
const { dbConnection } = require('../database/config');
const { bajasVencidas, eliminarVencidas } = require('../helpers/panel/eliminacionEmpresa');

(async () => {
    try {
        if (process.argv.includes('--ver')) {
            const lista = await bajasVencidas();
            if (!lista.length) console.log('No hay bajas vencidas');
            lista.forEach(e => console.log(`   ${ e.idEmpresa } · ${ e.nombreComercial } · venció ${ e.fechaBajaProgramada }`));
        } else {
            const r = await eliminarVencidas();
            r.eliminadas.forEach(e => console.log(`✔ ${ e.nombre } (${ e.idEmpresa }) eliminada: `
                + `${ Object.values(e.filas).reduce((s, n) => s + n, 0) } registro(s), ${ e.cuentasEliminadas } cuenta(s) eliminada(s)`));
            r.errores.forEach(e => console.log(`✘ ${ e.nombre } (${ e.idEmpresa }): ${ e.error }`));
            if (!r.eliminadas.length && !r.errores.length) console.log('No hay bajas vencidas');
            if (r.errores.length) process.exitCode = 1;
        }
        await dbConnection.close();
    } catch (e) {
        console.error('✘', e.message);
        await dbConnection.close().catch(() => {});
        process.exit(1);
    }
})();
