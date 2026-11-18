import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { GlobalService, HorariosService } from '../../../../../core/services';
import { EmpleadoAplicar, GrupoAplicar, ResultadoAplicar, VistaPreviaAplicar } from '../../../../../models/horarios.models';
import { FechaNegocioPipe } from '../../../../../shared/pipes/fecha-negocio.pipe';
import { textoTurno } from '../../../../../shared/utils/jornada';

export interface AplicarPlantillaModalData { idSucursal: number; sucursal: string; }

interface Grupo { clave: GrupoAplicar; titulo: string; ayuda: string; }
const GRUPOS: Grupo[] = [
  { clave: 'CAMBIARIA', titulo: 'Cambiarían', ayuda: 'No tienen horario o tienen una versión anterior de la plantilla.' },
  { clave: 'PROPIO', titulo: 'Tienen un horario propio distinto', ayuda: 'Se les ajustó el horario a mano: revisa antes de escogerlos.' },
  { clave: 'IGUAL', titulo: 'Ya tienen este horario', ayuda: 'Aplicarla solo regenera sus días desde la fecha.' }
];

/**
 * "Aplicar a empleados…" (análisis 006 §2): vista previa en tres grupos
 * (cambiarían, horario propio distinto, ya lo tienen), casillas para escoger
 * a quién, fecha "a partir de" y el resultado con los días cambiados a mano
 * que se conservaron. Aplica la plantilla GUARDADA. No se cierra al aplicar.
 */
@Component({
  selector: 'app-aplicar-plantilla-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, FechaNegocioPipe],
  templateUrl: './aplicar-plantilla-modal.html',
  styleUrl: './aplicar-plantilla-modal.scss'
})
export class AplicarPlantillaModal {
  private readonly api = inject(HorariosService);
  private readonly ref = inject(MatDialogRef<AplicarPlantillaModal, boolean>);
  readonly data = inject<AplicarPlantillaModalData>(MAT_DIALOG_DATA);
  private readonly global = inject(GlobalService);

  readonly puedeAplicar = this.global.tienePermiso('horarios_Plantilla');
  readonly puedeRetroactivo = this.global.tienePermiso('horarios_Retroactivo');
  readonly grupos = GRUPOS;
  readonly turno = textoTurno;

  readonly vista = signal<VistaPreviaAplicar | null>(null);
  readonly escogidos = signal<Set<number>>(new Set());
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly resultado = signal<ResultadoAplicar | null>(null);
  private cambios = false;

  readonly form = inject(FormBuilder).nonNullable.group({ aPartirDe: [''], motivo: [''] });

  readonly porGrupo = computed(() => {
    const l = this.vista()?.empleados ?? [];
    return Object.fromEntries(GRUPOS.map(g => [g.clave, l.filter(e => e.grupo === g.clave)])) as Record<GrupoAplicar, EmpleadoAplicar[]>;
  });
  readonly conservados = computed(() => (this.resultado()?.resultados ?? []).filter(r => r.conservados.length));

  constructor() { this.cargar(true); }

  cargar(inicial = false): void {
    this.cargando.set(true);
    this.api.previsualizarAplicar(this.data.idSucursal).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return; }
        const v = r.data as VistaPreviaAplicar;
        this.vista.set(v);
        if (inicial) {
          this.form.controls.aPartirDe.setValue(v.hoy);
          this.escogidos.set(new Set(v.empleados.filter(e => e.grupo === 'CAMBIARIA').map(e => e.idEmpleado)));
        } else {
          const ids = new Set(v.empleados.map(e => e.idEmpleado));
          this.escogidos.update(s => new Set([...s].filter(id => ids.has(id))));
        }
      },
      error: () => { this.cargando.set(false); this.banner.set({ ok: false, texto: 'No fue posible preparar la vista previa.' }); }
    });
  }

  escogido(id: number): boolean { return this.escogidos().has(id); }

  alternar(id: number, si: boolean): void {
    this.escogidos.update(s => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; });
  }

  todos(g: GrupoAplicar): boolean { const l = this.porGrupo()[g]; return l.length > 0 && l.every(e => this.escogido(e.idEmpleado)); }

  alternarGrupo(g: GrupoAplicar, si: boolean): void {
    const ids = this.porGrupo()[g].map(e => e.idEmpleado);
    this.escogidos.update(s => { const n = new Set(s); for (const id of ids) { if (si) n.add(id); else n.delete(id); } return n; });
  }

  /** Su horario actual, legible: ['Lunes: 09:00–18:00, comida 60 min (se descuenta)', …]. */
  horarioDe(e: EmpleadoAplicar): string[] { return Object.entries(e.horario).map(([dia, t]) => `${dia}: ${t}`); }

  async aplicar(): Promise<void> {
    if (this.guardando() || !this.puedeAplicar) return;
    const v = this.form.getRawValue();
    const ids = [...this.escogidos()];
    if (!ids.length) { this.banner.set({ ok: false, texto: 'Escoge al menos un empleado.' }); return; }
    if (!v.aPartirDe) { this.banner.set({ ok: false, texto: 'Escoge la fecha "a partir de".' }); return; }
    if (!confirm(`¿Aplicar la plantilla de ${this.data.sucursal} a ${ids.length} empleado(s) a partir del ${v.aPartirDe}? Sus días se regeneran desde esa fecha; los cambiados a mano se respetan.`)) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.api.aplicarPlantilla({ idSucursal: this.data.idSucursal, idEmpleados: ids, aPartirDe: v.aPartirDe, motivo: v.motivo.trim() || null }));
      this.banner.set({ ok: r.status_code === 0, texto: r.message });
      if (r.status_code === 0) {
        this.cambios = true;
        this.resultado.set(r.data);
        this.cargar();
      }
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  cerrar(): void { this.ref.close(this.cambios); }
}
