// =============================================================================
// Prueba de vida de Face ID (análisis 005 §6 y §7; portada de AgroEnvases 069,
// que la trajo de Violeta 037)
// =============================================================================
// El navegador no manda "pasé la prueba de vida": manda la SECUENCIA de lo que
// vio la cámara durante unos segundos, y aquí se decide. Una secuencia es de
// una persona viva si:
//   - giró la cabeza hacia cada lado del reto (helpers/faceReto.js), en el
//     orden pedido, sin girar antes hacia el otro lado y regresando al
//     frente entre giros;
//   - es la misma cara en toda la secuencia.
//
// El giro se mide como el desplazamiento de la nariz respecto al centro de
// los ojos, en distancias-entre-ojos: una foto inclinada no lo imita y un
// video grabado no sabe qué lados se pedirán.
//
// Cada cuadro: { t (ms), landmarks: 13 puntos [x, y] (ojos 36–47 y nariz 30),
// descriptor?: 128 números, score?: confianza de la detección (0 a 1) }.
//
// Funciones puras: no tocan la base de datos.
// =============================================================================

const PUNTOS_POR_FRAME = 13;
const I_NARIZ = 12;
const LONGITUD_DESCRIPTOR = 128;

const MIN_FRAMES = 8;
const MAX_FRAMES = 200;
const MIN_FRAMES_CON_DESCRIPTOR = 3;
const MAX_FRAMES_CON_DESCRIPTOR = 15;

const GIRO_HORIZONTAL = 0.12;
const CENTRO_HORIZONTAL = 0.06;
const MS_POSTURA_INICIAL = 800;
const MIN_FRAMES_POSTURA_INICIAL = 5;

// Con 0.45 una cara real que se mueve fallaba; dos personas distintas suelen
// quedar arriba de 0.6 (AgroEnvases, prueba con cámara real 2026-11-08).
const DISTANCIA_MAXIMA_MISMA_CARA = 0.55;

// Menos de esto entre los ojos (en pixeles del video) y el descriptor sale malo.
const IPD_MINIMO_PX = 40;

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mediana = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const centro = (o) => [o.reduce((s, p) => s + p[0], 0) / o.length, o.reduce((s, p) => s + p[1], 0) / o.length];
const puntoValido = (p) => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n));

const descriptorValido = (d) => Array.isArray(d) && d.length === LONGITUD_DESCRIPTOR
    && d.every(n => typeof n === 'number' && Number.isFinite(n));

const distancia = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
};

const promedio = (descriptores) => {
    const p = new Array(LONGITUD_DESCRIPTOR).fill(0);
    for (const d of descriptores) for (let i = 0; i < LONGITUD_DESCRIPTOR; i++) p[i] += d[i] / descriptores.length;
    return p.map(n => Math.round(n * 1e6) / 1e6);
};

const medirFrame = (landmarks) => {
    const cA = centro(landmarks.slice(0, 6));
    const cB = centro(landmarks.slice(6, 12));
    const ipd = dist2(cA, cB);
    return { ipd, dx: (landmarks[I_NARIZ][0] - (cA[0] + cB[0]) / 2) / ipd };
};

/** Forma de la secuencia: { ok, error } o { ok, frames, descriptores, scores }. */
const validarSecuencia = (frames) => {
    const error = (e) => ({ ok: false, error: e });
    if (!Array.isArray(frames) || frames.length < MIN_FRAMES || frames.length > MAX_FRAMES) {
        return error('La captura no tiene suficientes cuadros.');
    }
    const salida = [];
    const descriptores = [];
    const scores = [];
    let tAnterior = -1;
    for (const f of frames) {
        if (!f || typeof f.t !== 'number' || !Number.isFinite(f.t) || f.t <= tAnterior) return error('La captura no es válida.');
        if (!Array.isArray(f.landmarks) || f.landmarks.length !== PUNTOS_POR_FRAME || !f.landmarks.every(puntoValido)) {
            return error('La captura no es válida.');
        }
        if (f.descriptor !== undefined && f.descriptor !== null) {
            if (!descriptorValido(f.descriptor)) return error('La captura no es válida.');
            descriptores.push(f.descriptor);
        }
        if (typeof f.score === 'number' && Number.isFinite(f.score)) scores.push(f.score);
        const m = medirFrame(f.landmarks);
        if (!Number.isFinite(m.dx) || m.ipd <= 0) return error('La captura no es válida.');
        salida.push({ t: f.t, ...m });
        tAnterior = f.t;
    }
    if (descriptores.length < MIN_FRAMES_CON_DESCRIPTOR || descriptores.length > MAX_FRAMES_CON_DESCRIPTOR) {
        return error('La captura no es válida.');
    }
    return { ok: true, frames: salida, descriptores, scores };
};

const direccionGiro = (ddx) => (ddx >= GIRO_HORIZONTAL ? 'IZQ' : ddx <= -GIRO_HORIZONTAL ? 'DER' : null);
const estaAlCentro = (ddx) => Math.abs(ddx) < CENTRO_HORIZONTAL;

const posturaInicial = (frames) => {
    const t0 = frames[0].t;
    let inicial = frames.filter(f => f.t - t0 <= MS_POSTURA_INICIAL);
    if (inicial.length < MIN_FRAMES_POSTURA_INICIAL) inicial = frames.slice(0, MIN_FRAMES_POSTURA_INICIAL);
    return inicial.length < MIN_FRAMES_POSTURA_INICIAL ? null : { n: inicial.length, dx: mediana(inicial.map(f => f.dx)) };
};

const siguioGiros = (frames, giros) => {
    const postura = posturaInicial(frames);
    if (!postura) return { ok: false, motivo: 'no hubo postura de frente al inicio' };
    let k = 0;
    let esperaCentro = false;
    for (const f of frames.slice(postura.n)) {
        const ddx = f.dx - postura.dx;
        if (esperaCentro) { esperaCentro = !estaAlCentro(ddx); continue; }
        const dir = direccionGiro(ddx);
        if (!dir) continue;
        if (dir !== giros[k]) return { ok: false, motivo: `giró hacia ${ dir } cuando se esperaba ${ giros[k] }` };
        k++;
        if (k === giros.length) return { ok: true };
        esperaCentro = true;
    }
    return { ok: false, motivo: `no completó el giro ${ k + 1 } de ${ giros.length } (${ giros[k] })` };
};

const distanciaMaximaEntreCuadros = (descriptores) => {
    let max = 0;
    for (let i = 0; i < descriptores.length; i++) {
        for (let j = i + 1; j < descriptores.length; j++) max = Math.max(max, distancia(descriptores[i], descriptores[j]));
    }
    return max;
};

/** Datos para la bitácora de intentos: con ellos se ajustan los umbrales. */
const diagnostico = (sec) => {
    const f = sec.frames;
    const p = posturaInicial(f);
    return {
        cuadros: f.length,
        segundos: Math.round((f[f.length - 1].t - f[0].t) / 100) / 10,
        giroIzq: p ? Math.round(Math.max(...f.map(x => x.dx - p.dx)) * 100) / 100 : null,
        giroDer: p ? Math.round(-Math.min(...f.map(x => x.dx - p.dx)) * 100) / 100 : null,
        carasA: Math.round(distanciaMaximaEntreCuadros(sec.descriptores) * 100) / 100
    };
};

/** { ok } o { ok: false, motivo, diagnostico }. `pasos`: los giros del reto. */
const validarVida = (sec, pasos) => {
    const falla = (motivo) => ({ ok: false, motivo, diagnostico: diagnostico(sec) });
    if (distanciaMaximaEntreCuadros(sec.descriptores) > DISTANCIA_MAXIMA_MISMA_CARA) return falla('la cara cambió durante la captura');
    const g = siguioGiros(sec.frames, pasos);
    if (!g.ok) return falla(g.motivo);
    return { ok: true, diagnostico: diagnostico(sec) };
};

/**
 * Calidad de una secuencia para el REGISTRO: tamaño (distancia entre ojos) y
 * confianza de la detección. { ok, motivo?, calidad: { score, ipd } }.
 */
const revisarCalidad = (sec, calidadMinima) => {
    const ipd = mediana(sec.frames.map(f => f.ipd));
    const score = sec.scores.length ? mediana(sec.scores) : null;
    const calidad = { ipd: Math.round(ipd), score: score === null ? null : Math.round(score * 100) / 100 };
    if (ipd < IPD_MINIMO_PX) return { ok: false, motivo: 'El rostro se ve muy pequeño: acércate a la cámara.', calidad };
    if (score === null || score < calidadMinima) {
        return { ok: false, motivo: 'La imagen no tiene la calidad mínima: busca buena luz de frente y mira a la cámara.', calidad };
    }
    return { ok: true, calidad };
};

module.exports = {
    LONGITUD_DESCRIPTOR, IPD_MINIMO_PX, PUNTOS_POR_FRAME,
    descriptorValido, distancia, promedio, validarSecuencia, validarVida, revisarCalidad, medirFrame
};
