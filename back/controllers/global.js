const { db, QueryTypes } = require('../helpers/db');
const { permisosDe, menuDe } = require('../helpers/userActions');
const { usoDelPlan } = require('../helpers/empleados');
const constantes = require('../helpers/constantes');

// Acciones del sistema, no de un módulo de negocio (convención del proyecto).

/** GET /api/global/getUserActions: las claves de acción del usuario en esta empresa. */
const getUserActions = async (req, res) => {
    try {
        const p = await permisosDe(req);
        return res.json({
            status_code: 0,
            message: 'Permisos del usuario',
            data: { admin: p.admin, acciones: [...p.acciones].sort(), menus: [...p.menus].sort() }
        });
    } catch (error) {
        console.error('getUserActions', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar tus permisos', data: null });
    }
};

/** GET /api/global/getMenu: el menú de la sesión, agrupado por módulo. */
const getMenu = async (req, res) => {
    try {
        const data = await menuDe(req, await permisosDe(req));
        return res.json({ status_code: 0, message: 'Menú', data });
    } catch (error) {
        console.error('getMenu', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar el menú', data: null });
    }
};

// ── Preferencias del usuario (003a) ─────────────────────────────────────────
// Siempre las del usuario de la sesión en la empresa de la sesión: nunca se
// recibe de quién son.

const RE_LLAVE = /^[A-Za-z0-9_.-]{1,80}$/;
const MAX_VALOR = 2000;

/** GET /api/global/getPreferencias?ambito= — { ambito: { clave: valor } } */
const getPreferencias = async (req, res) => {
    try {
        const ambito = req.query.ambito ? String(req.query.ambito) : null;
        const filas = await db.empresa(req).query(`
            SELECT ambito, clave, valor FROM usuarios_preferencias
             WHERE idEmpresa = :idEmpresa AND idUsuario = :uid AND (:ambito IS NULL OR ambito = :ambito)`,
        { replacements: { uid: req.uid, ambito } });
        const data = {};
        for (const f of filas) {
            let valor = null;
            try { valor = JSON.parse(f.valor); } catch { valor = null; }
            (data[f.ambito] ??= {})[f.clave] = valor;
        }
        return res.json({ status_code: 0, message: 'Preferencias', data });
    } catch (error) {
        console.error('getPreferencias', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar tus preferencias', data: null });
    }
};

/** POST /api/global/setPreferencia { ambito, clave, valor } — valor null la borra. */
const setPreferencia = async (req, res) => {
    const ambito = String(req.body.ambito || '');
    const clave = String(req.body.clave || '');
    if (!RE_LLAVE.test(ambito) || !RE_LLAVE.test(clave)) {
        return res.json({ status_code: 1, message: 'Preferencia no válida', data: null });
    }
    try {
        if (req.body.valor === null || req.body.valor === undefined) {
            await db.empresa(req).query(`
                DELETE FROM usuarios_preferencias
                 WHERE idEmpresa = :idEmpresa AND idUsuario = :uid AND ambito = :ambito AND clave = :clave`,
            { replacements: { uid: req.uid, ambito, clave }, type: QueryTypes.DELETE });
            return res.json({ status_code: 0, message: 'Preferencia borrada', data: null });
        }
        const valor = JSON.stringify(req.body.valor);
        if (valor.length > MAX_VALOR) {
            return res.json({ status_code: 1, message: 'La preferencia es demasiado grande', data: null });
        }
        await db.empresa(req).query(`
            INSERT INTO usuarios_preferencias (idEmpresa, idUsuario, ambito, clave, valor)
            VALUES (:idEmpresa, :uid, :ambito, :clave, :valor)
            ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        { replacements: { uid: req.uid, ambito, clave, valor }, type: QueryTypes.INSERT });
        return res.json({ status_code: 0, message: 'Preferencia guardada', data: null });
    } catch (error) {
        console.error('setPreferencia', error);
        return res.json({ status_code: 2, message: 'No fue posible guardar tu preferencia', data: null });
    }
};

// ── Aviso del plan (009) ────────────────────────────────────────────────────

/**
 * GET /api/global/getAvisoPlan: uso del plan de la empresa de la sesión, para
 * quien puede dar de alta, reactivar o cargar empleados.
 * data: { plan, tipoCobro, limite, activos, porcentaje, avisoPorcentaje, nivel, mensaje }
 * nivel: NINGUNO, AVISO (desde `plan.aviso_porcentaje`) o LIMITE (100 %).
 */
const getAvisoPlan = async (req, res) => {
    try {
        const uso = await usoDelPlan(req);
        const avisoPorcentaje = await constantes.valor('plan.aviso_porcentaje', req);
        let nivel = 'NINGUNO';
        let mensaje = null;
        if (uso.limite !== null && uso.activos >= uso.limite) {
            nivel = 'LIMITE';
            mensaje = `Llegaste al límite de tu plan ${ uso.plan }: ${ uso.activos } de ${ uso.limite } empleados activos. `
                + 'No puedes dar de alta ni reactivar empleados hasta que el proveedor del sistema suba tu plan.';
        } else if (uso.limite !== null && uso.porcentaje >= avisoPorcentaje) {
            nivel = 'AVISO';
            mensaje = `Vas en el ${ uso.porcentaje } % de tu plan ${ uso.plan }: ${ uso.activos } de ${ uso.limite } empleados activos. `
                + 'Si necesitas más, pide al proveedor del sistema que suba tu plan.';
        }
        return res.json({ status_code: 0, message: mensaje || 'Uso del plan', data: { ...uso, avisoPorcentaje, nivel, mensaje } });
    } catch (error) {
        console.error('getAvisoPlan', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar el uso del plan', data: null });
    }
};

module.exports = { getUserActions, getMenu, getPreferencias, setPreferencia, getAvisoPlan };
