import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { HorariosService } from '../../../../core/services';
import { BitacoraHorario, TipoBitacoraHorario } from '../../../../models/horarios.models';
import { FechaNegocioPipe } from '../../../../shared/pipes/fecha-negocio.pipe';
import { FechaSucursalPipe } from '../../../../shared/pipes/fecha-sucursal.pipe';
import { esFechaNegocio, fechaCorta } from '../../../../shared/utils/fecha-negocio';

const TIPOS: Record<TipoBitacoraHorario, { texto: string; icono: string }> = {
  HORARIO: { texto: 'Horario semanal', icono: 'schedule' },
  PLANTILLA: { texto: 'Plantilla de la sucursal', icono: 'storefront' },
  APLICAR: { texto: 'Plantilla aplicada', icono: 'group_add' },
  DIA: { texto: 'Día cambiado a mano', icono: 'edit_calendar' },
  DIA_REGRESO: { texto: 'Día regresado a su horario', icono: 'undo' },
  COBERTURA: { texto: 'Cobertura en otra sucursal', icono: 'swap_horiz' }
};

const ETIQUETAS: Record<string, string> = {
  aPartirDe: 'A partir de', conservados: 'Días a mano conservados', horario: 'Horario', horas: 'Horas',
  sucursal: 'Sucursal del día', cobertura: 'Cobertura'
};

export interface CambioLegible { etiqueta: string; antes: string; despues: string; }

const texto = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && esFechaNegocio(v)) return fechaCorta(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Antes y después, renglón por renglón; de un horario semanal, solo los días que cambiaron. */
export const cambiosLegibles = (b: Pick<BitacoraHorario, 'antes' | 'despues'>): CambioLegible[] => {
  const a = objeto(b.antes);
  const d = objeto(b.despues);
  const out: CambioLegible[] = [];
  const diasA = objeto(a['dias']);
  const diasD = objeto(d['dias']);
  for (const dia of Object.keys({ ...diasA, ...diasD })) {
    if (b.antes && diasA[dia] === diasD[dia]) continue;
    out.push({ etiqueta: dia, antes: b.antes ? texto(diasA[dia]) : '', despues: texto(diasD[dia]) });
  }
  for (const k of Object.keys({ ...a, ...d })) {
    if (k === 'dias' || (b.antes && b.despues && JSON.stringify(a[k]) === JSON.stringify(d[k]))) continue;
    out.push({ etiqueta: ETIQUETAS[k] ?? k, antes: b.antes ? texto(a[k]) : '', despues: texto(d[k]) });
  }
  return out;
};

/**
 * Historial de horarios (análisis 006 §8, LP-4): quién, cuándo, tipo,
 * motivo y antes/después legibles. Del empleado (pestaña Horario de la
 * ficha) o de la sucursal (pantalla Horarios). `version` lo recarga.
 */
@Component({
  selector: 'app-bitacora-horarios',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, MatProgressBarModule, FechaNegocioPipe, FechaSucursalPipe],
  templateUrl: './bitacora-horarios.html',
  styleUrl: './bitacora-horarios.scss'
})
export class BitacoraHorarios {
  private readonly api = inject(HorariosService);

  readonly idEmpleado = input<number | null>(null);
  readonly idSucursal = input<number | null>(null);
  readonly version = input(0);

  readonly tipos = TIPOS;
  readonly lista = signal<(BitacoraHorario & { cambios: CambioLegible[] })[]>([]);
  readonly mostrar = signal(15);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly filtros = inject(FormBuilder).nonNullable.group({ desde: [''], hasta: [''] });

  constructor() {
    effect(() => {
      this.idEmpleado(); this.idSucursal(); this.version();
      untracked(() => this.buscar());
    });
  }

  buscar(): void {
    const idEmpleado = this.idEmpleado();
    const idSucursal = idEmpleado ? null : this.idSucursal();
    if (!idEmpleado && !idSucursal) { this.lista.set([]); return; }
    const f = this.filtros.getRawValue();
    this.cargando.set(true);
    this.api.getBitacoraHorarios({ idEmpleado, idSucursal, desde: f.desde || null, hasta: f.hasta || null }).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.error.set(r.message); this.lista.set([]); return; }
        this.error.set(null);
        this.mostrar.set(15);
        this.lista.set((r.data as BitacoraHorario[]).map(b => ({ ...b, cambios: cambiosLegibles(b) })));
      },
      error: () => { this.cargando.set(false); this.error.set('No fue posible consultar el historial.'); }
    });
  }

  mas(): void { this.mostrar.update(n => n + 30); }
}
