/**
 * Cálculo de un turno para mostrar una vista previa (análisis 006 §5 y §6),
 * el mismo de back/helpers/jornada.js. Lo que vale es lo que regresa el
 * servidor al guardar; esto solo adelanta el número en el modal.
 */
import { TipoJornada } from '../../models/horarios.models';

const NOCHE_INICIO = 20 * 60;
const NOCHE_FIN = 6 * 60;
const DIA_MIN = 24 * 60;
const MIXTA_A_NOCTURNA = 210;
export const MAXIMO_DIARIO: Record<TipoJornada, number> = { DIURNA: 8, MIXTA: 7.5, NOCTURNA: 7 };

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

export const esHora = (v: string | null | undefined): boolean => RE_HORA.test(String(v ?? '').trim());

export interface CalculoDia { horas: number; tipoJornada: TipoJornada; bCruzaMedianoche: boolean; maximoDiario: number; duracion: number; }

/** null si la entrada o la salida no son horas válidas o son iguales. */
export const calcularDia = (entrada: string | null, salida: string | null, comidaMinutos: number, bComidaDentro: boolean): CalculoDia | null => {
  if (!esHora(entrada) || !esHora(salida) || entrada === salida) return null;
  const ini = minutos(entrada!);
  let fin = minutos(salida!);
  const cruza = fin <= ini;
  if (cruza) fin += DIA_MIN;
  const noches = [[0, NOCHE_FIN], [NOCHE_INICIO, DIA_MIN + NOCHE_FIN], [DIA_MIN + NOCHE_INICIO, 2 * DIA_MIN]];
  const noche = noches.reduce((s, [a, b]) => s + Math.max(0, Math.min(fin, b) - Math.max(ini, a)), 0);
  const duracion = fin - ini;
  const tipoJornada: TipoJornada = noche === 0 ? 'DIURNA' : (duracion - noche === 0 || noche >= MIXTA_A_NOCTURNA) ? 'NOCTURNA' : 'MIXTA';
  const trabajados = Math.max(0, duracion - (bComidaDentro ? 0 : Number(comidaMinutos) || 0));
  return { horas: Math.round(trabajados / 60 * 100) / 100, tipoJornada, bCruzaMedianoche: cruza, maximoDiario: MAXIMO_DIARIO[tipoJornada], duracion };
};

/** ¿`h` cae dentro del turno (estrictamente entre la entrada y la salida)? */
export const dentroDelTurno = (entrada: string, salida: string, h: string): boolean => {
  if (!esHora(entrada) || !esHora(salida) || !esHora(h)) return false;
  const ini = minutos(entrada);
  let fin = minutos(salida);
  if (fin <= ini) fin += DIA_MIN;
  let m = minutos(h);
  if (m <= ini) m += DIA_MIN;
  return m > ini && m < fin;
};

export const ETIQUETA_JORNADA: Record<TipoJornada, string> = { DIURNA: 'Diurna', MIXTA: 'Mixta', NOCTURNA: 'Nocturna' };

/** '09:00–18:00' (con '+1' si sale al día siguiente), 'Descanso' o 'Sin horario'. */
export const textoTurno = (d: { estado: string; entrada: string | null; salida: string | null; bCruzaMedianoche?: boolean }): string => {
  if (d.estado === 'DESCANSO') return 'Descanso';
  if (d.estado !== 'LABORABLE' || !d.entrada || !d.salida) return 'Sin horario';
  return `${d.entrada}–${d.salida}${d.bCruzaMedianoche ? ' (+1)' : ''}`;
};
