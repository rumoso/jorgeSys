import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom, startWith } from 'rxjs';

import { GlobalService, HorariosService } from '../../../../../core/services';
import { ApiResponse } from '../../../../../models/common.models';
import { AvisoJornada, CambioDia, DiaProgramado, DiaSucursal, SucursalHorarios } from '../../../../../models/horarios.models';
import { FechaNegocioPipe } from '../../../../../shared/pipes/fecha-negocio.pipe';
import { ETIQUETA_JORNADA, calcularDia, textoTurno } from '../../../../../shared/utils/jornada';

/**
 * Datos del modal "Cambiar un día". Uno de los dos:
 *  - `empleado`: un día de un empleado (calendario de la ficha o renglón de
 *    la pantalla Horarios). `horasHorario`: las de su horario semanal ese día;
 *  - `varios`: el mismo cambio para varios empleados de una sucursal
 *    (pantalla Horarios → Día).
 */
export interface DiaModalData {
  fecha: string;
  empleado?: { idEmpleado: number; nombreCompleto: string; dia: DiaProgramado; horasHorario?: number | null };
  varios?: { idSucursal: number; sucursal: string; empleados: DiaSucursal[] };
}

type Banner = { tipo: 'ok' | 'bad' | 'info'; texto: string; candado?: boolean } | null;

/**
 * Cambiar un día a mano (análisis 006 §4 y §4.1): laborable o descanso,
 * entrada, salida, comida, sucursal del día y motivo obligatorio. "Cubre en
 * otra sucursal": sucursal que cubre, desde qué hora y "Tomar la salida de
 * la plantilla de esa sucursal"; propone el motivo "Cubre en <sucursal>".
 * Muestra las horas nuevas, las de su horario y el aviso de máximo. Un día
 * cambiado a mano se puede regresar al horario. Los mensajes de fecha pasada
 * y semana cerrada del servidor se ven en el banner. No se cierra al guardar.
 */
@Component({
  selector: 'app-dia-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, FechaNegocioPipe],
  templateUrl: './dia-modal.html',
  styleUrl: './dia-modal.scss'
})
export class DiaModal {
  private readonly api = inject(HorariosService);
  private readonly ref = inject(MatDialogRef<DiaModal, boolean>);
  readonly data = inject<DiaModalData>(MAT_DIALOG_DATA);
  private readonly global = inject(GlobalService);

  readonly puedeCambiar = this.global.tienePermiso('horarios_CambiarDia');
  readonly jornada = ETIQUETA_JORNADA;
  readonly turno = textoTurno;

  /** El día del empleado como está guardado (se actualiza al guardar o regresar). */
  readonly dia = signal<DiaProgramado | null>(this.data.empleado?.dia ?? null);
  readonly sucursales = signal<SucursalHorarios[]>([]);
  readonly guardando = signal(false);
  readonly banner = signal<Banner>(null);
  readonly avisos = signal<AvisoJornada[]>([]);
  private motivoPropuesto = '';
  private cambios = false;

  private readonly base = this.data.empleado?.dia ?? this.data.varios?.empleados[0] ?? null;
  readonly form = inject(FormBuilder).nonNullable.group({
    estado: [(this.base?.estado === 'DESCANSO' ? 'DESCANSO' : 'LABORABLE') as 'LABORABLE' | 'DESCANSO'],
    entrada: [this.base?.entrada ?? ''],
    salida: [this.base?.salida ?? ''],
    comidaMinutos: [this.base?.estado === 'LABORABLE' ? this.base.comidaMinutos : 0],
    bComidaDentro: [this.base?.estado === 'LABORABLE' ? this.base.bComidaDentro : false],
    idSucursal: [this.data.empleado?.dia.idSucursal ?? 0],
    motivo: [''],
    cubre: [!!this.data.empleado?.dia.idSucursalCobertura],
    idSucursalCobertura: [this.data.empleado?.dia.idSucursalCobertura ?? 0],
    horaCobertura: [this.data.empleado?.dia.horaCobertura ?? '']
  });
  private readonly v = toSignal(this.form.valueChanges.pipe(startWith(null)), { initialValue: null });
  private readonly valor = computed(() => { this.v(); return this.form.getRawValue(); });

  readonly laborable = computed(() => this.valor().estado === 'LABORABLE');
  readonly cubre = computed(() => this.laborable() && this.valor().cubre);
  readonly activas = computed(() => this.sucursales().filter(s => s.bActivo));
  /** Sucursal del día: las activas y, si no está entre ellas, la que ya tiene. */
  readonly opcionesDia = computed(() => {
    const d = this.dia();
    const l = this.activas().map(s => ({ id: s.idSucursal, nombre: s.nombre }));
    if (d && !l.some(s => s.id === d.idSucursal)) l.unshift({ id: d.idSucursal, nombre: `${d.sucursal ?? 'Sucursal'} (inactiva)` });
    return l;
  });
  /** La sucursal que cubre: otra que la del día, activa. */
  readonly opcionesCobertura = computed(() => {
    const idDia = this.data.varios ? null : this.valor().idSucursal;
    return this.activas().filter(s => s.idSucursal !== idDia && (!this.data.varios || s.idSucursal !== this.data.varios.idSucursal));
  });

  /** Vista previa de las horas con lo capturado (lo que vale es lo que regresa el servidor). */
  readonly nuevo = computed(() => {
    const x = this.valor();
    return x.estado === 'LABORABLE' ? calcularDia(x.entrada, x.salida, Number(x.comidaMinutos) || 0, x.bComidaDentro) : null;
  });
  readonly horasHorario = computed(() => {
    const e = this.data.empleado;
    const d = this.dia();
    if (!e || !d) return null;
    if (d.horasHorario !== null) return d.horasHorario;
    if (e.horasHorario !== undefined && e.horasHorario !== null) return e.horasHorario;
    return d.bManual ? null : d.horas;
  });

  constructor() {
    if (!this.puedeCambiar) this.form.disable();
    // En una cobertura la sucursal del día no cambia.
    effect(() => {
      const c = this.cubre();
      const ctl = this.form.controls.idSucursal;
      if (!this.puedeCambiar) return;
      if (c) { ctl.setValue(this.dia()?.idSucursal ?? ctl.value, { emitEvent: false }); ctl.disable({ emitEvent: false }); }
      else ctl.enable({ emitEvent: false });
    });
    this.api.getSucursalesHorarios().subscribe(r => { if (r.status_code === 0) this.sucursales.set(r.data); });
  }

  /** Al escoger la sucursal que cubre, propone el motivo (si no se escribió otro). */
  cambioCobertura(): void {
    const s = this.sucursales().find(x => x.idSucursal === Number(this.form.controls.idSucursalCobertura.value));
    const m = this.form.controls.motivo;
    if (s && (!m.value.trim() || m.value === this.motivoPropuesto)) {
      this.motivoPropuesto = `Cubre en ${s.nombre}`;
      m.setValue(this.motivoPropuesto);
    }
  }

  async tomarSalida(): Promise<void> {
    const id = Number(this.form.controls.idSucursalCobertura.value);
    if (!id) { this.banner.set({ tipo: 'bad', texto: 'Escoge primero la sucursal que cubre.' }); return; }
    try {
      const r = await firstValueFrom(this.api.getSalidaPlantilla(id, this.data.fecha));
      if (r.status_code !== 0) { this.banner.set({ tipo: 'bad', texto: r.message }); return; }
      if (r.data.salida) this.form.controls.salida.setValue(r.data.salida);
      this.banner.set({ tipo: r.data.salida ? 'info' : 'bad', texto: r.message });
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' });
    }
  }

  private cuerpo(): CambioDia | string {
    const x = this.form.getRawValue();
    const motivo = x.motivo.trim();
    if (x.estado === 'LABORABLE' && (!x.entrada || !x.salida)) return 'Escribe la entrada y la salida.';
    const c: CambioDia = x.estado === 'LABORABLE'
      ? { estado: 'LABORABLE', entrada: x.entrada, salida: x.salida, comidaMinutos: Number(x.comidaMinutos) || 0, bComidaDentro: x.bComidaDentro, motivo: motivo || null }
      : { estado: 'DESCANSO', entrada: null, salida: null, comidaMinutos: 0, bComidaDentro: false, motivo: motivo || null };
    if (x.estado === 'LABORABLE' && x.cubre) {
      if (!x.idSucursalCobertura) return 'Escoge la sucursal que cubre.';
      if (!x.horaCobertura) return 'Escribe desde qué hora cubre.';
      c.cobertura = { idSucursalCobertura: Number(x.idSucursalCobertura), horaCobertura: x.horaCobertura };
    } else if (!motivo) {
      return 'Escribe el motivo del cambio.';
    }
    return c;
  }

  async guardar(): Promise<void> {
    if (this.guardando() || !this.puedeCambiar) return;
    const c = this.cuerpo();
    if (typeof c === 'string') { this.banner.set({ tipo: 'bad', texto: c }); return; }
    this.guardando.set(true);
    this.avisos.set([]);
    try {
      let r: ApiResponse;
      const e = this.data.empleado;
      if (e) {
        const idSucursal = Number(this.form.controls.idSucursal.value);
        r = await firstValueFrom(this.api.setDia({ ...c, idEmpleado: e.idEmpleado, fecha: this.data.fecha,
          idSucursal: !c.cobertura && idSucursal && idSucursal !== this.dia()?.idSucursal ? idSucursal : null }));
      } else {
        const v = this.data.varios!;
        r = await firstValueFrom(this.api.setDiaVarios({ ...c, idSucursal: v.idSucursal, fecha: this.data.fecha, idEmpleados: v.empleados.map(x => x.idEmpleado) }));
      }
      this.mostrar(r);
      if (r.status_code === 0) {
        this.cambios = true;
        this.avisos.set(r.data.avisos ?? []);
        if (r.data.dia) this.dia.set(r.data.dia);
      }
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  /** Regresa el día a lo que marca su horario semanal (quita lo hecho a mano y la cobertura). */
  async regresar(): Promise<void> {
    const e = this.data.empleado;
    if (!e || this.guardando() || !this.puedeCambiar) return;
    const motivo = this.form.controls.motivo.value.trim();
    if (!motivo) {
      this.banner.set({ tipo: 'bad', texto: 'Escribe en "Motivo" por qué regresa el día a su horario.' });
      return;
    }
    if (!confirm(`¿Regresar el día ${this.data.fecha} de ${e.nombreCompleto} a lo que marca su horario semanal?`)) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.api.regresarDia({ idEmpleado: e.idEmpleado, fecha: this.data.fecha, motivo }));
      this.mostrar(r);
      if (r.status_code === 0) {
        this.cambios = true;
        this.avisos.set([]);
        const d = r.data.dia as DiaProgramado;
        this.dia.set(d);
        this.form.reset({
          estado: d.estado === 'DESCANSO' ? 'DESCANSO' : 'LABORABLE', entrada: d.entrada ?? '', salida: d.salida ?? '',
          comidaMinutos: d.comidaMinutos, bComidaDentro: d.bComidaDentro, idSucursal: d.idSucursal, motivo: '',
          cubre: false, idSucursalCobertura: 0, horaCobertura: ''
        });
      }
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  private mostrar(r: ApiResponse): void {
    const candado = ['FECHA_PASADA', 'SEMANA_CERRADA', 'SIN_PERMISO'].includes(r.data?.codigo);
    this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message, candado });
  }

  horas(n: number | null | undefined): string { return n === null || n === undefined ? '—' : `${n} h`; }

  cerrar(): void { this.ref.close(this.cambios); }
}
