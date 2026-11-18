import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { EmpleadosService } from '../../../../../core/services';
import { CatalogosEmpleado, EmpleadoParecido } from '../../../../../models/empleados.models';
import { hoyEnZona } from '../../../../../shared/utils/fecha-negocio';

export interface EmpleadoAltaModalData { catalogos: CatalogosEmpleado; }

/**
 * Alta rápida (análisis 004): número (propuesto, editable), nombre,
 * apellidos, sucursal principal y fecha de ingreso (hoy en la zona de la
 * sucursal). Si el servidor avisa un posible duplicado, muestra a los
 * parecidos y pregunta si continuar. Al guardar se cierra con el id, y la
 * lista abre la ficha para completar el resto.
 */
@Component({
  selector: 'app-empleado-alta-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './empleado-alta-modal.html',
  styles: [`.ea-parecidos { margin: 6px 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }`]
})
export class EmpleadoAltaModal {
  private readonly api = inject(EmpleadosService);
  private readonly ref = inject(MatDialogRef<EmpleadoAltaModal, number | null>);
  readonly data = inject<EmpleadoAltaModalData>(MAT_DIALOG_DATA);

  readonly sucursales = this.data.catalogos.sucursales;
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly parecidos = signal<{ mensaje: string; lista: EmpleadoParecido[]; fuera: number } | null>(null);
  private fechaTocada = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    numeroEmpleado: ['', [Validators.maxLength(20)]],
    nombre: ['', [Validators.required, Validators.maxLength(80)]],
    apellidoPaterno: ['', [Validators.required, Validators.maxLength(60)]],
    apellidoMaterno: ['', [Validators.maxLength(60)]],
    idSucursalPrincipal: [this.sucursales.length === 1 ? this.sucursales[0].idSucursal : 0, [Validators.min(1)]],
    fechaIngreso: ['', [Validators.required]]
  });

  constructor() {
    this.api.getSiguienteNumero().subscribe(r => {
      if (r.status_code === 0 && !this.form.controls.numeroEmpleado.value) this.form.controls.numeroEmpleado.setValue(r.data.numeroEmpleado);
    });
    this.ponerHoy();
    this.form.controls.idSucursalPrincipal.valueChanges.subscribe(() => { if (!this.fechaTocada) this.ponerHoy(); });
    this.form.controls.fechaIngreso.valueChanges.subscribe(() => (this.fechaTocada = true));
    // Si cambia un dato del nombre, la pregunta de duplicados ya no aplica.
    for (const k of ['nombre', 'apellidoPaterno', 'apellidoMaterno'] as const) {
      this.form.controls[k].valueChanges.subscribe(() => this.parecidos.set(null));
    }
  }

  /** Hoy en la zona de la sucursal escogida (o la primera). */
  private ponerHoy(): void {
    const s = this.sucursales.find(x => x.idSucursal === this.form.controls.idSucursalPrincipal.value) ?? this.sucursales[0];
    this.form.controls.fechaIngreso.setValue(hoyEnZona(s?.zonaHoraria ?? 'America/Mexico_City'), { emitEvent: false });
  }

  guardar(confirmarDuplicado = false): void {
    if (this.guardando()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ ok: false, texto: 'Escribe el nombre y el apellido paterno, y escoge la sucursal y la fecha de ingreso.' });
      return;
    }
    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.banner.set(null);
    this.api.insertUpdateEmpleado({
      numeroEmpleado: v.numeroEmpleado.trim() || null, nombre: v.nombre.trim(), apellidoPaterno: v.apellidoPaterno.trim(),
      apellidoMaterno: v.apellidoMaterno.trim() || null, idSucursalPrincipal: v.idSucursalPrincipal,
      fechaIngreso: v.fechaIngreso, confirmarDuplicado
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r.status_code === 0) { this.ref.close(r.data.id); return; }
        if (r.data?.codigo === 'POSIBLE_DUPLICADO') {
          this.parecidos.set({ mensaje: r.message, lista: r.data.parecidos ?? [], fuera: r.data.fueraDeAlcance ?? 0 });
          return;
        }
        this.banner.set({ ok: false, texto: r.message });
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cerrar(): void { this.ref.close(null); }
}
