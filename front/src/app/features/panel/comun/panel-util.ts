import { computed, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { Vista } from '../../../shared/utils/vista-lista';
import { ESTADOS_EMPRESA, TIPOS_COBRO } from '../../../models/panel.models';

/**
 * Tabla o tarjetas en las listas del panel (009). Igual que `vistaLista`,
 * pero el superadministrador no tiene preferencias en el servidor: la
 * elección vive solo en este navegador, por pantalla y por categoría.
 */
export function vistaPanel(pantalla: string) {
  const celular = toSignal(inject(BreakpointObserver).observe('(max-width: 768px)').pipe(map(r => r.matches)), { initialValue: false });
  const clave = () => `rh_panel_vista_${pantalla}_${celular() ? 'mobile' : 'desktop'}`;
  const elegidas = signal<Record<string, Vista>>({});
  const leer = (k: string): Vista | null => {
    const e = elegidas()[k];
    if (e) return e;
    try { const v = localStorage.getItem(k); return v === 'tabla' || v === 'cards' ? v : null; } catch { return null; }
  };
  const vista = computed<Vista>(() => leer(clave()) ?? (celular() ? 'cards' : 'tabla'));
  const alternar = () => {
    const k = clave();
    const nueva: Vista = vista() === 'tabla' ? 'cards' : 'tabla';
    elegidas.update(e => ({ ...e, [k]: nueva }));
    try { localStorage.setItem(k, nueva); } catch { /* sin storage */ }
  };
  return { vista, alternar, celular };
}

export const textoEstado = (e: string | null | undefined) => ESTADOS_EMPRESA.find(x => x.valor === e)?.texto ?? e ?? '';
export const claseEstado = (e: string | null | undefined) => ESTADOS_EMPRESA.find(x => x.valor === e)?.clase ?? 'info';
export const textoTipoCobro = (t: string | null | undefined) => TIPOS_COBRO.find(x => x.valor === t)?.texto ?? t ?? '';

/** Tamaño de archivo legible. */
export const textoTamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Mes 'AAAA-MM' → 'Noviembre 2026'. Es texto, no un instante: no pasa por zona. */
export const textoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${nombres[m - 1] ?? mes} ${a}`;
};

/**
 * Una descarga binaria (Excel). Si el Blob es application/json es el error
 * del servidor: regresa su mensaje. Si no, lo guarda con `nombre` y regresa null.
 */
export async function guardarDescarga(blob: Blob, nombre: string): Promise<string | null> {
  if (blob.type.includes('application/json')) {
    try { return JSON.parse(await blob.text()).message || 'No fue posible descargar el archivo'; }
    catch { return 'No fue posible descargar el archivo'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
