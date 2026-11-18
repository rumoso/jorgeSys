const { db, QueryTypes } = require('./db');

// Bitácora de horarios (LP-4): horario semanal, plantilla, aplicación a
// empleados, día cambiado a mano, regreso al horario y cobertura. Quién,
// cuándo, motivo, antes y después. No se edita ni se borra.

const TIPOS = ['HORARIO', 'PLANTILLA', 'APLICAR', 'DIA', 'DIA_REGRESO', 'COBERTURA'];

const registrar = async (req, { tipo, idEmpleado = null, idSucursal = null, fechaDia = null, motivo = null, antes = null, despues = null }, transaction) => {
    if (!TIPOS.includes(tipo)) throw new Error(`[bitacoraHorarios] Tipo desconocido: ${ tipo }`);
    await db.empresa(req).query(`
        INSERT INTO bitacora_horarios (idEmpresa, idEmpleado, idSucursal, fechaDia, tipo, motivo, antes, despues, idUsuarioAutor)
        VALUES (:idEmpresa, :idEmpleado, :idSucursal, :fechaDia, :tipo, :motivo, :antes, :despues, :autor)`, {
        replacements: {
            idEmpleado, idSucursal, fechaDia, tipo, motivo: motivo ? String(motivo).slice(0, 250) : null,
            antes: antes === null || antes === undefined ? null : JSON.stringify(antes),
            despues: despues === null || despues === undefined ? null : JSON.stringify(despues),
            autor: req.uid ?? null
        },
        type: QueryTypes.INSERT,
        transaction
    });
};

module.exports = { registrar, TIPOS };
