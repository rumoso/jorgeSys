#!/usr/bin/env node
// =============================================================================
// Auditor de permisos de acción (heredado de AgroEnvases, análisis 050)
// =============================================================================
// La regla del sistema, en una línea:
//
//     Si una ruta escribe, exige una acción.
//
// Este script la comprueba. Recorre `routes/`, lee el arreglo de middlewares de
// cada `router.*` y falla si encuentra una escritura (POST, PUT, PATCH, DELETE)
// sin `validarAccion`, salvo las excepciones declaradas abajo.
//
// Correrlo cada vez que se agrega un endpoint:
//     node scripts/auditar-permisos.js
//
// Las excepciones viven aquí y no en un comentario suelto a propósito: una
// excepción que no está en esta lista hace fallar el script, así que agregar
// una obliga a escribir por qué.
// =============================================================================

const fs = require('fs');
const path = require('path');

const RUTAS_DIR = path.join(__dirname, '..', 'routes');

/** Escrituras que NO llevan acción, con la razón. `archivo` → { 'VERBO /ruta': razón } */
const EXCEPCIONES = {
    'auth.js': {
        'POST /login': 'Es la puerta: pedir permiso para entrar no tiene sentido',
        'POST /seleccionarEmpresa': 'Escoge entre las empresas de la propia cuenta; valida su propio token'
    },
    'global.js': {
        'POST /setPreferencia': 'Cualquier usuario con sesión, solo sus propias preferencias (req.uid y empresa del token)'
    },
    // Análisis 005: el dispositivo checador no tiene sesión de usuario.
    'checador.js': {
        'POST /vincular': 'El dispositivo aún no tiene llave: lo autoriza el código de un solo uso que generó un administrador con dispositivos_CreateUpdate; limitado por origen',
        'POST /latido': 'Con la llave del dispositivo (validarDispositivo); solo actualiza su propia última conexión',
        'POST /checar': 'Con la llave del dispositivo (validarDispositivo); crea marcajes solo por helpers/marcaje.js, en su empresa y sucursal; limitado por dispositivo',
        'POST /checarConNumero': 'Con la llave del dispositivo (validarDispositivo); lo que no se resuelve queda por revisar; limitado por dispositivo'
    },
    'cuenta.js': {
        'POST /updateMiCuenta': 'Cualquier usuario con sesión, solo sobre su propia cuenta (req.uid)',
        'POST /cambiarPassword': 'Cualquier usuario con sesión, solo sobre su propia cuenta; pide la actual'
    }
};


const ESCRIBEN = ['post', 'put', 'patch', 'delete'];

const rutasDe = (src) => {
    const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'([\s\S]*?)\n(?=router\.|module\.exports|$)/g;
    const out = [];
    let m;
    while ((m = re.exec(src))) {
        const [, verbo, ruta, resto] = m;
        out.push({
            verbo: verbo.toLowerCase(),
            clave: `${ verbo.toUpperCase() } ${ ruta }`,
            // validarAccion('una') o validarAccion(['una', 'otra']) ("cualquiera de estas").
            acciones: [...resto.matchAll(/validarAccion\(\s*\[?([^)\]]*)\]?\s*\)/g)]
                .flatMap(x => [...x[1].matchAll(/'([^']+)'/g)].map(n => n[1])),
            conJWT: /validarJWT/.test(resto),
            resto
        });
    }
    return out;
};

let totales = { rutas: 0, escrituras: 0, protegidas: 0, exentas: 0 };
const faltan = [];
const exencionesSinUsar = [];
const sinSesion = [];

for (const archivo of fs.readdirSync(RUTAS_DIR).filter(f => f.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(RUTAS_DIR, archivo), 'utf8');
    const exentasDelArchivo = EXCEPCIONES[archivo] || {};
    const vistas = new Set();

    // `menus.js` aplica la sesión a todo el archivo con `router.use(validarJWT)`
    // en vez de ruta por ruta. Sin mirar eso, el auditor reportaba nueve rutas
    // como abiertas cuando no lo están — y un auditor que grita sin razón se
    // deja de leer.
    const jwtGlobal = /router\.use\(\s*validarJWT\s*\)/.test(src);

    for (const r of rutasDe(src)) {
        totales.rutas++;
        if (!ESCRIBEN.includes(r.verbo)) continue;
        totales.escrituras++;

        if (!r.conJWT && !jwtGlobal && !exentasDelArchivo[r.clave]) sinSesion.push(`${ archivo } ${ r.clave }`);

        if (r.acciones.length) { totales.protegidas++; continue; }

        if (exentasDelArchivo[r.clave]) { totales.exentas++; vistas.add(r.clave); continue; }
        faltan.push(`${ archivo.padEnd(26) } ${ r.clave }`);
    }

    for (const clave of Object.keys(exentasDelArchivo)) {
        if (!vistas.has(clave)) exencionesSinUsar.push(`${ archivo } ${ clave }`);
    }
}

// ── Panel del superadministrador (análisis 009) ─────────────────────────────
// Otra regla: toda ruta de routes/panel/ exige `validarPanel` (salvo la
// entrada), ninguna usa `validarJWT` ni `validarAccion` (son de las
// empresas), y ninguna ruta de empresa usa `validarPanel`.

/** Rutas del panel sin sesión del panel, con la razón. `archivo` → { 'VERBO /ruta': razón } */
const EXCEPCIONES_PANEL = {
    'auth.js': {
        'POST /login': 'Es la puerta del panel: correo y contraseña; limitada por IP y por correo',
        'POST /verificar2fa': 'Segundo paso de la entrada: valida su propio token panel2fa; limitada por IP y por cuenta'
    }
};

const PANEL_DIR = path.join(RUTAS_DIR, 'panel');
const panelMal = [];
let rutasPanel = 0;

for (const archivo of fs.readdirSync(RUTAS_DIR).filter(f => f.endsWith('.js'))) {
    if (/validarPanel/.test(fs.readFileSync(path.join(RUTAS_DIR, archivo), 'utf8'))) {
        panelMal.push(`${ archivo }: una ruta de empresa usa validarPanel`);
    }
}

for (const archivo of fs.existsSync(PANEL_DIR) ? fs.readdirSync(PANEL_DIR).filter(f => f.endsWith('.js')).sort() : []) {
    const src = fs.readFileSync(path.join(PANEL_DIR, archivo), 'utf8');
    const exentas = EXCEPCIONES_PANEL[archivo] || {};
    const panelGlobal = /router\.use\(\s*validarPanel\s*\)/.test(src);
    if (/validarJWT|validarAccion|validarMenu/.test(src)) {
        panelMal.push(`panel/${ archivo }: usa validarJWT, validarAccion o validarMenu (son de las sesiones de empresa)`);
    }
    for (const r of rutasDe(src)) {
        rutasPanel++;
        totales.rutas++;
        const conPanel = panelGlobal || /validarPanel/.test(r.resto);
        if (!conPanel && !exentas[r.clave]) panelMal.push(`panel/${ archivo } ${ r.clave }: sin validarPanel`);
        if (conPanel && exentas[r.clave]) panelMal.push(`panel/${ archivo } ${ r.clave }: exenta pero usa validarPanel (quita la excepción)`);
    }
}

console.log(`Rutas: ${ totales.rutas } · escrituras: ${ totales.escrituras } · `
    + `con acción: ${ totales.protegidas } · exentas: ${ totales.exentas }`);

if (sinSesion.length) {
    console.log('\nEscrituras SIN validarJWT (ni siquiera piden sesión):');
    sinSesion.forEach(x => console.log('   ' + x));
}

// Una excepción que ya no corresponde a ninguna ruta es basura que engaña al
// que lea la lista: se reporta, pero no tumba la auditoría.
if (exencionesSinUsar.length) {
    console.log('\nExcepciones declaradas que ya no existen (bórralas):');
    exencionesSinUsar.forEach(x => console.log('   ' + x));
}

console.log(`\nPanel (009): ${ rutasPanel } ruta(s) en routes/panel/`);
if (panelMal.length) {
    console.log(`\n✘ ${ panelMal.length } problema(s) en las rutas del panel:`);
    panelMal.forEach(x => console.log('   ' + x));
    process.exit(1);
}

if (faltan.length) {
    console.log(`\n✘ ${ faltan.length } escrituras sin acción y sin excepción declarada:`);
    faltan.forEach(x => console.log('   ' + x));
    console.log('\nAgrega validarAccion(\'...\') en la ruta, o declara la excepción '
        + 'en EXCEPCIONES de este script con su razón.');
    process.exit(1);
}

console.log('\n✔ Toda ruta que escribe exige una acción.');
