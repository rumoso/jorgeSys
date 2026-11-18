// =============================================================================
// Ubicación de una sucursal (análisis 015)
// =============================================================================
// El punto principal de la sucursal: latitud y longitud, las dos o ninguna.
// La validación del Front solo es ayuda; esta es la que manda.
//
//   leerUbicacion(latitud, longitud)
//       → { ok: true, latitud, longitud }   (números con 6 decimales, o null las dos)
//       → { ok: false, mensaje }
//   numero(v)          DECIMAL de MySQL (texto) → número, o null
//   textoUbicacion(lat, lng) → "lat, lng" para la bitácora, o null
// =============================================================================

const RE_NUMERO = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

const vacia = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Número finito desde número o texto ("19.43"); cualquier otra cosa → NaN. */
const aNumero = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v === 'string' && RE_NUMERO.test(v.trim())) return Number(v.trim());
    return NaN;
};

const seis = (n) => Number(n.toFixed(6));

const leerUbicacion = (latitud, longitud) => {
    const sinLat = vacia(latitud);
    const sinLng = vacia(longitud);
    if (sinLat && sinLng) return { ok: true, latitud: null, longitud: null };
    if (sinLat || sinLng) {
        return { ok: false, mensaje: 'La ubicación lleva latitud y longitud: escribe las dos o deja las dos vacías' };
    }
    const lat = aNumero(latitud);
    const lng = aNumero(longitud);
    if (Number.isNaN(lat)) return { ok: false, mensaje: 'La latitud debe ser un número, por ejemplo 19.432608' };
    if (Number.isNaN(lng)) return { ok: false, mensaje: 'La longitud debe ser un número, por ejemplo -99.133209' };
    const la = seis(lat);
    const lo = seis(lng);
    if (la < -90 || la > 90) return { ok: false, mensaje: 'La latitud debe estar entre -90 y 90' };
    if (lo < -180 || lo > 180) return { ok: false, mensaje: 'La longitud debe estar entre -180 y 180' };
    if (la === 0 && lo === 0) {
        return { ok: false, mensaje: 'La ubicación (0, 0) no es válida: revisa las coordenadas de la sucursal' };
    }
    return { ok: true, latitud: la || 0, longitud: lo || 0 };
};

const numero = (v) => (v === null || v === undefined ? null : Number(v));

const textoUbicacion = (latitud, longitud) =>
    (latitud === null || longitud === null ? null : `${ latitud }, ${ longitud }`);

module.exports = { leerUbicacion, numero, textoUbicacion };
