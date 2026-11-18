import { Pipe, PipeTransform } from '@angular/core';

/**
 * La ÚNICA forma de mostrar una fecha u hora de negocio (análisis 003 §5):
 * en la zona de la sucursal del dato, nunca en la del navegador. Un gerente
 * en Cancún que ve un marcaje de Tijuana lee la hora de Tijuana.
 *
 *   {{ m.fechaHora | fechaSucursal: m.zonaHoraria }}                 → 10/06/2026 23:30
 *   {{ m.fechaHora | fechaSucursal: m.zonaHoraria : 'hora' }}        → 23:30
 *   {{ m.fechaHora | fechaSucursal: m.zonaHoraria : 'hora' : true }} → 23:30 (Tijuana)
 *
 * Formatos: 'fechaHora' (default), 'fecha', 'hora', 'largo' (miércoles 10 de junio).
 * `conZona`: para vistas que mezclan sucursales de zonas distintas.
 *
 * El instante llega del API en UTC: un Date, milisegundos, ISO o el texto de
 * MySQL ('2026-06-11 06:30:00', que se toma como UTC).
 */
export type FormatoFecha = 'fechaHora' | 'fecha' | 'hora' | 'largo';

const OPCIONES: Record<FormatoFecha, Intl.DateTimeFormatOptions> = {
  fechaHora: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  fecha: { day: '2-digit', month: '2-digit', year: 'numeric' },
  hora: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  largo: { weekday: 'long', day: 'numeric', month: 'long' }
};

const formatos = new Map<string, Intl.DateTimeFormat>();

/** Nombre corto de la zona para mostrarla: 'America/Tijuana' → 'Tijuana'. */
export const nombreZona = (zona: string): string => (zona.split('/').pop() ?? zona).replace(/_/g, ' ');

export const aInstante = (valor: Date | string | number): Date => {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number') return new Date(valor);
  const s = String(valor).trim();
  // Texto de MySQL sin zona: es UTC.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  return new Date(s);
};

export const formatearEnZona = (valor: Date | string | number, zona: string, formato: FormatoFecha = 'fechaHora', conZona = false): string => {
  const d = aInstante(valor);
  if (isNaN(d.getTime())) return '';
  const k = `${zona}|${formato}`;
  let f = formatos.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat('es-MX', { ...OPCIONES[formato], timeZone: zona }); }
    catch { return ''; }   // zona inválida: no se inventa una hora
    formatos.set(k, f);
  }
  const texto = f.format(d).replace(',', '');
  return conZona ? `${texto} (${nombreZona(zona)})` : texto;
};

@Pipe({ name: 'fechaSucursal' })
export class FechaSucursalPipe implements PipeTransform {
  transform(valor: Date | string | number | null | undefined, zona: string | null | undefined,
            formato: FormatoFecha = 'fechaHora', conZona = false): string {
    if (valor === null || valor === undefined || valor === '' || !zona) return '';
    return formatearEnZona(valor, zona, formato, conZona);
  }
}
