const { db, QueryTypes } = require('./db');

// Bitácora de roles y permisos (LP-4): quién, cuándo, qué cambió, antes y
// después. No se edita ni se borra.
//
// Tipos: ROL_CREADO, ROL_EDITADO, ROL_ESTADO, ROL_PERMISOS, USUARIO_ROLES,
// USUARIO_PERMISOS.

const registrar = (req, { tipo, idRol = null, idUsuario = null, descripcion, antes = null, despues = null }, transaction) =>
    db.empresa(req).query(`
        INSERT INTO bitacora_permisos (idEmpresa, idUsuarioAutor, idSesionSoporte, tipo, idRol, idUsuario, descripcion, antes, despues)
        VALUES (:idEmpresa, :autor, :soporte, :tipo, :idRol, :idUsuario, :descripcion, :antes, :despues)`, {
        replacements: {
            autor: req.uid ?? null, soporte: req.soporte?.idSesionSoporte ?? null, tipo, idRol, idUsuario,
            descripcion: String(descripcion).slice(0, 250),
            antes: antes === null ? null : JSON.stringify(antes),
            despues: despues === null ? null : JSON.stringify(despues)
        },
        type: QueryTypes.INSERT,
        transaction
    });

/** Diferencia de dos listas, para guardar solo lo que cambió. */
const diferencia = (antes, despues) => {
    const a = new Set(antes), d = new Set(despues);
    return {
        agregados: [...d].filter(x => !a.has(x)).sort(),
        quitados: [...a].filter(x => !d.has(x)).sort()
    };
};

module.exports = { registrar, diferencia };
