import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { AuthService, DispositivosService } from '../../../../../core/services';
import { CodigoVinculacion, Dispositivo } from '../../../../../models/checador.models';

export interface DispositivoModalData {
  /** null: agregar uno nuevo. Con un pendiente: generar su código otra vez. */
  dispositivo: Dispositivo | null;
  idSucursal: number | null;
}

/**
 * Agregar un dispositivo checador y vincularlo (análisis 005 §5). El
 * administrador escoge la sucursal (solo las suyas) y el nombre; al guardar
 * se muestra el código grande, su QR y la cuenta regresiva. Mientras está a
 * la vista se consulta cada pocos segundos y cambia sola a "Vinculado".
 * No se cierra al guardar (convención de modales).
 */
@Component({
  selector: 'app-dispositivo-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './dispositivo-modal.html',
  styleUrl: './dispositivo-modal.scss'
})
export class DispositivoModal implements OnDestroy {
  private readonly api = inject(DispositivosService);
  private readonly ref = inject(MatDialogRef<DispositivoModal, boolean>);
  readonly data = inject<DispositivoModalData>(MAT_DIALOG_DATA);
  readonly sucursales = inject(AuthService).sucursales;

  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly codigo = signal<CodigoVinculacion | null>(null);
  readonly qr = signal<string | null>(null);
  readonly restante = signal(0);
  readonly vinculado = signal(false);
  readonly idDispositivo = signal<number | null>(this.data.dispositivo?.idDispositivo ?? null);
  readonly codigoVisible = computed(() => this.codigo()?.codigo.replace(/(.{4})(.+)/, '$1 $2') ?? '');
  readonly reloj = computed(() => {
    const s = this.restante();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  private cambios = false;
  private cuenta: ReturnType<typeof setInterval> | null = null;
  private sondeo: ReturnType<typeof setInterval> | null = null;

  readonly form = inject(FormBuilder).nonNullable.group({
    idSucursal: [this.data.dispositivo?.idSucursal ?? this.data.idSucursal ?? this.sucursales()[0]?.idSucursal ?? 0, [Validators.required, Validators.min(1)]],
    nombre: [this.data.dispositivo?.nombre ?? '', [Validators.required, Validators.maxLength(80)]]
  });

  constructor() {
    if (this.data.dispositivo) {
      this.form.disable();
      void this.generarOtro();
    }
  }

  ngOnDestroy(): void { this.detener(); }

  async guardar(): Promise<void> {
    if (this.guardando() || this.idDispositivo()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ ok: false, texto: 'Escoge la sucursal y escribe el nombre del dispositivo.' });
      return;
    }
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      const r = await firstValueFrom(this.api.insertDispositivo(Number(v.idSucursal), v.nombre.trim()));
      if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return; }
      this.cambios = true;
      this.idDispositivo.set(r.data.id);
      this.form.disable();
      this.banner.set({ ok: true, texto: r.message });
      await this.mostrar(r.data);
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  /** "Generar otro": el código anterior deja de servir. */
  async generarOtro(): Promise<void> {
    const id = this.idDispositivo();
    if (!id || this.guardando()) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.api.regenerarCodigo(id));
      if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return; }
      this.cambios = true;
      this.banner.set({ ok: true, texto: r.message });
      await this.mostrar(r.data);
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  private async mostrar(c: CodigoVinculacion): Promise<void> {
    this.detener();
    this.codigo.set(c);
    this.vinculado.set(false);
    // El QR lleva la dirección del checador con el código: sirve escaneado
    // desde el propio checador o desde la cámara del dispositivo.
    const url = `${location.origin}/checador?codigo=${encodeURIComponent(c.codigo)}`;
    try {
      const mod: any = await import('qrcode-generator');
      const qrcode = mod.default ?? mod;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      this.qr.set(qr.createDataURL(8, 2));
    } catch { this.qr.set(null); }

    const vence = new Date(c.vence).getTime();
    const tic = () => this.restante.set(Math.max(0, Math.round((vence - Date.now()) / 1000)));
    tic();
    this.cuenta = setInterval(() => { tic(); if (!this.restante()) this.detener(); }, 1000);
    this.sondeo = setInterval(() => this.consultar(), 3000);
  }

  private consultar(): void {
    const id = this.idDispositivo();
    if (!id) return;
    this.api.getEstadoVinculacion(id).subscribe({
      next: r => {
        if (r.status_code === 0 && r.data.estado === 'VINCULADO') {
          this.detener();
          this.vinculado.set(true);
          this.cambios = true;
          this.banner.set({ ok: true, texto: 'Vinculado: el dispositivo ya está en modo checador.' });
        }
      },
      error: () => { /* se reintenta en el siguiente ciclo */ }
    });
  }

  private detener(): void {
    if (this.cuenta) { clearInterval(this.cuenta); this.cuenta = null; }
    if (this.sondeo) { clearInterval(this.sondeo); this.sondeo = null; }
  }

  cerrar(): void { this.detener(); this.ref.close(this.cambios); }
}
