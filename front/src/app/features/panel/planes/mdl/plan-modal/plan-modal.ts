import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PanelPlanesService } from '../../../../../core/services/panel';
import { Plan, TIPOS_COBRO, TipoCobro } from '../../../../../models/panel.models';

export interface PlanModalData { plan: Plan | null; }

/** Alta y edición de un plan (009). No se cierra al guardar; tras el alta queda en edición. */
@Component({
  selector: 'app-plan-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './plan-modal.html'
})
export class PlanModal {
  private readonly api = inject(PanelPlanesService);
  private readonly ref = inject(MatDialogRef<PlanModal, boolean>);
  readonly data = inject<PlanModalData>(MAT_DIALOG_DATA);

  readonly idPlan = signal<number | null>(this.data.plan?.idPlan ?? null);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly TIPOS = TIPOS_COBRO;
  private cambios = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: [this.data.plan?.nombre ?? '', [Validators.required, Validators.maxLength(100)]],
    tipoCobro: [(this.data.plan?.tipoCobro ?? 'LIMITE') as TipoCobro, [Validators.required]],
    limiteEmpleados: [this.data.plan?.limiteEmpleados != null ? String(this.data.plan.limiteEmpleados) : ''],
    precio: [this.data.plan ? String(this.data.plan.precio) : '']
  });
  readonly tipo = toSignal(this.form.controls.tipoCobro.valueChanges, { initialValue: this.form.controls.tipoCobro.value });

  guardar(): void {
    if (this.guardando()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); this.banner.set({ ok: false, texto: 'Escribe el nombre y escoge el tipo de cobro.' }); return; }
    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.banner.set(null);
    this.api.insertUpdatePlan({
      idPlan: this.idPlan(), nombre: v.nombre.trim(), tipoCobro: v.tipoCobro,
      limiteEmpleados: v.tipoCobro === 'LIMITE' && String(v.limiteEmpleados).trim() !== '' ? Number(v.limiteEmpleados) : null,
      precio: String(v.precio).trim() === '' ? null : Number(v.precio)
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) { this.cambios = true; if (!this.idPlan()) this.idPlan.set(r.data.id); }
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cerrar(): void { this.ref.close(this.cambios); }
}
