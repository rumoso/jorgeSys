import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { GlobalService, HorariosService } from '../../../../core/services';
import { ApiResponse } from '../../../../models/common.models';
import { AvisoJornada, DiaConservado, HorarioEmpleado as DatosHorario, PlantillaSucursal, ResumenHorario } from '../../../../models/horarios.models';
import { HorarioSemanal } from '../../../../shared/components/horario-semanal/horario-semanal';
import { FechaNegocioPipe } from '../../../../shared/pipes/fecha-negocio.pipe';
import { textoTurno } from '../../../../shared/utils/jornada';
import { BitacoraHorarios } from '../bitacora-horarios/bitacora-horarios';
import { CalendarioEmpleado } from '../calendario-empleado/calendario-empleado';
import { HorarioPendiente } from '../horario-pendiente';

type Banner = { tipo: 'ok' | 'bad' | 'info'; texto: string; candado?: boolean } | null;

/**
 * Pestaña "Horario" de la ficha del empleado (análisis 006), registrada en
 * `empleado-ficha-modal/pestanas.ts`:
 *  - horario semanal con "a partir de" (hoy por default; una fecha pasada
 *    solo con horarios_Retroactivo) y "Cargar la plantilla de su sucursal";
 *  - al guardar, los avisos de máximos y los días a mano que se conservaron;
 *  - calendario por semanas con "Cambiar un día";
 *  - historial.
 * Sin horarios_Editar, el horario es de solo lectura.
 */
@Component({
  selector: 'app-horario-empleado',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, MatProgressBarModule, FechaNegocioPipe,
    HorarioSemanal, CalendarioEmpleado, BitacoraHorarios],
  templateUrl: './horario-empleado.html',
  styleUrl: './horario-empleado.scss'
})
export class HorarioEmpleado {
  private readonly api = inject(HorariosService);
  private readonly global = inject(GlobalService);
  private readonly pendientes = inject(HorarioPendiente);

  readonly idEmpleado = input.required<number>();

  readonly puedeEditar = this.global.tienePermiso('horarios_Editar');
  readonly puedeRetroactivo = this.global.tienePermiso('horarios_Retroactivo');
  readonly turno = textoTurno;

  readonly datos = signal<DatosHorario | null>(null);
  /** Lo que muestra el editor: el horario guardado o una plantilla cargada sin guardar. */
  readonly base = signal<ResumenHorario | null>(null);
  readonly cargadaSinGuardar = signal<string | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly banner = signal<Banner>(null);
  readonly avisosGuardado = signal<AvisoJornada[]>([]);
  readonly conservados = signal<DiaConservado[]>([]);
  readonly version = signal(0);
  readonly verHistorial = signal(false);

  readonly editable = computed(() => this.puedeEditar && this.datos()?.estado === 'ACTIVO');
  private readonly editor = viewChild(HorarioSemanal);

  readonly form = inject(FormBuilder).nonNullable.group({ aPartirDe: [''], motivo: [''] });

  constructor() {
    effect(() => { this.idEmpleado(); untracked(() => this.cargar()); });
    // Plantilla de la sucursal nueva al cambiar la principal (la deja la ficha).
    effect(() => {
      const hay = this.pendientes.pendientes().has(this.idEmpleado());
      if (hay && this.datos()) untracked(() => this.tomarPendiente());
    });
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.getHorarioEmpleado(this.idEmpleado()).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.banner.set({ tipo: 'bad', texto: r.message }); return; }
        const d = r.data as DatosHorario;
        this.datos.set(d);
        this.base.set(d);
        this.cargadaSinGuardar.set(null);
        if (!this.form.controls.aPartirDe.value) this.form.controls.aPartirDe.setValue(d.hoy);
      },
      error: () => { this.cargando.set(false); this.banner.set({ tipo: 'bad', texto: 'No fue posible consultar el horario.' }); }
    });
  }

  private tomarPendiente(): void {
    const p = this.pendientes.tomar(this.idEmpleado());
    if (!p) return;
    this.base.set(p.plantilla);
    this.cargadaSinGuardar.set(`Se cargó la plantilla de ${p.sucursal ?? 'la nueva sucursal'}. Ajústala si hace falta y pulsa "Guardar horario": hasta entonces conserva su horario anterior.`);
  }

  async cargarPlantilla(): Promise<void> {
    const d = this.datos();
    if (!d) return;
    if (this.editor()?.sucio() && !confirm('Hay cambios sin guardar en el horario. ¿Reemplazarlos con la plantilla de la sucursal?')) return;
    try {
      const r = await firstValueFrom(this.api.getPlantilla(d.idSucursalPrincipal));
      if (r.status_code !== 0) { this.banner.set({ tipo: 'bad', texto: r.message }); return; }
      const p = r.data as PlantillaSucursal;
      if (!p.bDefinida) { this.banner.set({ tipo: 'bad', texto: `La sucursal ${p.sucursal} no tiene plantilla. Se define en Horarios → Plantilla.` }); return; }
      this.base.set(p);
      this.banner.set(null);
      this.cargadaSinGuardar.set(`Se cargó la plantilla de ${p.sucursal}. Revisa y pulsa "Guardar horario" para que aplique.`);
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' });
    }
  }

  async guardar(): Promise<void> {
    const d = this.datos();
    const ed = this.editor();
    if (!d || !ed || this.guardando() || !this.editable()) return;
    const v = this.form.getRawValue();
    if (!v.aPartirDe) { this.banner.set({ tipo: 'bad', texto: 'Escoge la fecha "a partir de".' }); return; }
    this.guardando.set(true);
    this.avisosGuardado.set([]);
    this.conservados.set([]);
    try {
      const r: ApiResponse = await firstValueFrom(this.api.setHorarioEmpleado({
        idEmpleado: d.idEmpleado, dias: ed.valor(), aPartirDe: v.aPartirDe, motivo: v.motivo.trim() || null
      }));
      const candado = ['FECHA_PASADA', 'SEMANA_CERRADA', 'SIN_PERMISO'].includes(r.data?.codigo);
      this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message, candado });
      if (r.status_code === 0) {
        this.avisosGuardado.set(r.data.avisos ?? []);
        this.conservados.set(r.data.conservados ?? []);
        this.form.controls.motivo.setValue('');
        this.version.update(n => n + 1);
        this.cargar();
      }
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  diaCambiado(): void { this.version.update(n => n + 1); }
}
