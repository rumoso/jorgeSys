// Bitácora del checador (análisis 005, LP-4): vinculación y revocación de
// dispositivos, cambios de política, consentimientos, registros de rostro y
// revisión de marcajes. No se edita ni se borra.
const { db, QueryTypes } = require('./db');

const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/**
 * registrar(req, { tipo, descripcion, idSucursal?, idDispositivo?, idEmpleado?,
 *                  idMarcaje?, antes?, despues? }, transaction?)
 * El autor es el usuario de la sesión (nulo si lo hizo el propio dispositivo o
 * soporte; en soporte queda su idSesionSoporte, 009).
 */
const registrar = (req, e, transaction) => db.empresa(req).query(`
    INSERT INTO bitacora_checador (idEmpresa, tipo, idSucursal, idDispositivo, idEmpleado, idMarcaje,
                                   descripcion, antes, despues, idUsuarioAutor, idSesionSoporte)
    VALUES (:idEmpresa, :tipo, :idSucursal, :idDispositivo, :idEmpleado, :idMarcaje,
            :descripcion, :antes, :despues, :autor, :soporte)`, {
    replacements: {
        tipo: e.tipo, idSucursal: e.idSucursal ?? null, idDispositivo: e.idDispositivo ?? null,
        idEmpleado: e.idEmpleado ?? null, idMarcaje: e.idMarcaje ?? null,
        descripcion: String(e.descripcion).slice(0, 250), antes: json(e.antes), despues: json(e.despues),
        autor: req.uid ?? null,
        soporte: req.soporte?.idSesionSoporte ?? null
    },
    type: QueryTypes.INSERT,
    transaction
});

module.exports = { registrar };
