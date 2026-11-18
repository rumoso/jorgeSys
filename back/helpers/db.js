// =============================================================================
// Ayudante de consultas (análisis 001, LP-1)
// =============================================================================
// Los controladores NO usan `dbConnection` directo: consultan por aquí.
//
//   db.empresa(req).query(sql, { replacements, type, transaction })
//       Para tablas de empresa. Llena `:idEmpresa` con el de la sesión
//       (req.idEmpresa) y pisa cualquier `idEmpresa` que venga en
//       replacements. Si el SQL toca una tabla de empresa y no trae
//       `:idEmpresa`, lanza error (en producción solo lo registra).
//
//   db.global.query(sql, opts)
//       Solo tablas globales (usuarios, catálogos, bitácora). Si toca una
//       tabla de empresa, lanza error.
//
//   db.sinEmpresa.query(sql, opts)
//       La salida de emergencia, para lo que por naturaleza cruza empresas
//       (las empresas de un usuario al entrar, validar la sesión). El SQL
//       debe traer el comentario `/* sin-empresa: motivo */`; el guardián
//       las lista todas para revisarlas.
//
//   db.panel(req).query(sql, opts)
//       Solo el panel del superadministrador (009, única excepción a LP-1).
//       Exige `req.idSuperadmin` (lo pone validarPanel). Es el único que
//       toca TABLAS_PANEL; si el SQL toca una tabla de empresa, debe traer
//       `/* panel: motivo */`. No llena `:idEmpresa`: la empresa la escoge
//       el superadministrador. Solo en controllers/panel/, helpers/panel/ y
//       scripts/ (lo revisa el guardián).
//
//   db.panelAcceso.query(sql, opts)
//       Para entrar al panel, antes de tener sesión: solo la tabla
//       `superadmins`.
//
//   db.planDeEmpresa(req).query(sql, opts)
//       El plan vigente de la empresa DE LA SESIÓN (009, T22: límite del
//       plan y aviso). Única lectura de `cat_planes` fuera de db.panel: solo
//       SELECT, solo `empresas_planes` y `cat_planes`, exige `:idEmpresa` y
//       lo llena con el de la sesión. Solo en helpers/panel/plan.js (lo
//       revisa el guardián).
//
//   db.transaccion(async (t) => { ... })
//
// Límite conocido: la revisión exige que `:idEmpresa` aparezca en el SQL, no
// que filtre CADA tabla de una consulta con varias. Lo cubren las llaves
// compuestas (SQL), el guardián y las pruebas de fuga.
// =============================================================================

const { QueryTypes } = require('sequelize');
const { dbConnection } = require('../database/config');
const { TABLAS_EMPRESA, TABLAS_GLOBALES, TABLAS_PANEL, tablasDe } = require('./tablasEmpresa');

const ESTRICTO = process.env.NODE_ENV !== 'production';
const RE_SIN_EMPRESA = /\/\*\s*sin-empresa:\s*\S[^*]*\*\//i;
const RE_PANEL = /\/\*\s*panel:\s*\S[^*]*\*\//i;

const falla = (msg) => {
    if (ESTRICTO) throw new Error(`[db] ${ msg }`);
    console.error(`[db] ${ msg }`);
};

const revisarTablasConocidas = (tablas, { panel = false } = {}) => {
    const desconocidas = tablas.filter(t => !TABLAS_EMPRESA.includes(t) && !TABLAS_GLOBALES.includes(t) && !TABLAS_PANEL.includes(t));
    if (desconocidas.length) falla(`Tabla(s) sin declarar en helpers/tablasEmpresa.js: ${ desconocidas.join(', ') }`);
    if (panel) return;
    // Las del panel solo con db.panel. Siempre lanza, también en producción.
    const delPanel = tablas.filter(t => TABLAS_PANEL.includes(t));
    if (delPanel.length) throw new Error(`[db] Tabla(s) del panel fuera de db.panel: ${ delPanel.join(', ') }`);
};

const ejecutar = (sql, opts = {}) => dbConnection.query(sql, {
    type: QueryTypes.SELECT,
    ...opts
});

const empresa = (req) => {
    const idEmpresa = Number(req?.idEmpresa);
    if (!Number.isInteger(idEmpresa) || idEmpresa <= 0) {
        // Esto nunca debe pasar con validarJWT antes en la cadena: no se
        // consulta nada de empresa sin empresa en la sesión.
        throw new Error('[db] db.empresa(req) sin req.idEmpresa (¿falta validarJWT?)');
    }
    return {
        query: (sql, opts = {}) => {
            const tablas = tablasDe(sql);
            revisarTablasConocidas(tablas);
            if (tablas.some(t => TABLAS_EMPRESA.includes(t)) && !/:idEmpresa\b/.test(sql)) {
                falla(`Consulta a tabla de empresa sin :idEmpresa → ${ String(sql).replace(/\s+/g, ' ').slice(0, 160) }`);
            }
            return ejecutar(sql, { ...opts, replacements: { ...(opts.replacements || {}), idEmpresa } });
        }
    };
};

const global = {
    query: (sql, opts = {}) => {
        const tablas = tablasDe(sql);
        revisarTablasConocidas(tablas);
        const deEmpresa = tablas.filter(t => TABLAS_EMPRESA.includes(t));
        if (deEmpresa.length) falla(`db.global toca tabla(s) de empresa: ${ deEmpresa.join(', ') }. Usa db.empresa(req).`);
        return ejecutar(sql, opts);
    }
};

const sinEmpresa = {
    query: (sql, opts = {}) => {
        revisarTablasConocidas(tablasDe(sql));
        if (!RE_SIN_EMPRESA.test(sql)) falla('db.sinEmpresa exige el comentario /* sin-empresa: motivo */ en el SQL');
        return ejecutar(sql, opts);
    }
};

const panel = (req) => {
    const idSuperadmin = Number(req?.idSuperadmin);
    if (!Number.isInteger(idSuperadmin) || idSuperadmin <= 0) {
        throw new Error('[db] db.panel(req) sin req.idSuperadmin (¿falta validarPanel?)');
    }
    return {
        query: (sql, opts = {}) => {
            const tablas = tablasDe(sql);
            revisarTablasConocidas(tablas, { panel: true });
            if (tablas.some(t => TABLAS_EMPRESA.includes(t)) && !RE_PANEL.test(sql)) {
                falla(`db.panel toca tabla(s) de empresa sin /* panel: motivo */ → ${ String(sql).replace(/\s+/g, ' ').slice(0, 160) }`);
            }
            return ejecutar(sql, opts);
        }
    };
};

const panelAcceso = {
    query: (sql, opts = {}) => {
        const tablas = tablasDe(sql);
        const otras = tablas.filter(t => t !== 'superadmins');
        if (!tablas.length || otras.length) throw new Error(`[db] db.panelAcceso solo consulta superadmins${ otras.length ? ` (tocó ${ otras.join(', ') })` : '' }`);
        return ejecutar(sql, opts);
    }
};

const TABLAS_PLAN_EMPRESA = ['empresas_planes', 'cat_planes'];

const planDeEmpresa = (req) => {
    const idEmpresa = Number(req?.idEmpresa);
    if (!Number.isInteger(idEmpresa) || idEmpresa <= 0) {
        throw new Error('[db] db.planDeEmpresa(req) sin req.idEmpresa (¿falta validarJWT?)');
    }
    return {
        query: (sql, opts = {}) => {
            const tablas = tablasDe(sql);
            const otras = tablas.filter(t => !TABLAS_PLAN_EMPRESA.includes(t));
            if (!tablas.length || otras.length) throw new Error(`[db] db.planDeEmpresa solo lee empresas_planes y cat_planes${ otras.length ? ` (tocó ${ otras.join(', ') })` : '' }`);
            const sinComentarios = String(sql).replace(/\/\*[\s\S]*?\*\//g, '').trim();
            if (!/^select\b/i.test(sinComentarios) || /\b(insert|update|delete|replace)\b/i.test(sinComentarios)) {
                throw new Error('[db] db.planDeEmpresa es solo de lectura');
            }
            if (!/:idEmpresa\b/.test(sql)) throw new Error('[db] db.planDeEmpresa exige :idEmpresa');
            return ejecutar(sql, { ...opts, type: QueryTypes.SELECT, replacements: { ...(opts.replacements || {}), idEmpresa } });
        }
    };
};

const transaccion = (fn) => dbConnection.transaction(fn);

module.exports = { db: { empresa, global, sinEmpresa, panel, panelAcceso, planDeEmpresa, transaccion }, QueryTypes };
