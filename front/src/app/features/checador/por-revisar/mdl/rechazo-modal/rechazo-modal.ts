import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { MarcajesService } from '../../../../../core/services';
import { MarcajePorRevisar } from '../../../../../models/checador.models';

export interface RechazoModalData { marcaje: MarcajePorRevisar; }

/**
 * Rechazar un marcaje por revisar (análisis 005 §4): el motivo es
 * obligatorio. El marcaje no se borra: queda anulado y visible.
 */
@Component({
  selector: 'app-rechazo-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './rechazo-modal.html'
})
export class RechazoModal {
  private readonly api = inject(MarcajesService);
  private readonly ref = inject(MatDialogRef<RechazoModal, boolean>);
  readonly data = inject<RechazoModalData>(MAT_DIALOG_DATA);

  readonly motivo = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(250)] });
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly hecho = signal(false);

  guardar(): void {
    if (this.guardando() || this.hecho()) return;
    if (!this.motivo.value.trim()) { this.motivo.markAsTouched(); this.banner.set({ ok: false, texto: 'Escribe el motivo del rechazo.' }); return; }
    this.guardando.set(true);
    this.api.rechazarMarcaje(this.data.marcaje.idMarcaje, this.motivo.value.trim()).subscribe({
      next: r => {
        this.guardando.set(false);
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) { this.hecho.set(true); this.motivo.disable(); }
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cerrar(): void { this.ref.close(this.hecho()); }
}
