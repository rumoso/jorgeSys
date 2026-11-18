// Capturas sintéticas de Face ID para las pruebas (análisis 005). Sin cámara:
// arma la misma SECUENCIA que manda el navegador (cuadros con los puntos de
// ojos y nariz, descriptores y confianza de la detección), siguiendo (o no)
// los giros del reto. La usan pruebas-checador.js y pruebas-fuga.js.
const crypto = require('crypto');

/** Número aleatorio con distribución normal (Box-Muller), reproducible si se da `rnd`. */
const normal = (rnd = Math.random) => {
    const u = 1 - rnd();
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Descriptor de una "persona": 128 números con norma ≈ 1 (dos personas quedan a ≈ 1.4). */
const rostroAleatorio = () => Array.from({ length: 128 }, () => normal() * 0.088);

/** Un pariente: muy cerca de `base` (a ≈ `distancia`). */
const parecido = (base, distancia = 0.03) => base.map(n => n + normal() * (distancia / Math.sqrt(128)));

const ruido = (base, sigma) => base.map(n => Math.round((n + normal() * sigma) * 10000) / 10000);

/**
 * Secuencia de cuadros para un reto. `pasos`: ['IZQ', 'DER'…]. Opciones:
 *   invertir: gira al lado contrario (prueba de vida fallida);
 *   descriptores: cuántos cuadros llevan descriptor (3 a 15);
 *   sigma: ruido por dimensión de cada descriptor;
 *   score: confianza de la detección; ipd: distancia entre ojos en pixeles.
 */
const secuencia = (base, pasos, { invertir = false, descriptores = 8, sigma = 0.006, score = 0.92, ipd = 70 } = {}) => {
    const dxs = [];
    for (let i = 0; i < 18; i++) dxs.push(0);                  // de frente ~1 s
    for (const p of pasos) {
        const lado = (p === 'IZQ') !== invertir ? 1 : -1;      // IZQ: la nariz se va a la derecha de la imagen
        for (let i = 1; i <= 5; i++) dxs.push(lado * 0.05 * i);
        for (let i = 0; i < 3; i++) dxs.push(lado * 0.25);
        for (let i = 4; i >= 0; i--) dxs.push(lado * 0.05 * i);
        for (let i = 0; i < 4; i++) dxs.push(0);
    }
    const cada = Math.max(1, Math.floor(dxs.length / descriptores));
    let puestos = 0;
    return dxs.map((dx, i) => {
        const cx = 320;
        const y = 220;
        const ojo = (x0) => [[x0 - 12, y], [x0 - 6, y - 4], [x0, y - 4], [x0 + 6, y], [x0, y + 3], [x0 - 6, y + 3]];
        const landmarks = [...ojo(cx - ipd / 2), ...ojo(cx + ipd / 2), [cx + dx * ipd + (Math.random() - 0.5) * 0.4, y + 40]]
            .map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
        const f = { t: i * 60, landmarks, score };
        if (i % cada === 0 && puestos < descriptores) { f.descriptor = ruido(base, sigma); puestos++; }
        return f;
    });
};

/** Un JPEG mínimo (los primeros bytes son los que se revisan). */
const fotoJpeg = () => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(200), Buffer.from([0xFF, 0xD9])]);

module.exports = { rostroAleatorio, parecido, secuencia, fotoJpeg };
