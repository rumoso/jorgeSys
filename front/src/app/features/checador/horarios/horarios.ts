import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { GlobalService, HorariosService, NotificationService } from '../../../core/services';
import { DiaSucursal, DiasSucursal, HorarioPorAjustar, PlantillaSucursal, SucursalHorarios, TipoJornada } from '../../../models/horarios.models';
import { HorarioSemanal } from '../../../shared/components/horario-semanal/horario-semanal';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { TabsDeslizablesDirective } from '../../../shared/directives/tabs-deslizables.directive';
import { FechaNegocioPipe } from '../../../shared/pipes/fecha-negocio.pipe';
import { hoyEnZona } from '../../../shared/utils/fecha-negocio';
import { ETIQUETA_JORNADA, textoTurno } from '../../../shared/utils/jornada';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { EmpleadoFichaModal, EmpleadoFichaModalData } from '../../personas/empleados/mdl';
import { BitacoraHorarios } from './bitacora-horarios/bitacora-horarios';
import { AplicarPlantillaModal, AplicarPlantillaModalData, DiaModal, DiaModalData } from './mdl';

/**
 * Checador → Horarios (análisis 006). Con selector de sucursal (las del
 * usuario) y cuatro vistas:
 *  - Plantilla: el horario semanal de referencia de la sucursal; guardarla
 *    no cambia a nadie: "Aplicar a empleados…" escoge a quién;
 *  - Día: los empleados que trabajan esa fecha en la sucursal (por sucursal
 *    del día o porque la cubren); se escogen varios y "Cambiar un día";
 *  - Por ajustar: empleados sin horario o con días sin horario por delante;
 *  - Historial de la sucursal.
 * Cada botón depende de su acción; sin ella, solo consulta.
 */
@Component({
  selector: 'app-horarios',
  imports: [ReactiveFormsModule, MatTableModule, MatTabsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, TablaTarjetasDirective, TabsDeslizablesDirective, FechaNegocioPipe, HorarioSemanal, BitacoraHorarios],
  templateUrl: './horarios.html',
  styleUrl: './horarios.scss'
})
export class Horarios implements OnInit {
  private readonly api = inject(HorariosService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  readonly global = inject(GlobalService);

  readonly puedePlantilla = this.global.tienePermiso('horarios_Plantilla');
  readonly puedeCambiarDia = this.global.tienePermiso('horarios_CambiarDia');
  readonly puedeFicha = this.global.tieneMenu('empleados');
  readonly jornada = ETIQUETA_JORNADA;
  readonly turno = textoTurno;

  readonly sucursales = signal<SucursalHorarios[]>([]);
  readonly idSucursal = new FormControl(0, { nonNullable: true });
  readonly sucursal = signal<SucursalHorarios | null>(null);
  readonly version = signal(0);

  // ── Plantilla ──
  readonly plantilla = signal<PlantillaSucursal | null>(null);
  readonly cargandoPlantilla = signal(false);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  private readonly editor = viewChild(HorarioSemanal);

  // ── Día ──
  readonly filtrosDia = inject(FormBuilder).nonNullable.group({ fecha: [''] });
  readonly dias = signal<DiasSucursal | null>(null);
  readonly cargandoDia = signal(false);
  readonly escogidos = signal<Set<number>>(new Set());
  readonly vlDia = vistaLista('horarios_dia');
  /** En tarjetas la casilla va junto al nombre (la primera columna es el título de la tarjeta). */
  readonly columnasDia = computed(() => [...(this.puedeCambiarDia && this.vlDia.vista() === 'tabla' ? ['sel'] : []), 'nombre', 'horario', 'horas', 'sucursal', 'marcas', 'acciones']);
  readonly todosEscogidos = computed(() => { const l = this.dias()?.empleados ?? []; return l.length > 0 && l.every(e => this.escogidos().has(e.idEmpleado)); });

  // ── Por ajustar ──
  readonly soloSucursal = new FormControl(true, { nonNullable: true });
  readonly porAjustar = signal<HorarioPorAjustar[] | null>(null);
  readonly cargandoAjustar = signal(false);
  readonly vlAjustar = vistaLista('horarios_ajustar');
  readonly columnasAjustar = ['nombre', 'sucursal', 'falta', 'acciones'];

  ngOnInit(): void {
    this.api.getSucursalesHorarios().subscribe({
      next: r => {
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        const mias = (r.data as SucursalHorarios[]).filter(s => s.bAlcance);
        this.sucursales.set(mias);
        const primera = mias.find(s => s.bActivo) ?? mias[0];
        if (primera) { this.idSucursal.setValue(primera.idSucursal); this.cambiarSucursal(); }
      },
      error: () => this.avisos.error('No fue posible consultar las sucursales')
    });
  }

  /** La sucursal es el contexto de la pantalla: al cambiarla se carga su plantilla y se limpian las listas. */
  cambiarSucursal(): void {
    const s = this.sucursales().find(x => x.idSucursal === Number(this.idSucursal.value)) ?? null;
    if (this.editor()?.sucio() && !confirm('Hay cambios sin guardar en la plantilla. ¿Cambiar de sucursal y descartarlos?')) {
      this.idSucursal.setValue(this.sucursal()?.idSucursal ?? 0, { emitEvent: false });
      return;
    }
    this.sucursal.set(s);
    this.banner.set(null);
    this.dias.set(null);
    this.escogidos.set(new Set());
    this.porAjustar.set(null);
    if (!s) return;
    this.filtrosDia.controls.fecha.setValue(hoyEnZona(s.zonaHoraria));
    this.cargarPlantilla();
  }

  // ── Plantilla ──

  cargarPlantilla(): void {
    const s = this.sucursal();
    if (!s) return;
    this.cargandoPlantilla.set(true);
    this.api.getPlantilla(s.idSucursal).subscribe({
      next: r => {
        this.cargandoPlantilla.set(false);
        if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return; }
        this.plantilla.set(r.data);
      },
      error: () => { this.cargandoPlantilla.set(false); this.banner.set({ ok: false, texto: 'No fue posible consultar la plantilla.' }); }
    });
  }

  async guardarPlantilla(): Promise<void> {
    const s = this.sucursal();
    const ed = this.editor();
    if (!s || !ed || this.guardando() || !this.puedePlantilla) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.api.setPlantilla({ idSucursal: s.idSucursal, dias: ed.valor() }));
      this.banner.set({ ok: r.status_code === 0, texto: r.message });
      if (r.status_code === 0) { this.version.update(n => n + 1); this.cargarPlantilla(); }
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  aplicar(): void {
    const s = this.sucursal();
    if (!s) return;
    if (this.editor()?.sucio() && !confirm('La plantilla tiene cambios sin guardar. Se aplica la plantilla GUARDADA. ¿Continuar?')) return;
    const data: AplicarPlantillaModalData = { idSucursal: s.idSucursal, sucursal: s.nombre };
    this.dialog.open(AplicarPlantillaModal, { data, width: '680px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: false })
      .afterClosed().subscribe(cambios => { if (cambios) { this.version.update(n => n + 1); if (this.dias()) this.buscarDia(); } });
  }

  // ── Día ──

  buscarDia(): void {
    const s = this.sucursal();
    const fecha = this.filtrosDia.controls.fecha.value;
    if (!s || !fecha) return;
    this.cargandoDia.set(true);
    this.api.getDiasSucursal(s.idSucursal, fecha).subscribe({
      next: r => {
        this.cargandoDia.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        const d = r.data as DiasSucursal;
        this.dias.set(d);
        const ids = new Set(d.empleados.map(e => e.idEmpleado));
        this.escogidos.update(sel => new Set([...sel].filter(id => ids.has(id))));
      },
      error: () => { this.cargandoDia.set(false); this.avisos.error('No fue posible consultar los días'); }
    });
  }

  escoger(id: number, si: boolean): void {
    this.escogidos.update(s => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; });
  }
  escogerTodos(si: boolean): void {
    this.escogidos.set(si ? new Set((this.dias()?.empleados ?? []).map(e => e.idEmpleado)) : new Set());
  }

  /** "Cambiar un día" para los escogidos (el mismo cambio para todos). */
  cambiarVarios(): void {
    const d = this.dias();
    if (!d) return;
    const empleados = d.empleados.filter(e => this.escogidos().has(e.idEmpleado));
    if (!empleados.length) { this.avisos.error('Escoge al menos un empleado'); return; }
    if (empleados.length === 1) { this.cambiarUno(empleados[0]); return; }
    const data: DiaModalData = { fecha: d.fecha, varios: { idSucursal: d.idSucursal, sucursal: d.sucursal, empleados } };
    this.abrirDia(data);
  }

  cambiarUno(e: DiaSucursal): void {
    const d = this.dias();
    if (!d) return;
    this.abrirDia({ fecha: d.fecha, empleado: { idEmpleado: e.idEmpleado, nombreCompleto: e.nombreCompleto, dia: e } });
  }

  private abrirDia(data: DiaModalData): void {
    this.dialog.open(DiaModal, { data, width: '560px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: false })
      .afterClosed().subscribe(cambios => { if (cambios) { this.buscarDia(); this.version.update(n => n + 1); } });
  }

  // ── Por ajustar ──

  buscarAjustar(): void {
    const id = this.soloSucursal.value ? this.sucursal()?.idSucursal ?? null : null;
    this.cargandoAjustar.set(true);
    this.api.getHorariosPorAjustar(id).subscribe({
      next: r => {
        this.cargandoAjustar.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.porAjustar.set(r.data);
      },
      error: () => { this.cargandoAjustar.set(false); this.avisos.error('No fue posible consultar los horarios por ajustar'); }
    });
  }

  abrirFicha(idEmpleado: number): void {
    const data: EmpleadoFichaModalData = { idEmpleado };
    this.dialog.open(EmpleadoFichaModal, { data, width: '860px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: false })
      .afterClosed().subscribe(() => { if (this.porAjustar()) this.buscarAjustar(); });
  }

  horas(n: number | null | undefined): string { return n === null || n === undefined ? '—' : `${n} h`; }
  etiquetaJornada(t: TipoJornada | null): string { return t ? this.jornada[t] : ''; }
}
