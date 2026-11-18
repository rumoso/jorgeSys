#!/usr/bin/env node
// =============================================================================
// Guardián de empresa (análisis 001, LP-1)
// =============================================================================
// La regla, en una línea:
//
//     Toda consulta a una tabla de empresa filtra por la empresa de la sesión.
//
// Revisa el código sin correrlo:
//  1. Nadie fuera de helpers/db.js usa `dbConnection` (todo pasa por el ayudante).
//  2. Todo SQL que toca una tabla de empresa trae `:idEmpresa`, o el comentario
//     `/* sin-empresa: motivo */` (se listan para revisarlas a ojo).
//  3. Todo SQL menciona solo tablas declaradas en helpers/tablasEmpresa.js.
//  4. Ninguna ruta lee `idEmpresa` de req.body, req.query ni req.params, salvo
//     las excepciones de abajo, con su razón.
//  5. Toda tabla creada en SQL/*.sql está declarada, y las de empresa tienen
//     la columna idEmpresa.
//  6. Panel del superadministrador (009, única excepción a LP-1):
//     - `db.panel` solo en controllers/panel/, helpers/panel/ (y scripts/);
//     - sus consultas que cruzan empresas llevan `/* panel: motivo */` y se
//       listan; las tablas del panel no aparecen fuera del panel;
//     - las rutas de empresa no importan controllers/panel/, ni al revés;
//     - nadie actualiza ni borra bitacora_producto;
//     - `db.planDeEmpresa` (lectura del plan de la empresa de la sesión)
//       solo en helpers/panel/plan.js.
//
//     node scripts/auditar-empresa.js        (también lo corre `npm run auditar`)
// =============================================================================

const fs = require('fs');
const path = require('path');
const { TABLAS_EMPRESA, TABLAS_GLOBALES, TABLAS_PANEL, tablasDe } = require('../helpers/tablasEmpresa');

const RAIZ = path.join(__dirname, '..');
const CARPETAS = ['controllers', 'helpers', 'middlewares', 'routes'];
const NO_REVISAR = ['helpers/db.js', 'helpers/tablasEmpresa.js'];

/** Archivos que pueden usar dbConnection directo. `archivo` → razón */
const EXCEPCIONES_DB = {
    'controllers/health.js': 'SELECT 1 de infraestructura para el monitor; no toca tablas'
};

/** Lecturas de idEmpresa del navegador permitidas. `archivo` → razón */
const EXCEPCIONES_ID_EMPRESA = {
    'controllers/auth.js': 'seleccionarEmpresa: escoge entre las empresas a las que la cuenta YA tiene acceso activo; se valida contra usuarios_empresa'
};

const RE_SIN_EMPRESA = /\/\*\s*sin-empresa:\s*(\S[^*]*)\*\//i;
const RE_SQL = /\b(select|insert|update|delete)\b[\s\S]*\b(from|into|update)\b/i;
const declarada = (t) => TABLAS_EMPRESA.includes(t) || TABLAS_GLOBALES.includes(t) || TABLAS_PANEL.includes(t);

// 009: lo del panel vive en sus propias carpetas.
const RE_PANEL = /\/\*\s*panel:\s*(\S[^*]*)\*\//i;
const esDelPanel = (archivo) => /^(controllers|helpers|routes)\/panel\//.test(archivo);
// Único archivo que lee el plan vigente de la empresa de la sesión (db.planDeEmpresa, T22).
const ARCHIVO_PLAN_EMPRESA = 'helpers/panel/plan.js';
const delPanel = [];

const errores = [];
const sinEmpresa = [];
let consultas = 0;

const archivos = CARPETAS.flatMap(c => {
    const dir = path.join(RAIZ, c);
    if (!fs.existsSync(dir)) return [];
    // Con sus subcarpetas (p. ej. helpers/verificaciones/, análisis 005).
    const lista = (rel) => fs.readdirSync(path.join(RAIZ, rel), { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? lista(`${ rel }/${ e.name }`) : e.name.endsWith('.js') ? [`${ rel }/${ e.name }`] : []);
    return lista(c);
}).filter(f => !NO_REVISAR.includes(f));

const linea = (src, idx) => src.slice(0, idx).split('\n').length;

for (const archivo of archivos) {
    const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');

    // 1. dbConnection directo
    if (/\bdbConnection\b/.test(src) && !EXCEPCIONES_DB[archivo]) {
        errores.push(`${ archivo }: usa dbConnection directo; consulta con helpers/db.js`);
    }

    // 2 y 3. Cada cadena que parece SQL (template literal o comillas simples)
    for (const m of src.matchAll(/`([^`]*)`|'((?:[^'\\\n]|\\.)*)'/g)) {
        const sql = m[1] ?? m[2];
        const donde = `${ archivo }:${ linea(src, m.index) }`;

        // 6. Panel (también en un UPDATE simple, que RE_SQL no cuenta)
        if (/\b(select|insert|update|delete)\b/i.test(sql)) {
            const tablasPanel = tablasDe(sql).filter(t => TABLAS_PANEL.includes(t));
            if (tablasPanel.length && !esDelPanel(archivo)) {
                errores.push(`${ donde }: tabla(s) del panel fuera de controllers/panel/ o helpers/panel/ → ${ tablasPanel.join(', ') }`);
            }
            if (/\b(update\s+`?bitacora_producto\b|delete\s+(?:\w+\s+)?from\s+`?bitacora_producto\b)/i.test(sql)) {
                errores.push(`${ donde }: bitacora_producto no se edita ni se borra`);
            }
        }

        if (!RE_SQL.test(sql)) continue;
        consultas++;
        const tablas = tablasDe(sql);

        const desconocidas = tablas.filter(t => !declarada(t));
        if (desconocidas.length) errores.push(`${ donde }: tabla(s) sin declarar → ${ desconocidas.join(', ') }`);

        const deEmpresa = tablas.filter(t => TABLAS_EMPRESA.includes(t));
        if (!deEmpresa.length) continue;
        if (esDelPanel(archivo)) {
            // db.panel no llena :idEmpresa: toda consulta a una tabla de
            // empresa dice por qué la toca el panel.
            const porQue = sql.match(RE_PANEL);
            if (porQue) delPanel.push(`${ donde }: ${ porQue[1].trim() }`);
            else errores.push(`${ donde }: consulta del panel a ${ deEmpresa.join(', ') } sin /* panel: motivo */`);
            continue;
        }
        const motivo = sql.match(RE_SIN_EMPRESA);
        if (motivo) { sinEmpresa.push(`${ donde }: ${ motivo[1].trim() }`); continue; }
        if (!/:idEmpresa\b/.test(sql)) {
            errores.push(`${ donde }: consulta a ${ deEmpresa.join(', ') } sin :idEmpresa`);
        }
    }

    // 4. idEmpresa desde el navegador
    const lecturas = [
        ...src.matchAll(/req\.(body|query|params)\s*(\.\s*idEmpresa|\[\s*['"]idEmpresa['"]\s*\])/g),
        ...src.matchAll(/\{[^{}]*\bidEmpresa\b[^{}]*\}\s*=\s*req\.(body|query|params)/g)
    ];
    // El panel escoge la empresa sobre la que trabaja (excepción única a LP-1).
    if (lecturas.length && !EXCEPCIONES_ID_EMPRESA[archivo] && !esDelPanel(archivo)) {
        for (const l of lecturas) errores.push(`${ archivo }:${ linea(src, l.index) }: lee idEmpresa de req.${ l[1] } (la empresa sale del token)`);
    }

    // 6. Panel: db.panel solo en sus carpetas; rutas y controladores no se cruzan.
    for (const u of src.matchAll(/\bdb\.(panel|panelAcceso)\b/g)) {
        if (!esDelPanel(archivo)) errores.push(`${ archivo }:${ linea(src, u.index) }: db.${ u[1] } fuera de controllers/panel/ o helpers/panel/`);
    }
    // T22: la lectura del plan de la empresa de la sesión vive en UN archivo.
    for (const u of src.matchAll(/\bdb\.planDeEmpresa\b/g)) {
        if (archivo !== ARCHIVO_PLAN_EMPRESA) errores.push(`${ archivo }:${ linea(src, u.index) }: db.planDeEmpresa fuera de ${ ARCHIVO_PLAN_EMPRESA }`);
    }
    if (archivo.startsWith('routes/')) {
        for (const r of src.matchAll(/require\(\s*['"]([^'"]*controllers\/[^'"]*)['"]\s*\)/g)) {
            const aPanel = /controllers\/panel\//.test(r[1]);
            if (esDelPanel(archivo) && !aPanel) {
                errores.push(`${ archivo }:${ linea(src, r.index) }: una ruta del panel importa un controlador de empresa (${ r[1] })`);
            }
            if (!esDelPanel(archivo) && aPanel) {
                errores.push(`${ archivo }:${ linea(src, r.index) }: una ruta de empresa importa un controlador del panel (${ r[1] })`);
            }
        }
    }
}

// 5. Tablas creadas en SQL/
const dirSQL = path.join(RAIZ, '..', 'SQL');
const creadas = new Set();
if (fs.existsSync(dirSQL)) {
    for (const f of fs.readdirSync(dirSQL).filter(x => x.endsWith('.sql'))) {
        const sql = fs.readFileSync(path.join(dirSQL, f), 'utf8').replace(/^\s*--.*$/gm, '');
        for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?`?(\w+)`?\s*\(([\s\S]*?)\)\s*engine/gi)) {
            const tabla = m[1].toLowerCase();
            creadas.add(tabla);
            if (!declarada(tabla)) errores.push(`SQL/${ f }: la tabla ${ tabla } no está en helpers/tablasEmpresa.js`);
            if (TABLAS_EMPRESA.includes(tabla) && !/\bidEmpresa\b/.test(m[2])) {
                errores.push(`SQL/${ f }: la tabla de empresa ${ tabla } no tiene la columna idEmpresa`);
            }
        }
    }
}
const sinCrear = [...TABLAS_EMPRESA, ...TABLAS_GLOBALES, ...TABLAS_PANEL].filter(t => !creadas.has(t));

console.log(`Archivos: ${ archivos.length } · consultas revisadas: ${ consultas } · `
    + `tablas de empresa: ${ TABLAS_EMPRESA.length } · globales: ${ TABLAS_GLOBALES.length } · del panel: ${ TABLAS_PANEL.length }`);

if (sinEmpresa.length) {
    console.log('\nConsultas que cruzan empresas a propósito (revisarlas a ojo):');
    sinEmpresa.forEach(x => console.log('   ' + x));
}
if (delPanel.length) {
    console.log('\nConsultas del panel que cruzan empresas (009, excepción única a LP-1):');
    delPanel.forEach(x => console.log('   ' + x));
}
const excepciones = Object.entries(EXCEPCIONES_ID_EMPRESA);
if (excepciones.length) {
    console.log('\nRutas que reciben idEmpresa (excepciones declaradas):');
    excepciones.forEach(([a, r]) => console.log(`   ${ a }: ${ r }`));
}
if (sinCrear.length) {
    console.log(`\nDeclaradas sin CREATE TABLE en SQL/: ${ sinCrear.join(', ') }`);
}

if (errores.length) {
    console.log(`\n✘ ${ errores.length } problema(s):`);
    errores.forEach(x => console.log('   ' + x));
    process.exit(1);
}
console.log('\n✔ Toda consulta a una tabla de empresa filtra por la empresa de la sesión.');
