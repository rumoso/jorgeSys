#!/usr/bin/env node
// =============================================================================
// Guardián de la puerta única de marcajes (análisis 005, LP-6)
// =============================================================================
// La regla, en una línea:
//
//     Solo helpers/marcaje.js crea o cambia marcajes.
//
// Falla si cualquier otro archivo del Back (controllers, helpers, middlewares,
// routes, models, scripts) hace INSERT, REPLACE o UPDATE sobre la tabla
// `marcajes`. La única excepción es la revisión de un marcaje por revisar
// (aprobar o rechazar, controllers/marcajes.js), que solo llena las columnas
// de revisión y lleva el comentario /* revision-marcaje */ dentro del SQL; el
// guardián las lista para revisarlas a ojo.
//
//     node scripts/auditar-marcajes.js        (también lo corre `npm run auditar`)
// =============================================================================

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CARPETAS = ['controllers', 'helpers', 'middlewares', 'routes', 'models', 'scripts'];
const PUERTA = 'helpers/marcaje.js';
const RE_ESCRIBE = /\b(insert\s+(?:ignore\s+)?into|replace\s+into|update)\s+`?marcajes`?(?![\w])/i;
const RE_MARCA = /\/\*\s*revision-marcaje\s*\*\//i;

const archivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(p);
    return e.name.endsWith('.js') ? [p] : [];
});

const errores = [];
const revisiones = [];
let revisados = 0;

for (const carpeta of CARPETAS) {
    const dir = path.join(RAIZ, carpeta);
    if (!fs.existsSync(dir)) continue;
    for (const archivo of archivos(dir)) {
        const rel = path.relative(RAIZ, archivo).replace(/\\/g, '/');
        if (rel === PUERTA || rel === 'scripts/auditar-marcajes.js') continue;
        revisados++;
        const src = fs.readFileSync(archivo, 'utf8');
        for (const m of src.matchAll(/`([^`]*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
            const sql = m[1] ?? m[2] ?? m[3];
            if (!RE_ESCRIBE.test(sql)) continue;
            const donde = `${ rel }:${ src.slice(0, m.index).split('\n').length }`;
            if (RE_MARCA.test(sql)) revisiones.push(donde);
            else errores.push(`${ donde }: escribe en marcajes fuera de ${ PUERTA }`);
        }
    }
}

console.log(`Archivos revisados: ${ revisados }`);
if (revisiones.length) {
    console.log('Revisión de marcajes (solo columnas de revisión; revisarlas a ojo):');
    revisiones.forEach(r => console.log(`   ${ r }`));
}
if (errores.length) {
    console.error(`\n✘ ${ errores.length } escritura(s) en marcajes fuera de la puerta única:`);
    errores.forEach(e => console.error(`   ${ e }`));
    console.error(`\nCrea marcajes solo con registrarMarcaje (${ PUERTA }).`);
    process.exit(1);
}
console.log(`✔ Solo ${ PUERTA } escribe marcajes.`);
