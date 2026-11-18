#!/usr/bin/env node
// Prueba del ayudante de consultas (análisis 001, T3). No necesita datos.
//     node scripts/probar-db.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.NODE_ENV = 'test';
const { db } = require('../helpers/db');
const { dbConnection } = require('../database/config');

const casos = [];
const caso = (nombre, debeFallar, fn) => casos.push({ nombre, debeFallar, fn });
const req = { idEmpresa: 1 };

caso('tabla de empresa SIN :idEmpresa falla', true,
    () => db.empresa(req).query('SELECT * FROM sucursales'));
caso('tabla de empresa CON :idEmpresa pasa', false,
    () => db.empresa(req).query('SELECT * FROM sucursales WHERE idEmpresa = :idEmpresa'));
caso('idEmpresa del llamador se ignora (gana el de la sesión)', false, async () => {
    const r = await db.empresa(req).query('SELECT :idEmpresa AS e FROM sucursales WHERE idEmpresa = :idEmpresa UNION SELECT :idEmpresa',
        { replacements: { idEmpresa: 999 } });
    if (r.some(x => Number(x.e) !== 1)) throw new Error('usó el idEmpresa del llamador');
});
caso('db.empresa sin empresa en la sesión falla', true,
    () => db.empresa({}).query('SELECT 1 FROM sucursales WHERE idEmpresa = :idEmpresa'));
caso('db.global sobre tabla de empresa falla', true,
    () => db.global.query('SELECT * FROM sucursales'));
caso('db.global sobre tabla global pasa', false,
    () => db.global.query('SELECT * FROM cat_zonas_horarias'));
caso('tabla sin declarar falla', true,
    () => db.global.query('SELECT * FROM tabla_inventada'));
caso('db.sinEmpresa sin motivo falla', true,
    () => db.sinEmpresa.query('SELECT * FROM empresas'));
caso('db.sinEmpresa con motivo pasa', false,
    () => db.sinEmpresa.query('SELECT /* sin-empresa: prueba */ * FROM empresas'));
// 009: panel del superadministrador
const reqPanel = { idSuperadmin: 1 };
caso('db.panel sin superadministrador en la sesión falla', true,
    () => db.panel({ idEmpresa: 1 }).query('SELECT * FROM cat_planes'));
caso('db.panel sobre tabla del panel pasa', false,
    () => db.panel(reqPanel).query('SELECT * FROM cat_planes'));
caso('db.panel sobre tabla de empresa sin motivo falla', true,
    () => db.panel(reqPanel).query('SELECT * FROM empresas'));
caso('db.panel sobre tabla de empresa con motivo pasa', false,
    () => db.panel(reqPanel).query('SELECT /* panel: prueba */ * FROM empresas'));
caso('db.empresa sobre tabla del panel falla', true,
    () => db.empresa(req).query('SELECT * FROM superadmins WHERE :idEmpresa = :idEmpresa'));
caso('db.global sobre tabla del panel falla', true,
    () => db.global.query('SELECT * FROM cat_planes'));
caso('db.sinEmpresa sobre tabla del panel falla', true,
    () => db.sinEmpresa.query('SELECT /* sin-empresa: prueba */ * FROM bitacora_producto'));
caso('db.panelAcceso solo superadmins', false,
    () => db.panelAcceso.query('SELECT idSuperadmin FROM superadmins WHERE correo = :c', { replacements: { c: 'x' } }));
caso('db.panelAcceso sobre otra tabla falla', true,
    () => db.panelAcceso.query('SELECT * FROM superadmins JOIN bitacora_producto b ON 1 = 1'));

(async () => {
    let malos = 0;
    for (const c of casos) {
        let fallo = false;
        try { await c.fn(); } catch { fallo = true; }
        const ok = fallo === c.debeFallar;
        if (!ok) malos++;
        console.log(`${ ok ? '✔' : '✘' } ${ c.nombre }`);
    }
    await dbConnection.close();
    console.log(malos ? `\n${ malos } caso(s) mal` : '\nAyudante de consultas: todo bien');
    process.exit(malos ? 1 : 0);
})();
