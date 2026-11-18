// =============================================================================
// Reto de la prueba de vida (análisis 005; de AgroEnvases 069 / Violeta 037)
// =============================================================================
// Antes de grabar, el navegador pide un reto: giros de cabeza al azar.
//   - CHECADOR: 1 o 2 (lo de todos los días, rápido);
//   - REGISTRO del rostro: 2.
// Un solo uso, vence en 20 s y es de quien lo pidió (el dispositivo o el
// usuario, con su empresa en la llave). En memoria: el Back es un proceso.
// =============================================================================

const crypto = require('crypto');

const SEGUNDOS_VIGENCIA = 20;
const LADOS = ['IZQ', 'DER'];
const retos = new Map();   // idReto → { duenio, flujo, pasos, vence }

const limpiar = () => {
    const ahora = Date.now();
    for (const [id, r] of retos) if (r.vence <= ahora) retos.delete(id);
};

/** duenio: 'd:<idEmpresa>:<idDispositivo>' o 'u:<idEmpresa>:<idUsuario>'. */
const generar = (flujo, duenio) => {
    limpiar();
    const giros = flujo === 'REGISTRO' ? 2 : crypto.randomInt(1, 3);
    const pasos = Array.from({ length: giros }, () => LADOS[crypto.randomInt(LADOS.length)]);
    const idReto = crypto.randomUUID();
    retos.set(idReto, { duenio, flujo, pasos, vence: Date.now() + SEGUNDOS_VIGENCIA * 1000 });
    return { idReto, pasos, segundosVigencia: SEGUNDOS_VIGENCIA };
};

/** Se borra al usarlo, aunque falle. { ok, pasos } o { ok: false, error }. */
const consumir = (idReto, flujo, duenio) => {
    const r = retos.get(String(idReto || ''));
    retos.delete(String(idReto || ''));
    if (!r) return { ok: false, error: 'La captura venció o ya se usó. Intenta de nuevo.' };
    if (r.vence <= Date.now()) return { ok: false, error: 'El tiempo para la captura venció. Intenta de nuevo.' };
    if (r.flujo !== flujo || r.duenio !== duenio) return { ok: false, error: 'La captura no corresponde a esta operación.' };
    return { ok: true, pasos: r.pasos };
};

module.exports = { SEGUNDOS_VIGENCIA, generar, consumir };
