/**
 * Fechas de NEGOCIO (ingreso, baja, "a partir de"): son un día, no un
 * instante. Viajan como texto 'AAAA-MM-DD' y se tratan como texto: nunca
 * pasan por `Date` en la zona del navegador (análisis 003 §5 y 004).
 */

/** 'AAAA-MM-DD' de hoy en la zona indicada (la de la sucursal). */
export const hoyEnZona = (zona: string): string => {
  try {
    // en-CA formatea como AAAA-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
};

/** '2026-01-15' → '15/01/2026' (sin pasar por Date). */
export const fechaCorta = (fecha: string | null | undefined): string => {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const esFechaNegocio = (s: string | null | undefined): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));

// ── Aritmética de fechas de negocio (análisis 006: calendario por semanas) ──
// Con enteros, sin `Date`: un día es un día, sin zona ni horario de verano.

const aDias = (fecha: string): number => {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const y = m <= 2 ? a - 1 : a;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
};

const deDias = (n: number): string => {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const a = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** 'AAAA-MM-DD' + n días. */
export const sumarDias = (fecha: string, n: number): string => deDias(aDias(fecha) + n);

/** 1 = lunes … 7 = domingo. */
export const diaSemanaDe = (fecha: string): number => ((aDias(fecha) + 3) % 7 + 7) % 7 + 1;

/** El lunes de la semana de `fecha`. */
export const lunesDe = (fecha: string): string => sumarDias(fecha, 1 - diaSemanaDe(fecha));
