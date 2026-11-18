import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { AuthService, FaceIdService, FormasChecadoService, GlobalService } from '../../../core/services';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { CapturaRostro, FormaEmpleado, RetoVida, RostroEmpleado as EstadoRostroEmpleado } from '../../../models/checador.models';
import { CapturaRostroComp } from '../captura-rostro/captura-rostro';

/**
 * Pestaña "Face ID" de la ficha del empleado (análisis 005 §6). Se enchufa a
 * la ficha del 004 con su renglón en `empleado-ficha-modal/pestanas.ts` y
 * recibe `idEmpleado`:
 *  - estado: sin consentimiento, sin rostro o registrado (quién y cuándo);
 *  - aceptar el consentimiento mostrando el texto vigente; retirarlo (elimina el rostro);
 *  - registrar el rostro: tomas con guía, prueba de vida y calidad; aviso de
 *    parecido con otro empleado antes de guardar;
 *  - excepción de formas de checar del empleado.
 * El rostro registrado nunca llega al navegador.
 */
@Component({
  selector: 'app-rostro-empleado',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, MatProgressBarModule, FechaSucursalPipe, CapturaRostroComp],
  templateUrl: './rostro-empleado.html',
  styleUrl: './rostro-empleado.scss'
})
export class RostroEmpleado implements OnInit {
  private readonly api = inject(FaceIdService);
  private readonly formasApi = inject(FormasChecadoService);
  readonly global = inject(GlobalService);
  readonly zona = inject(AuthService).zonaActiva;

  readonly idEmpleado = input.required<number>();

  readonly estado = signal<EstadoRostroEmpleado | null>(null);
  readonly formas = signal<FormaEmpleado[]>([]);
  readonly sucursalPrincipal = signal('');
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly capturando = signal(false);
  readonly procesando = signal(false);
  readonly parecido = signal<{ token: string; mensaje: string; parecidos: { nombre: string; numeroEmpleado: string; similitud: number }[] } | null>(null);
  readonly verTexto = signal(false);

  readonly puedeRegistrar = this.global.tienePermiso('rostros_Registrar');
  readonly puedeFormas = this.global.tienePermiso('formas_Configurar');
  readonly activo = computed(() => this.estado()?.empleado.estado === 'ACTIVO');

  readonly form = inject(FormBuilder).nonNullable.group({
    medio: ['PAPEL_FIRMADO' as 'PAPEL_FIRMADO' | 'EN_PANTALLA', Validators.required],
    nota: ['', Validators.maxLength(250)]
  });

  /** Para el componente de captura: el reto lo pide el servidor. */
  readonly pedirReto = async (): Promise<RetoVida | null> => {
    const r = await firstValueFrom(this.api.getRetoRegistro());
    if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return null; }
    return r.data;
  };

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.getRostroEmpleado(this.idEmpleado()).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.estado.set(r.data); else this.banner.set({ ok: false, texto: r.message });
      },
      error: () => { this.cargando.set(false); this.banner.set({ ok: false, texto: 'No fue posible consultar el Face ID.' }); }
    });
    this.formasApi.getFormasEmpleado(this.idEmpleado()).subscribe(r => {
      if (r.status_code === 0) { this.formas.set(r.data.formas); this.sucursalPrincipal.set(r.data.sucursalPrincipal); }
    });
  }

  async aceptar(): Promise<void> {
    const e = this.estado();
    if (!e?.textoVigente || this.guardando()) return;
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      const r = await firstValueFrom(this.api.aceptarConsentimiento({
        idEmpleado: this.idEmpleado(), version: e.textoVigente.version, medio: v.medio, nota: v.nota.trim() || null
      }));
      this.banner.set({ ok: r.status_code === 0, texto: r.message });
      if (r.status_code === 0) { this.verTexto.set(false); this.cargar(); }
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally { this.guardando.set(false); }
  }

  async retirar(): Promise<void> {
    if (this.guardando()) return;
    const motivo = prompt('Se retirará el consentimiento y se ELIMINARÁ el rostro registrado. El empleado podrá checar por otra forma.\n\nMotivo (opcional):');
    if (motivo === null) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.api.retirarConsentimiento(this.idEmpleado(), motivo.trim() || null));
      this.banner.set({ ok: r.status_code === 0, texto: r.message });
      if (r.status_code === 0) { this.capturando.set(false); this.cargar(); }
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally { this.guardando.set(false); }
  }

  registrar(): void {
    this.banner.set(null);
    this.parecido.set(null);
    this.capturando.set(true);
  }

  async alCapturar(c: CapturaRostro): Promise<void> {
    this.procesando.set(true);
    try {
      const r = await firstValueFrom(this.api.registrarRostro(this.idEmpleado(), c.idReto, c.frames));
      if (r.status_code === 0) {
        this.capturando.set(false);
        this.banner.set({ ok: true, texto: r.message });
        this.cargar();
      } else if (r.data?.codigo === 'PARECIDO') {
        this.capturando.set(false);
        this.parecido.set({ token: r.data.tokenConfirmacion, mensaje: r.message, parecidos: r.data.parecidos });
      } else {
        this.banner.set({ ok: false, texto: r.message });
      }
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally { this.procesando.set(false); }
  }

  async confirmarParecido(): Promise<void> {
    const p = this.parecido();
    if (!p || this.guardando()) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.api.confirmarRostro(this.idEmpleado(), p.token));
      this.parecido.set(null);
      this.banner.set({ ok: r.status_code === 0, texto: r.message });
      if (r.status_code === 0) this.cargar();
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally { this.guardando.set(false); }
  }

  descartarParecido(): void { this.parecido.set(null); this.banner.set({ ok: false, texto: 'No se guardó el rostro.' }); }

  camaraLista(e: { ok: boolean; mensaje?: string }): void {
    if (!e.ok) this.banner.set({ ok: false, texto: `${e.mensaje ?? 'Sin cámara.'} Revisa el permiso de la cámara en el navegador.` });
  }

  valorForma(f: FormaEmpleado): string { return f.excepcion === null ? 'sucursal' : f.excepcion ? 'si' : 'no'; }

  cambiarForma(f: FormaEmpleado, valor: string): void {
    const bPermitida = valor === 'sucursal' ? null : valor === 'si';
    this.formasApi.setFormaEmpleado(this.idEmpleado(), f.forma, bPermitida).subscribe({
      next: r => { this.banner.set({ ok: r.status_code === 0, texto: r.message }); this.cargar(); },
      error: () => this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' })
    });
  }

  porcentaje(n: number): string { return `${Math.round(n * 100)}%`; }
  medio(m: string | undefined): string { return m === 'EN_PANTALLA' ? 'aceptado en pantalla' : 'papel firmado'; }
}
