import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { GlobalService, HorariosService } from '../../../../core/services';
import { DiaProgramado, DiasEmpleado, ResumenHorario } from '../../../../models/horarios.models';
import { FechaNegocioPipe } from '../../../../shared/pipes/fecha-negocio.pipe';
import { fechaCorta, lunesDe, sumarDias } from '../../../../shared/utils/fecha-negocio';
import { ETIQUETA_JORNADA, textoTurno } from '../../../../shared/utils/jornada';
import { DiaModal, DiaModalData } from '../mdl';

const SEMANAS = 2;
const CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Calendario del empleado (análisis 006 §3 y §4): semanas con cada día
 * (horario, horas, sucursal) y la marca de cambiado a mano, cobertura,
 * descanso y sin horario. Navega por semanas; en celular es una lista por
 * día. Al tocar un día abre "Cambiar un día".
 */
@Component({
  selector: 'app-calendario-empleado',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatProgressBarModule, FechaNegocioPipe],
  templateUrl: './calendario-empleado.html',
  styleUrl: './calendario-empleado.scss'
})
export class CalendarioEmpleado {
  private readonly api = inject(HorariosService);
  private readonly dialog = inject(MatDialog);
  private readonly global = inject(GlobalService);

  readonly idEmpleado = input.required<number>();
  readonly nombreCompleto = input('');
  /** Hoy en la zona de su sucursal principal (de getHorarioEmpleado). */
  readonly hoy = input.required<string>();
  /** Su horario semanal guardado: de ahí salen "las horas de su horario" en el modal. */
  readonly horario = input<ResumenHorario | null>(null);
  readonly version = input(0);
  /** Se cambió o regresó algún día. */
  readonly cambio = output<void>();

  readonly puedeCambiar = this.global.tienePermiso('horarios_CambiarDia');
  readonly jornada = ETIQUETA_JORNADA;
  readonly turno = textoTurno;
  readonly corto = (i: number) => CORTOS[i];
  readonly fechaCorta = fechaCorta;

  readonly inicio = signal<string | null>(null);
  readonly datos = signal<DiasEmpleado | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  private readonly porFecha = computed(() => new Map((this.datos()?.dias ?? []).map(d => [d.fecha, d])));
  readonly semanas = computed(() => {
    const i = this.inicio();
    if (!i) return [];
    return Array.from({ length: SEMANAS }, (_, s) => {
      const lunes = sumarDias(i, s * 7);
      return { lunes, domingo: sumarDias(lunes, 6),
        dias: Array.from({ length: 7 }, (_, k) => { const fecha = sumarDias(lunes, k); return { fecha, k, dia: this.porFecha().get(fecha) ?? null }; }) };
    });
  });

  constructor() {
    effect(() => {
      const hoy = this.hoy();
      this.idEmpleado(); this.version();
      untracked(() => {
        if (!this.inicio() && hoy) this.inicio.set(lunesDe(hoy));
        this.cargar();
      });
    });
  }

  cargar(): void {
    const i = this.inicio();
    if (!i) return;
    this.cargando.set(true);
    this.api.getDiasEmpleado(this.idEmpleado(), i, sumarDias(i, SEMANAS * 7 - 1)).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.error.set(r.message); return; }
        this.error.set(null);
        this.datos.set(r.data);
      },
      error: () => { this.cargando.set(false); this.error.set('No fue posible consultar los días.'); }
    });
  }

  mover(semanas: number): void {
    const i = this.inicio();
    this.inicio.set(semanas === 0 ? lunesDe(this.hoy()) : sumarDias(i ?? lunesDe(this.hoy()), semanas * 7));
    this.cargar();
  }

  abrir(dia: DiaProgramado): void {
    const h = this.horario()?.dias.find(d => d.diaSemana === dia.diaSemana);
    const data: DiaModalData = {
      fecha: dia.fecha,
      empleado: { idEmpleado: this.idEmpleado(), nombreCompleto: this.nombreCompleto(), dia, horasHorario: h ? h.horas : null }
    };
    this.dialog.open(DiaModal, { data, width: '560px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: false })
      .afterClosed().subscribe(cambios => { if (cambios) { this.cargar(); this.cambio.emit(); } });
  }

  horas(n: number | null | undefined): string { return n === null || n === undefined ? '' : `${n} h`; }
}
