import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Observable } from 'rxjs';

import { ApiResponse } from '../../../../models/common.models';

export interface AccionModalData {
  titulo: string;
  texto: string;
  boton: string;
  /** Botón en rojo (suspender, baja, desactivar). */
  peligro?: boolean;
  /** Pide motivo (obligatorio). */
  motivo?: boolean;
  /** Pide escribir este texto exactamente igual para confirmar (nombre de la empresa, clave). */
  confirmar?: { texto: string; etiqueta: string };
  /** Llama al API con lo escrito. */
  accion: (motivo: string, confirmacion: string) => Observable<ApiResponse>;
  /** Con éxito se cierra y regresa la respuesta (p. ej. entrar a la empresa). Si no, se queda con el mensaje. */
  cerrarConExito?: boolean;
}

/**
 * Confirmación de una acción del panel (009) que pide motivo o escribir un
 * nombre: suspender, reactivar, dar de baja, revertir, entrar a la empresa,
 * desactivar una constante. Como los modales CRUD, no se cierra al guardar:
 * muestra el mensaje y al cerrar dice si hubo cambios.
 */
@Component({
  selector: 'app-accion-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  template: `
    <div class="rh-dialog">
      <div class="rh-dialog-head">
        <h2>{{ data.titulo }}</h2>
        <button mat-icon-button (click)="cerrar()" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>
      @if (trabajando()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
      <form class="rh-dialog-body" [formGroup]="form" (ngSubmit)="ejecutar()">
        @if (banner(); as b) {
          <div class="rh-banner" [class.ok]="b.ok" [class.bad]="!b.ok"><mat-icon>{{ b.ok ? 'check_circle' : 'error_outline' }}</mat-icon>{{ b.texto }}</div>
        }
        <p class="am-texto">{{ data.texto }}</p>
        @if (data.motivo) {
          <div class="inline-wrap">
            <label class="slim-label" for="am-motivo">Motivo</label>
            <textarea id="am-motivo" class="inline-input am-area" formControlName="motivo" maxlength="500" rows="3"
                      [class.invalido]="form.controls.motivo.touched && form.controls.motivo.invalid"></textarea>
            <span class="inline-ayuda">Queda en la bitácora del producto.</span>
          </div>
        }
        @if (data.confirmar; as c) {
          <div class="inline-wrap">
            <label class="slim-label" for="am-conf">{{ c.etiqueta }}</label>
            <input id="am-conf" class="inline-input" formControlName="confirmacion" autocomplete="off" [placeholder]="c.texto">
            <span class="inline-ayuda">Escribe <b>{{ c.texto }}</b> exactamente igual.</span>
          </div>
        }
        <button type="submit" hidden></button>
      </form>
      <div class="rh-dialog-foot">
        <button mat-button (click)="cerrar()">{{ hecho() ? 'Cerrar' : 'Cancelar' }}</button>
        @if (!hecho()) {
          <button mat-flat-button [class.am-peligro]="data.peligro" (click)="ejecutar()" [disabled]="trabajando() || !listo()">{{ data.boton }}</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .am-texto { margin: 0; font-size: 13.5px; color: var(--rh-text-2); }
    .am-area { height: auto; min-height: 72px; padding-top: 8px; resize: vertical; }
    .am-peligro { background: var(--rh-bad); color: var(--rh-surface); }
  `]
})
export class AccionModal {
  private readonly ref = inject(MatDialogRef<AccionModal, ApiResponse | boolean>);
  readonly data = inject<AccionModalData>(MAT_DIALOG_DATA);

  readonly trabajando = signal(false);
  readonly hecho = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    motivo: ['', this.data.motivo ? [Validators.required, Validators.maxLength(500)] : []],
    confirmacion: ['']
  });
  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly listo = computed(() => {
    const v = this.valores();
    if (this.data.motivo && !(v.motivo ?? '').trim()) return false;
    if (this.data.confirmar && (v.confirmacion ?? '').trim().replace(/\s+/g, ' ') !== this.data.confirmar.texto.trim().replace(/\s+/g, ' ')) return false;
    return true;
  });

  ejecutar(): void {
    if (this.trabajando() || this.hecho() || !this.listo()) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.trabajando.set(true);
    this.banner.set(null);
    this.data.accion(v.motivo.trim(), v.confirmacion.trim()).subscribe({
      next: r => {
        this.trabajando.set(false);
        if (r.status_code === 0 && this.data.cerrarConExito) { this.ref.close(r); return; }
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) { this.hecho.set(true); this.form.disable(); }
      },
      error: () => { this.trabajando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cerrar(): void { this.ref.close(this.hecho()); }
}
