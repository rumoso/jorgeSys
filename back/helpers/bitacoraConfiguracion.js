const { db, QueryTypes } = require('./db');

// Bitácora de configuración (LP-4): ajustes de la empresa, excepciones de
// sucursal, zona horaria y constantes por empresa. Quién, cuándo, antes y
// después. No se edita ni se borra.
//
// Tipos: AJUSTE, CONFIRMACION, EXCEPCION (despues NULL = se quitó), ZONA,
// CONSTANTE, UBICACION (punto de una sucursal, "lat, lng"; NULL = sin
// ubicación; análisis 015).

const texto = (v) => (v === null || v === undefined ? null : String(v).slice(0, 2000));

const registrar = (req, { tipo, clave, idSucursal = null, antes = null, despues = null }, transaction) =>
    db.empresa(req).query(`
        INSERT INTO bitacora_configuracion (idEmpresa, idSucursal, tipo, clave, antes, despues, idUsuarioAutor, idSesionSoporte)
        VALUES (:idEmpresa, :idSucursal, :tipo, :clave, :antes, :despues, :autor, :soporte)`, {
        replacements: { idSucursal, tipo, clave, antes: texto(antes), despues: texto(despues), autor: req.uid ?? null,
            soporte: req.soporte?.idSesionSoporte ?? null },
        type: QueryTypes.INSERT,
        transaction
    });

module.exports = { registrar };
