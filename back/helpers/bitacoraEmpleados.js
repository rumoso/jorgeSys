const { db, QueryTypes } = require('./db');

// Bitácora de empleados (LP-4): alta, edición, baja, reingreso, cambio de
// sucursal principal u operativa, precio e importación. Quién, cuándo, antes
// y después. No se edita ni se borra.
//
// Con `antes` y `despues` como objetos se guardan SOLO los campos que
// cambiaron; si nada cambió no se registra (regresa false).

// '' y null cuentan igual; 10 y '10.00' no se comparan aquí: llegan ya normalizados.
const norma = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const igual = (a, b) => norma(a) === norma(b);

/** Solo los campos que cambiaron: { antes, despues } o null si no cambió nada. */
const cambios = (antes, despues) => {
    if (!antes || !despues || typeof antes !== 'object' || typeof despues !== 'object') return { antes, despues };
    const a = {}, d = {};
    for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
        if (!(k in despues)) continue;          // lo que no se mandó no cambió
        if (igual(antes[k], despues[k])) continue;
        a[k] = antes[k] ?? null;
        d[k] = despues[k] ?? null;
    }
    return Object.keys(d).length ? { antes: a, despues: d } : null;
};

const registrar = async (req, { idEmpleado, tipo, antes = null, despues = null }, transaction) => {
    const c = cambios(antes, despues);
    if (!c) return false;
    await db.empresa(req).query(`
        INSERT INTO bitacora_empleados (idEmpresa, idEmpleado, tipo, antes, despues, idUsuarioAutor, idSesionSoporte)
        VALUES (:idEmpresa, :idEmpleado, :tipo, :antes, :despues, :autor, :soporte)`, {
        replacements: {
            idEmpleado, tipo, autor: req.uid ?? null, soporte: req.soporte?.idSesionSoporte ?? null,
            antes: c.antes === null || c.antes === undefined ? null : JSON.stringify(c.antes),
            despues: c.despues === null || c.despues === undefined ? null : JSON.stringify(c.despues)
        },
        type: QueryTypes.INSERT,
        transaction
    });
    return true;
};

module.exports = { registrar, cambios };
