// Piezas comunes de las pruebas contra el API (pruebas-fuga, pruebas-sesion).
// Requieren el servidor corriendo y la demo cargada (instalar.js --demo).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.demo.env') });
const { QueryTypes } = require('sequelize');
const { dbConnection } = require('../database/config');

const API = process.env.API_PRUEBAS || `http://localhost:${ process.env.PORT || 9090 }/api`;
const PASSWORD = process.env.DEMO_PASSWORD;
const ID = { A: Number(process.env.DEMO_ID_A), B: Number(process.env.DEMO_ID_B), C: Number(process.env.DEMO_ID_C) };

if (!PASSWORD || !ID.A) {
    console.error('Falta la demo: corre `node scripts/instalar.js --demo --reiniciar`');
    process.exit(1);
}

// nodemon reinicia el servidor al guardar cualquier archivo del Back: si la
// prueba arranca a media recarga, se reintenta la conexión unos segundos.
const pedir = async (url, opciones, intentos = 10) => {
    try {
        return await fetch(url, opciones);
    } catch (e) {
        if (intentos <= 1) throw e;
        await new Promise(r => setTimeout(r, 1000));
        return pedir(url, opciones, intentos - 1);
    }
};

const llamar = async (metodo, ruta, { token, body, headers } = {}) => {
    const r = await pedir(`${ API }${ ruta }`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-token': token } : {}), ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await r.json().catch(() => ({}));
    return { http: r.status, ...json };
};

const correo = (c) => `${ c }@demo.test`;

/** Login directo (cuenta con una sola empresa) o login + selección. */
const entrar = async (usuario, idEmpresa) => {
    const r = await llamar('POST', '/auth/login', { body: { correo: correo(usuario), password: PASSWORD } });
    if (r.status_code !== 0) throw new Error(`No entró ${ usuario }: ${ r.message }`);
    if (!r.data.seleccion) return r.data.token;
    const s = await llamar('POST', '/auth/seleccionarEmpresa', { token: r.data.tokenSeleccion, body: { idEmpresa } });
    if (s.status_code !== 0) throw new Error(`No escogió ${ idEmpresa }: ${ s.message }`);
    return s.data.token;
};

/**
 * Entra al panel del superadministrador de la demo (009) en dos pasos y regresa
 * su token (x-token-panel). Un código ya usado no se acepta: si pasa, espera al siguiente.
 */
const entrarPanel = async () => {
    const totp = require('../helpers/panel/totp');
    const secreto = process.env.DEMO_PANEL_TOTP;
    if (!secreto || !process.env.DEMO_PANEL_CORREO) throw new Error('Falta el superadministrador de la demo: corre `node scripts/instalar.js --demo`');
    for (let i = 0; i < 3; i++) {
        const l = await llamar('POST', '/panel/auth/login', { body: { correo: process.env.DEMO_PANEL_CORREO, password: PASSWORD } });
        if (l.status_code !== 0) throw new Error(`No entró al panel: ${ l.message }`);
        const v = await llamar('POST', '/panel/auth/verificar2fa', { headers: { 'x-token-panel': l.data.token2fa }, body: { codigo: totp.codigoActual(secreto) } });
        if (v.status_code === 0) return v.data.token;
        const espera = (totp.PERIODO_S * 1000) - (Date.now() % (totp.PERIODO_S * 1000)) + 500;
        console.log(`  (código ya usado; espero ${ Math.ceil(espera / 1000) } s al siguiente)`);
        await new Promise(r => setTimeout(r, espera));
    }
    throw new Error('No entró al panel con el código de la demo');
};

const sql = (consulta, replacements = {}) => dbConnection.query(consulta, { replacements, type: QueryTypes.SELECT });
const ejecutar = (consulta, replacements = {}) => dbConnection.query(consulta, { replacements });

/** Marcador de resultados. */
const marcador = () => {
    const malos = [];
    let total = 0;
    return {
        revisar(nombre, ok, detalle = '') {
            total++;
            if (!ok) malos.push(nombre);
            console.log(`${ ok ? '✔' : '✘' } ${ nombre }${ !ok && detalle ? `  → ${ detalle }` : '' }`);
        },
        async terminar(titulo) {
            await dbConnection.close();
            console.log(malos.length ? `\n✘ ${ malos.length } de ${ total } fallaron` : `\n✔ ${ titulo }: ${ total } de ${ total }`);
            process.exit(malos.length ? 1 : 0);
        }
    };
};

module.exports = { API, PASSWORD, ID, llamar, correo, entrar, entrarPanel, sql, ejecutar, marcador };
