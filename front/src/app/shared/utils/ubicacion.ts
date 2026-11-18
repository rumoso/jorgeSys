/**
 * Ubicación de una sucursal (análisis 015): leer coordenadas escritas o
 * pegadas y armar los enlaces a Google Maps. Funciones puras.
 *
 * Al mapa solo viajan las coordenadas: ni la empresa, ni el usuario. La
 * búsqueda por dirección la abre el usuario en otra pestaña.
 */

export interface Coordenadas { latitud: number; longitud: number; }

const NUM = '([-+]?\\d{1,3}(?:\\.\\d+)?)';
/** `19.4326, -99.1332` o `19.4326 -99.1332`. */
const RE_TEXTO = new RegExp(`^${NUM}\\s*[,\\s]\\s*${NUM}$`);
/** El punto exacto de un lugar en un enlace largo: `!3d19.43!4d-99.13`. */
const RE_PIN = new RegExp(`!3d${NUM}!4d${NUM}`);
/** `?q=19.43,-99.13`, `&query=…`, `&ll=…`, `&destination=…`. */
const RE_PARAM = new RegExp(`[?&](?:q|query|ll|destination)=${NUM}\\s*,\\s*${NUM}`);
/** El centro de la vista: `/@19.43,-99.13,17z`. */
const RE_ARROBA = new RegExp(`@${NUM},${NUM}`);
const RE_CORTO = /(^|[\s/.])(maps\.app\.goo\.gl|goo\.gl\/maps)(\/|\s|$)/i;

const seis = (n: number): number => Number(n.toFixed(6)) || 0;

const validas = (lat: number, lng: number): Coordenadas | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const latitud = seis(lat);
  const longitud = seis(lng);
  if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) return null;
  if (latitud === 0 && longitud === 0) return null;
  return { latitud, longitud };
};

const decodificar = (t: string): string => {
  try { return decodeURIComponent(t); } catch { return t; }
};

/**
 * Coordenadas escritas (`19.4326, -99.1332`) o dentro de un enlace de Google
 * Maps que las traiga. Redondeadas a 6 decimales; `null` si no hay, están
 * fuera de rango o son (0, 0).
 */
export function leerCoordenadas(texto: string | null | undefined): Coordenadas | null {
  const t = decodificar(String(texto ?? '')).replace(/\+/g, ' ').trim();
  if (!t) return null;
  const m = RE_TEXTO.exec(t) ?? RE_PIN.exec(t) ?? RE_PARAM.exec(t) ?? RE_ARROBA.exec(t);
  return m ? validas(Number(m[1]), Number(m[2])) : null;
}

/** Enlace corto de Google Maps: no trae las coordenadas. */
export function esEnlaceCorto(texto: string | null | undefined): boolean {
  return RE_CORTO.test(String(texto ?? '').trim());
}

/** Cómo se muestran en el campo: `19.4326, -99.1332`. */
export function textoCoordenadas(c: Coordenadas | null): string {
  return c ? `${c.latitud}, ${c.longitud}` : '';
}

const numero = (n: number): string => {
  if (!Number.isFinite(n)) throw new Error('Coordenada inválida');
  return String(n);
};

/** Mapa para el `<iframe>` (sin clave). Solo con números ya validados. */
export function urlFrame(latitud: number, longitud: number): string {
  return `https://www.google.com/maps?q=${numero(latitud)},${numero(longitud)}&z=16&output=embed`;
}

/** Abre ese punto en Google Maps (otra pestaña). */
export function urlAbrir(latitud: number, longitud: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${numero(latitud)},${numero(longitud)}`;
}

/** Busca la dirección en Google Maps (otra pestaña). */
export function urlBuscar(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion.trim())}`;
}
