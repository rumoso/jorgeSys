// =============================================================================
// Bitácora del producto (análisis 009 §10, LP-4)
// =============================================================================
// Todo lo que hace un superadministrador. Toda escritura del panel la llama
// DENTRO de su transacción: si la bitácora falla, la escritura no se guarda.
//
//     await bitacoraProducto.registrar(req, {
//         accion: 'EMPRESA_SUSPENSION', idEmpresa, objeto: null,
//         antes: { estado: 'ACTIVA' }, despues: { estado: 'SUSPENDIDA' }, motivo
//     }, t);
//
// `antes` y `despues` se guardan como JSON (cualquier valor). La tabla no se
// edita ni se borra (disparadores de 009b y el guardián).
// =============================================================================

const { db, QueryTypes } = require('../db');

const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const corto = (v, n) => (v === undefined || v === null || v === '' ? null : String(v).slice(0, n));

/** `req` ya pasó por validarPanel (req.idSuperadmin y req.superadmin). */
const registrar = async (req, { accion, idEmpresa = null, objeto = null, antes = null, despues = null, motivo = null }, transaccion = null) => {
    if (!accion) throw new Error('[bitacoraProducto] Falta la acción');
    await db.panel(req).query(`
        INSERT INTO bitacora_producto (idSuperadmin, nombreSuperadmin, accion, idEmpresa, objeto, antes, despues, motivo, ip)
        VALUES (:idSuperadmin, :nombre, :accion, :idEmpresa, :objeto, :antes, :despues, :motivo, :ip)`, {
        replacements: {
            idSuperadmin: req.idSuperadmin,
            nombre: corto(req.superadmin?.nombre, 150) || `Superadministrador ${ req.idSuperadmin }`,
            accion: corto(accion, 60),
            idEmpresa: idEmpresa ? Number(idEmpresa) : null,
            objeto: corto(objeto, 150),
            antes: json(antes),
            despues: json(despues),
            motivo: corto(motivo, 500),
            ip: corto(req.ip, 64)
        },
        type: QueryTypes.INSERT,
        transaction: transaccion || undefined
    });
};

module.exports = { registrar };
