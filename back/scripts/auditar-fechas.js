#!/usr/bin/env node
// =============================================================================
// Guardián de fechas de negocio (análisis 003 §5)
// =============================================================================
// La regla: la fecha de negocio se calcula con la zona de la sucursal, en
// helpers/fechas.js. Nunca con el reloj del proceso (su zona depende del
// servidor) ni con el de MySQL.
//
// Este script falla si el código del API usa, fuera de helpers/fechas.js:
//   - en SQL: CURDATE(), CURRENT_DATE, CURTIME(), NOW(), SYSDATE(),
//     CURRENT_TIMESTAMP() o DATE(…) sobre ellos;
//   - en JS: métodos LOCALES de Date (getDate, getDay, getHours, setHours…),
//     `new Date(año, mes, …)`, o toLocale…String sin `timeZone`.
//
// Los métodos UTC (getUTCDate…), `new Date()` como sello y `toISOString()`
// están permitidos: no dependen de la zona del proceso.
//
// Excepción: una línea que de verdad lo necesite lleva el comentario
//     /* fecha-ok: motivo */
// y el guardián la lista para revisarla a ojo.
// =============================================================================

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CARPETAS = ['controllers', 'helpers', 'middlewares', 'routes', 'models'];
const PERMITIDOS = new Set([path.join('helpers', 'fechas.js')]);

const REGLAS = [
    { re: /\b(CURDATE|CURTIME|SYSDATE|UTC_DATE)\s*\(/i, motivo: 'fecha del reloj de MySQL' },
    { re: /\bCURRENT_DATE\b/i, motivo: 'fecha del reloj de MySQL' },
    // `Date.now()` es un sello en milisegundos UTC: está permitido.
    { re: /(?<!\.)\bNOW\s*\(\s*\)/i, motivo: 'NOW() de MySQL' },
    { re: /\bCURRENT_TIMESTAMP\s*\(/i, motivo: 'CURRENT_TIMESTAMP() de MySQL' },
    { re: /\.(get|set)(Date|Day|Month|FullYear|Hours|Minutes|Seconds)\s*\(/, motivo: 'método LOCAL de Date (usa helpers/fechas.js)' },
    { re: /new\s+Date\s*\(\s*\d{4}\s*,/, motivo: 'new Date(año, mes…) en la zona del proceso' },
    { re: /toLocale(Date|Time)?String\s*\((?![^)]*timeZone)/, motivo: 'toLocale…String sin timeZone' }
];

const RE_OK = /\/\*\s*fecha-ok:\s*\S[^*]*\*\//i;

const archivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return e.name.endsWith('.js') ? [p] : [];
});

const fallas = [];
const excepciones = [];

for (const carpeta of CARPETAS) {
    const dir = path.join(RAIZ, carpeta);
    if (!fs.existsSync(dir)) continue;
    for (const archivo of archivos(dir)) {
        const rel = path.relative(RAIZ, archivo);
        if (PERMITIDOS.has(rel)) continue;
        fs.readFileSync(archivo, 'utf8').split(/\r?\n/).forEach((linea, i) => {
            // Comentarios de línea: no son código.
            const codigo = linea.replace(/^\s*(\/\/|\*).*$/, '');
            const regla = REGLAS.find(r => r.re.test(codigo));
            if (!regla) return;
            const donde = `${ rel.replace(/\\/g, '/') }:${ i + 1 }`;
            if (RE_OK.test(linea)) excepciones.push(`${ donde }: ${ RE_OK.exec(linea)[0] }`);
            else fallas.push(`${ donde }: ${ regla.motivo }\n      ${ linea.trim() }`);
        });
    }
}

if (excepciones.length) {
    console.log('Excepciones de fechas declaradas (revisarlas a ojo):');
    excepciones.forEach(e => console.log(`   ${ e }`));
    console.log('');
}

if (fallas.length) {
    console.error('✘ Fechas calculadas con el reloj del proceso o de MySQL:');
    fallas.forEach(f => console.error(`   ${ f }`));
    console.error('\nUsa helpers/fechas.js con la zona de la sucursal, o declara /* fecha-ok: motivo */.');
    process.exit(1);
}

console.log('✔ Ninguna fecha de negocio usa el reloj del proceso ni el de MySQL.');
