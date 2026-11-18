import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { GlobalService } from '../../../../../core/services';
import { CatalogoSimpleItem } from '../../../../../models/empleados.models';
import { TipoCatalogo } from '../../tipos';

export interface CatalogoSimpleModalData { tipo: TipoCatalogo; item: CatalogoSimpleItem | null; }
export type CatalogoSimpleGuardado = { id: number; nombre: string } | null;

/**
 * Alta y edición de un puesto o un departamento. No se cierra al guardar
 * (convención de modales CRUD); al cerrar regresa el último registro
 * guardado, para que la ficha del empleado lo escoja (alta al vuelo).
 */
@Component({
  selector: 'app-catalogo-simple-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './catalogo-simple-modal.html'
})
export class CatalogoSimpleModal {
  private readonly ref = inject(MatDialogRef<CatalogoSimpleModal, CatalogoSimpleGuardado>);
  readonly data = inject<CatalogoSimpleModalData>(MAT_DIALOG_DATA);
  readonly puedeGuardar = inject(GlobalService).tienePermiso(this.data.tipo.accionEditar);

  readonly id = signal<number | null>(this.data.item?.id ?? null);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly nombre = new FormControl(this.data.item?.nombre ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] });
  private guardado: CatalogoSimpleGuardado = null;

  constructor() { if (!this.puedeGuardar) this.nombre.disable(); }

  guardar(): void {
    if (this.guardando() || !this.puedeGuardar) return;
    const nombre = this.nombre.value.trim().replace(/\s+/g, ' ');
    if (!nombre) { this.nombre.markAsTouched(); this.banner.set({ ok: false, texto: 'Escribe el nombre.' }); return; }
    this.guardando.set(true);
    this.data.tipo.guardar({ id: this.id(), nombre }).subscribe({
      next: r => {
        this.guardando.set(false);
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) {
          this.id.set(r.data.id);
          this.nombre.setValue(r.data.nombre);
          this.guardado = { id: r.data.id, nombre: r.data.nombre };
        }
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cerrar(): void { this.ref.close(this.guardado); }
}
