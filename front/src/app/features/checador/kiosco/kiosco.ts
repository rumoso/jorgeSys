import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SwUpdate } from '@angular/service-worker';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

import { ChecadorService } from '../../../core/services/checador.service';
import { RostroService } from '../../../core/services/rostro.service';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { ApiResponse } from '../../../models/common.models';
import { CapturaRostro, InfoDispositivo, RetoVida } from '../../../models/checador.models';
import { VERSION_FRONT } from '../../../version';
import { CapturaRostroComp } from '../captura-rostro/captura-rostro';

const K_LLAVE = 'rh_checador_llave';
const K_INFO = 'rh_checador_info';
const MS_RESULTADO = 3500;
const MS_SIN_USO = 60_000;

type Aviso = { tipo: 'ok' | 'warn' | 'bad'; titulo: string; detalle?: string; icono: string };

/**
 * El dispositivo checador (análisis 005 §5.1 y §7), en /checador: fuera del
 * marco con sesión y sin login. Nadie inicia sesión aquí: lo identifica su
 * LLAVE, guardada en el navegador y enviada en el encabezado `x-dispositivo`.
 *
 *  - Sin llave: "Vincular este dispositivo" (escanear el QR o escribir el código).
 *  - Con llave: pantalla de quiosco con la cámara siempre lista. Respuesta
 *    grande; duda entre dos → número de empleado; tras varios fallos ofrece
 *    checar con el número; sin conexión lo dice y no registra; revocado →
 *    vuelve a "Vincular".
 *  - Como aparato: pantalla encendida (Wake Lock), latido cada
 *    `checador.latido_seg`, versión nueva solo tras un rato sin nadie enfrente.
 */
@Component({
  selector: 'app-kiosco',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, FechaSucursalPipe, CapturaRostroComp],
  templateUrl: './kiosco.html',
  styleUrl: './kiosco.scss'
})
export class Kiosco implements OnInit, OnDestroy {
  private readonly api = inject(ChecadorService);
  private readonly rostro = inject(RostroService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sw = inject(SwUpdate, { optional: true });

  private readonly captura = viewChild(CapturaRostroComp);
  private readonly videoQr = viewChild<ElementRef<HTMLVideoElement>>('videoQr');

  readonly modo = signal<'inicio' | 'vincular' | 'checador'>('inicio');
  readonly info = signal<InfoDispositivo | null>(null);
  readonly ahora = signal(Date.now());
  readonly sinConexion = signal(false);
  readonly pausado = signal(false);
  readonly aviso = signal<Aviso | null>(null);
  readonly teclado = signal<{ folio: string | null; titulo: string } | null>(null);
  readonly fallos = signal(0);
  readonly intentosAntesDeNumero = signal(3);
  readonly sinCamara = signal<string | null>(null);
  readonly camaraKey = signal(0);
  readonly pantallaCompleta = signal(!!document.fullscreenElement);

  // Vincular
  readonly codigo = new FormControl('', { nonNullable: true });
  readonly vinculando = signal(false);
  readonly mensajeVincular = signal<{ ok: boolean; texto: string } | null>(null);
  readonly escaneando = signal(false);
  readonly numero = new FormControl('', { nonNullable: true });
  readonly enviandoNumero = signal(false);

  readonly ofrecerNumero = computed(() => this.fallos() >= this.intentosAntesDeNumero());
  readonly zona = computed(() => this.info()?.zonaHoraria ?? 'America/Mexico_City');

  private llave: string | null = null;
  private relojTimer: ReturnType<typeof setInterval> | null = null;
  private latidoTimer: ReturnType<typeof setTimeout> | null = null;
  private avisoTimer: ReturnType<typeof setTimeout> | null = null;
  private versionTimer: ReturnType<typeof setInterval> | null = null;
  private latidoSeg = 120;
  private wakeLock: any = null;
  private ultimaPresencia = Date.now();
  private ocupado = false;
  private actualizacionPendiente = false;
  private qrStream: MediaStream | null = null;
  private qrTimer: ReturnType<typeof setTimeout> | null = null;

  readonly pedirReto = async (): Promise<RetoVida | null> => {
    if (!this.llave) return null;
    try {
      const r = await firstValueFrom(this.api.getReto(this.llave));
      if (r.status_code === 0) { this.conexion(true); return r.data; }
      this.revisarRechazo(r);
      return null;
    } catch (e) { this.errorRed(e); return null; }
  };

  ngOnInit(): void {
    this.llave = this.leer(K_LLAVE);
    try { this.info.set(JSON.parse(this.leer(K_INFO) || 'null')); } catch { this.info.set(null); }
    this.relojTimer = setInterval(() => this.ahora.set(Date.now()), 1000);
    window.addEventListener('online', this.alVolverRed);
    window.addEventListener('offline', this.alPerderRed);
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
    document.addEventListener('fullscreenchange', this.alCambiarPantalla);
    this.vigilarVersion();

    const codigoUrl = this.route.snapshot.queryParamMap.get('codigo');
    if (codigoUrl) {
      // Se quita de la dirección: el código es de un solo uso.
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      if (!this.llave) { this.modo.set('vincular'); this.codigo.setValue(codigoUrl); void this.vincular(); return; }
    }
    if (this.llave) this.entrarChecador(); else this.modo.set('vincular');
  }

  ngOnDestroy(): void {
    for (const t of [this.relojTimer, this.versionTimer]) if (t) clearInterval(t);
    for (const t of [this.latidoTimer, this.avisoTimer, this.qrTimer]) if (t) clearTimeout(t);
    window.removeEventListener('online', this.alVolverRed);
    window.removeEventListener('offline', this.alPerderRed);
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    document.removeEventListener('fullscreenchange', this.alCambiarPantalla);
    this.detenerQr();
    void this.wakeLock?.release?.().catch(() => {});
  }

  // ── Vincular ──────────────────────────────────────────────────────────────

  async vincular(): Promise<void> {
    const codigo = this.codigo.value.toUpperCase().replace(/[\s-]/g, '');
    if (codigo.length < 6) { this.mensajeVincular.set({ ok: false, texto: 'Escribe el código completo (8 caracteres).' }); return; }
    if (this.vinculando()) return;
    this.vinculando.set(true);
    this.mensajeVincular.set(null);
    try {
      const r = await firstValueFrom(this.api.vincular(codigo));
      if (r.status_code !== 0) { this.mensajeVincular.set({ ok: false, texto: r.message }); return; }
      this.llave = r.data.llave;
      this.guardar(K_LLAVE, r.data.llave);
      this.guardar(K_INFO, JSON.stringify(r.data.dispositivo));
      this.info.set(r.data.dispositivo);
      this.codigo.setValue('');
      this.detenerQr();
      this.entrarChecador();
    } catch (e) {
      const http = e as HttpErrorResponse;
      this.mensajeVincular.set({ ok: false, texto: http?.status === 429 ? (http.error?.message || 'Demasiados intentos. Espera unos minutos.')
        : 'Sin conexión con el servidor. Revisa el internet del dispositivo.' });
    } finally {
      this.vinculando.set(false);
    }
  }

  /** Escanear el QR que muestra la pantalla del administrador. */
  async escanearQr(): Promise<void> {
    this.escaneando.set(true);
    this.mensajeVincular.set(null);
    await Promise.resolve();
    const video = this.videoQr()?.nativeElement;
    if (!video) return;
    const r = await this.rostro.iniciarCamara(video, 'environment');
    if (!r.ok) {
      this.escaneando.set(false);
      this.mensajeVincular.set({ ok: false, texto: `${r.mensaje} Escribe el código a mano.` });
      return;
    }
    this.qrStream = r.stream;
    const Detector = (window as any).BarcodeDetector;
    let detector: any = null;
    try { if (Detector) detector = new Detector({ formats: ['qr_code'] }); } catch { detector = null; }
    let jsqr: any = null;
    if (!detector) { try { const m: any = await import('jsqr'); jsqr = m.default ?? m; } catch { jsqr = null; } }
    const lienzo = document.createElement('canvas');
    const leer = async () => {
      if (!this.escaneando()) return;
      let texto: string | null = null;
      try {
        if (detector) {
          const res = await detector.detect(video);
          texto = res?.[0]?.rawValue ?? null;
        } else if (jsqr && video.videoWidth) {
          lienzo.width = video.videoWidth; lienzo.height = video.videoHeight;
          const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          texto = jsqr(img.data, img.width, img.height)?.data ?? null;
        }
      } catch { texto = null; }
      const codigo = texto ? this.codigoDeQr(texto) : null;
      if (codigo) { this.codigo.setValue(codigo); this.detenerQr(); void this.vincular(); return; }
      this.qrTimer = setTimeout(leer, 250);
    };
    void leer();
  }

  private codigoDeQr(texto: string): string | null {
    try { const u = new URL(texto); const c = u.searchParams.get('codigo'); if (c) return c; } catch { /* no es URL */ }
    const limpio = texto.trim().toUpperCase().replace(/[\s-]/g, '');
    return /^[A-Z2-9]{6,8}$/.test(limpio) ? limpio : null;
  }

  detenerQr(): void {
    this.escaneando.set(false);
    if (this.qrTimer) { clearTimeout(this.qrTimer); this.qrTimer = null; }
    this.rostro.detenerCamara(this.qrStream);
    this.qrStream = null;
  }

  // ── Modo checador ─────────────────────────────────────────────────────────

  private entrarChecador(): void {
    this.modo.set('checador');
    this.fallos.set(0);
    void this.pedirPantallaEncendida();
    void this.latido();
  }

  /** Avisa al servidor que está encendido; trae los parámetros de la pantalla. */
  private async latido(): Promise<void> {
    if (this.latidoTimer) clearTimeout(this.latidoTimer);
    if (!this.llave) return;
    try {
      const r = await firstValueFrom(this.api.latido(this.llave, VERSION_FRONT));
      if (r.status_code === 0) {
        this.conexion(true);
        const p = r.data.parametros || {};
        this.latidoSeg = Number(p.latidoSeg) || 120;
        this.intentosAntesDeNumero.set(Number(p.intentosAntesDeNumero) || 3);
        if (r.data.dispositivo) { this.info.set(r.data.dispositivo); this.guardar(K_INFO, JSON.stringify(r.data.dispositivo)); }
        if (r.data.versionFront && r.data.versionFront !== VERSION_FRONT) this.actualizacionPendiente = true;
      } else {
        this.revisarRechazo(r);
      }
    } catch (e) { this.errorRed(e); }
    if (this.llave) this.latidoTimer = setTimeout(() => this.latido(), (this.sinConexion() ? 20 : this.latidoSeg) * 1000);
  }

  presencia(): void { this.ultimaPresencia = Date.now(); }

  camara(e: { ok: boolean; error?: string; mensaje?: string }): void {
    this.sinCamara.set(e.ok ? null : (e.error === 'SIN_PERMISO' ? 'SIN_PERMISO' : (e.mensaje || 'No se pudo abrir la cámara.')));
  }

  reintentarCamara(): void { this.sinCamara.set(null); this.camaraKey.update(k => k + 1); }

  async alCapturar(c: CapturaRostro): Promise<void> {
    if (!this.llave) return;
    this.ocupado = true;
    this.pausado.set(true);
    try {
      const r = await firstValueFrom(this.api.checar(this.llave, c.idReto, c.frames, c.foto));
      this.conexion(true);
      this.procesar(r);
    } catch (e) {
      this.errorRed(e);
      this.mostrar({ tipo: 'bad', icono: 'wifi_off', titulo: 'Sin conexión', detalle: 'No se registró. Intenta de nuevo en un momento.' });
    }
  }

  private procesar(r: ApiResponse): void {
    if (this.revisarRechazo(r)) return;
    const d = r.data || {};
    switch (d.resultado) {
      case 'REGISTRADO':
        this.fallos.set(0);
        return this.mostrar({ tipo: 'ok', icono: 'check_circle', titulo: d.nombre, detalle: `${d.hora} · Registrado` });
      case 'POR_REVISAR':
        this.fallos.set(0);
        return this.mostrar({ tipo: 'warn', icono: 'pending', titulo: d.nombre, detalle: `${d.hora} · Registrado; lo revisará tu encargado` });
      case 'DUDA':
        this.numero.setValue('');
        this.teclado.set({ folio: d.folio, titulo: 'Confirma con tu número de empleado' });
        return;
      case 'NO_RECONOCIDO':
        this.fallos.update(n => n + 1);
        return this.mostrar({ tipo: 'bad', icono: 'person_off', titulo: 'No te reconocí', detalle: 'Intenta de nuevo' });
      case 'SIN_VIDA':
        this.fallos.update(n => n + 1);
        return this.mostrar({ tipo: 'bad', icono: 'sync_problem', titulo: 'Intenta de nuevo', detalle: r.message });
      default:
        return this.mostrar({ tipo: d.resultado === 'RECHAZADO' ? 'warn' : 'bad', icono: d.resultado === 'RECHAZADO' ? 'info' : 'error_outline',
          titulo: d.resultado === 'RECHAZADO' ? (d.nombre || 'No se registró') : 'Intenta de nuevo', detalle: r.message });
    }
  }

  /** Revocado, desconocido o sucursal inactiva. Regresa true si ya lo atendió. */
  private revisarRechazo(r: ApiResponse): boolean {
    const codigo = r?.data?.codigo;
    if (codigo === 'DISPOSITIVO_REVOCADO' || codigo === 'DISPOSITIVO_DESCONOCIDO') { this.desvincular(r.message); return true; }
    if (codigo === 'SUCURSAL_INACTIVA' || codigo === 'EMPRESA_SUSPENDIDA') {
      this.mostrar({ tipo: 'bad', icono: 'block', titulo: 'No se puede checar aquí', detalle: r.message }, 8000);
      return true;
    }
    return false;
  }

  private desvincular(mensaje: string): void {
    this.borrar(K_LLAVE);
    this.borrar(K_INFO);
    this.llave = null;
    this.info.set(null);
    this.teclado.set(null);
    this.aviso.set(null);
    if (this.latidoTimer) clearTimeout(this.latidoTimer);
    this.modo.set('vincular');
    this.mensajeVincular.set({ ok: false, texto: mensaje });
  }

  /** Teclado: duda entre dos (con folio) o tras varios fallos (sin folio). */
  abrirTeclado(): void {
    this.numero.setValue('');
    this.teclado.set({ folio: null, titulo: 'Checar con tu número de empleado' });
    this.pausado.set(true);
  }

  tecla(t: string): void {
    if (t === '⌫') this.numero.setValue(this.numero.value.slice(0, -1));
    else if (this.numero.value.length < 20) this.numero.setValue(this.numero.value + t);
  }

  cancelarTeclado(): void { this.teclado.set(null); this.reanudar(); }

  async enviarNumero(): Promise<void> {
    const t = this.teclado();
    const numero = this.numero.value.trim();
    if (!t || !numero || !this.llave || this.enviandoNumero()) return;
    this.enviandoNumero.set(true);
    this.ocupado = true;
    try {
      const foto = (await this.captura()?.tomarFoto()) ?? null;
      const r = await firstValueFrom(this.api.checarConNumero(this.llave, numero, t.folio, foto));
      this.conexion(true);
      this.teclado.set(null);
      this.procesar(r);
    } catch (e) {
      this.errorRed(e);
      this.teclado.set(null);
      this.mostrar({ tipo: 'bad', icono: 'wifi_off', titulo: 'Sin conexión', detalle: 'No se registró. Intenta de nuevo en un momento.' });
    } finally {
      this.enviandoNumero.set(false);
    }
  }

  private mostrar(a: Aviso, ms = MS_RESULTADO): void {
    this.aviso.set(a);
    this.pausado.set(true);
    if (this.avisoTimer) clearTimeout(this.avisoTimer);
    this.avisoTimer = setTimeout(() => { this.aviso.set(null); this.reanudar(); }, ms);
  }

  private reanudar(): void {
    if (this.teclado()) return;
    this.ocupado = false;
    this.pausado.set(false);
  }

  // ── El aparato ────────────────────────────────────────────────────────────

  private conexion(ok: boolean): void { this.sinConexion.set(!ok); }

  private errorRed(e: unknown): void {
    const http = e as HttpErrorResponse;
    if (http?.status === 429) {
      this.mostrar({ tipo: 'warn', icono: 'hourglass_top', titulo: 'Espera un momento', detalle: http.error?.message }, 6000);
      return;
    }
    if (!http?.status) this.conexion(false);
  }

  private readonly alVolverRed = () => { this.conexion(true); void this.latido(); };
  private readonly alPerderRed = () => this.conexion(false);
  private readonly alCambiarPantalla = () => this.pantallaCompleta.set(!!document.fullscreenElement);
  private readonly alCambiarVisibilidad = () => {
    // El Wake Lock se suelta al ocultar la pestaña: se vuelve a pedir al regresar.
    if (document.visibilityState === 'visible' && this.modo() === 'checador') { void this.pedirPantallaEncendida(); void this.latido(); }
  };

  private async pedirPantallaEncendida(): Promise<void> {
    try {
      const wl = (navigator as any).wakeLock;
      if (!wl || (this.wakeLock && !this.wakeLock.released)) return;
      this.wakeLock = await wl.request('screen');
    } catch { /* sin permiso o sin soporte: el cliente ajusta el apagado de pantalla del equipo */ }
  }

  async alternarPantallaCompleta(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
    } catch { /* el navegador no lo permite */ }
  }

  /**
   * Versión nueva: la anuncia el service worker (o el latido). Se aplica solo
   * cuando nadie ha estado enfrente un rato y no hay una checada en curso.
   */
  private vigilarVersion(): void {
    if (this.sw?.isEnabled) {
      this.sw.versionUpdates.subscribe(e => { if (e.type === 'VERSION_READY') this.actualizacionPendiente = true; });
      setInterval(() => { this.sw?.checkForUpdate().catch(() => {}); }, 15 * 60_000);
    }
    this.versionTimer = setInterval(async () => {
      if (!this.actualizacionPendiente || this.ocupado || this.teclado() || this.aviso()) return;
      if (Date.now() - this.ultimaPresencia < MS_SIN_USO) return;
      try { if (this.sw?.isEnabled) await this.sw.activateUpdate(); } catch { /* */ }
      document.location.reload();
    }, 15_000);
  }

  @HostListener('document:keydown', ['$event'])
  teclaFisica(ev: KeyboardEvent): void {
    if (!this.teclado()) return;
    if (ev.key === 'Enter') { ev.preventDefault(); void this.enviarNumero(); }
    else if (ev.key === 'Escape') this.cancelarTeclado();
  }

  private leer(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
  private guardar(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
  private borrar(k: string): void { try { localStorage.removeItem(k); } catch { /* */ } }
}
