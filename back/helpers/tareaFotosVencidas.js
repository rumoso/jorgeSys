// =============================================================================
// Tarea diaria: fotos de evidencia vencidas (análisis 005 §3)
// =============================================================================
// La foto de un marcaje dura `evidencia.dias_foto` días (se fija `vence` al
// guardarla). Al vencer se borra el ARCHIVO y la referencia (`archivo` queda
// en NULL); el marcaje, su resultado y el resto de la evidencia se conservan.
//
// Se programa al arrancar el servidor (models/server.js) y se corre a mano:
//     npm run fotos:vencidas
// =============================================================================

const { db, QueryTypes } = require('./db');
const fechas = require('./fechas');
const evidencias = require('./evidencias');

const LOTE = 500;
const CADA_MS = 24 * 60 * 60 * 1000;
const PRIMERA_MS = 60 * 1000;

/** Borra lo vencido hasta `ahora`. Regresa { revisadas, borradas, errores }. */
const limpiarFotosVencidas = async (ahora = fechas.ahora()) => {
    const salida = { revisadas: 0, borradas: 0, errores: 0 };
    for (;;) {
        const lote = await db.sinEmpresa.query(`
            SELECT idEvidencia, idEmpresa, archivo FROM marcajes_evidencias
             WHERE tipo = 'foto' AND archivo IS NOT NULL AND vence IS NOT NULL AND vence <= :ahora
             ORDER BY idEvidencia LIMIT ${ LOTE }
             /* sin-empresa: tarea del sistema que recorre todas las empresas; cada renglón conserva su idEmpresa */`,
        { replacements: { ahora: ahora.toISOString().replace('T', ' ').replace('Z', '') } });
        if (!lote.length) break;
        for (const ev of lote) {
            salida.revisadas++;
            try {
                await evidencias.borrarFoto(ev.archivo);
                await db.empresa({ idEmpresa: ev.idEmpresa }).query(`
                    UPDATE marcajes_evidencias
                       SET archivo = NULL, dato = JSON_SET(COALESCE(dato, JSON_OBJECT()), '$.fotoEliminada', :ahora)
                     WHERE idEmpresa = :idEmpresa AND idEvidencia = :idEvidencia`,
                { replacements: { idEvidencia: ev.idEvidencia, ahora: ahora.toISOString() }, type: QueryTypes.UPDATE });
                salida.borradas++;
            } catch (e) {
                salida.errores++;
                console.error(`[fotosVencidas] evidencia ${ ev.idEvidencia }`, e.message);
            }
        }
        if (salida.errores && salida.errores >= salida.revisadas) break;   // no ciclar sobre lo que no se puede borrar
        if (lote.length < LOTE) break;
    }
    return salida;
};

/** La programa: un minuto después de arrancar y luego cada 24 horas. */
const programar = () => {
    const correr = () => limpiarFotosVencidas()
        .then(r => { if (r.revisadas) console.log(`[fotosVencidas] ${ r.borradas } foto(s) vencida(s) eliminada(s)`); })
        .catch(e => console.error('[fotosVencidas]', e.message));
    setTimeout(correr, PRIMERA_MS).unref();
    setInterval(correr, CADA_MS).unref();
};

module.exports = { limpiarFotosVencidas, programar };
