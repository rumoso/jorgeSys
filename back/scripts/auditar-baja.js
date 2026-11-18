#!/usr/bin/env node
// =============================================================================
// Guardián de la baja definitiva (análisis 009, T28 y T30)
// =============================================================================
// Toda tabla de empresa (helpers/tablasEmpresa.js) está en la lista de lo que
// se exporta o en la de lo que no (con su motivo), y en el orden de borrado de
// la eliminación o en lo que se conserva (con su motivo). Una tabla nueva que
// no está hace fallar esta revisión. Sin base.
//
//     node scripts/auditar-baja.js        (también lo corre `npm run auditar`)
// =============================================================================
const { TABLAS_EMPRESA } = require('../helpers/tablasEmpresa');
const { SE_EXPORTAN, NO_SE_EXPORTAN, ORDEN_BORRADO, SE_CONSERVAN, revisarListas } = require('../helpers/panel/tablasBaja');

const errores = revisarListas(TABLAS_EMPRESA);
console.log(`Tablas de empresa: ${ TABLAS_EMPRESA.length } · se exportan: ${ SE_EXPORTAN.length } · no se exportan: ${ Object.keys(NO_SE_EXPORTAN).length }`
    + ` · se borran: ${ ORDEN_BORRADO.length } · se conservan: ${ Object.keys(SE_CONSERVAN).length }`);
console.log('\nNo se exportan:');
Object.entries(NO_SE_EXPORTAN).forEach(([t, m]) => console.log(`   ${ t }: ${ m }`));
console.log('\nSe conservan al eliminar:');
Object.entries(SE_CONSERVAN).forEach(([t, m]) => console.log(`   ${ t }: ${ m }`));
if (errores.length) {
    console.log(`\n✘ ${ errores.length } problema(s) en helpers/panel/tablasBaja.js:`);
    errores.forEach(x => console.log('   ' + x));
    process.exit(1);
}
console.log('\n✔ Toda tabla de empresa tiene su lugar en la exportación y en la eliminación.');
