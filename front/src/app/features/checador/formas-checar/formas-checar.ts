import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { FaceIdService, FormasChecadoService, GlobalService, NotificationService } from '../../../core/services';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { ConsentimientoTexto, FormaChecado, FormasSucursal } from '../../../models/checador.models';

/**
 * Checador → Formas de checar (análisis 005 §2 y §6):
 *  - por sucursal, activar o desactivar cada forma; las que el producto aún
 *    no tiene se ven como "próximamente". Sin `formas_Configurar`, solo lectura;
 *  - el texto del consentimiento de Face ID de la empresa: guardar crea una
 *    versión nueva (con `consentimiento_Editar`).
 */
@Component({
  selector: 'app-formas-checar',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatSlideToggleModule, MatSnackBarModule, FechaSucursalPipe],
  templateUrl: './formas-checar.html',
  styleUrl: './formas-checar.scss'
})
export class FormasChecar implements OnInit {
  private readonly api = inject(FormasChecadoService);
  private readonly faceApi = inject(FaceIdService);
  private readonly avisos = inject(NotificationService);
  readonly global = inject(GlobalService);
  readonly auth = inject(AuthService);

  readonly formas = signal<FormaChecado[]>([]);
  readonly sucursales = signal<FormasSucursal[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal<string | null>(null);
  readonly puedeConfigurar = this.global.tienePermiso('formas_Configurar');
  readonly puedeEditarTexto = this.global.tienePermiso('consentimiento_Editar');

  readonly consentimiento = signal<ConsentimientoTexto | null>(null);
  readonly texto = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(50), Validators.maxLength(5000)] });
  readonly guardandoTexto = signal(false);
  readonly bannerTexto = signal<{ ok: boolean; texto: string } | null>(null);

  ngOnInit(): void {
    this.cargar();
    this.cargarTexto();
    if (!this.puedeEditarTexto) this.texto.disable();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.getFormasSucursal().subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.formas.set(r.data.formas);
        this.sucursales.set(r.data.sucursales);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar las formas de checar'); }
    });
  }

  activa(s: FormasSucursal, f: FormaChecado): boolean { return !!s.formas[f.forma]?.bActiva; }

  cambiar(s: FormasSucursal, f: FormaChecado, bActiva: boolean): void {
    const k = `${s.idSucursal}:${f.forma}`;
    if (!bActiva && f.forma === 'dispositivo'
      && !confirm(`¿Desactivar "${f.nombre}" en ${s.nombre}? Sus dispositivos dejarán de registrar a quien no tenga una excepción.`)) {
      this.cargar();
      return;
    }
    this.guardando.set(k);
    this.api.setFormaSucursal(s.idSucursal, f.forma, bActiva).subscribe({
      next: r => {
        this.guardando.set(null);
        if (r.status_code === 0) this.avisos.success(`${r.message} en ${s.nombre}`); else this.avisos.error(r.message);
        this.cargar();
      },
      error: () => { this.guardando.set(null); this.avisos.error('No fue posible guardar'); this.cargar(); }
    });
  }

  private cargarTexto(): void {
    this.faceApi.getConsentimientoTexto().subscribe(r => {
      if (r.status_code !== 0) return;
      this.consentimiento.set(r.data);
      this.texto.setValue(r.data?.texto ?? '');
      this.texto.markAsPristine();
    });
  }

  guardarTexto(): void {
    if (this.guardandoTexto() || !this.puedeEditarTexto) return;
    if (this.texto.invalid) { this.bannerTexto.set({ ok: false, texto: 'El texto debe tener entre 50 y 5000 caracteres.' }); return; }
    const siguiente = (this.consentimiento()?.version ?? 0) + 1;
    if (!confirm(`Guardar crea la versión ${siguiente} del consentimiento y es la que se mostrará desde ahora. Quien ya aceptó una versión anterior la conserva. ¿Continuar?`)) return;
    this.guardandoTexto.set(true);
    this.faceApi.insertConsentimientoTexto(this.texto.value.trim()).subscribe({
      next: r => {
        this.guardandoTexto.set(false);
        this.bannerTexto.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) this.cargarTexto();
      },
      error: () => { this.guardandoTexto.set(false); this.bannerTexto.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }
}
