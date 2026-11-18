import { Component, ElementRef, OnDestroy, OnInit, inject, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { DETECTOR_GRABACION, DeteccionRostro, ErrorCamara, RostroService } from '../../../core/services/rostro.service';
import { CapturaRostro, CuadroRostro, RetoVida } from '../../../models/checador.models';

/**
 * Cámara con guía de encuadre y prueba de vida (análisis 005; portado del
 * componente de Face ID de AgroEnvases 069). Lo usan el registro del rostro
 * (pestaña Face ID del empleado) y el checador del dispositivo.
 *
 * Este componente CAPTURA; quien decide es el servidor:
 *  1. guía a la persona hasta que su rostro queda encuadrado, con luz y de frente;
 *  2. pide un reto (giros de cabeza al azar) con `pedirReto`;
 *  3. graba la secuencia (puntos de ojos y nariz, descriptores, confianza)
 *     palomeando cada giro, y toma la foto del momento;
 *  4. emite `capturada` y se queda en pausa hasta que el padre ponga
 *     `pausado` en false.
 */
@Component({
  selector: 'app-captura-rostro',
  imports: [MatIconModule],
  templateUrl: './captura-rostro.html',
  styleUrl: './captura-rostro.scss'
})
export class CapturaRostroComp implements OnInit, OnDestroy {
  private readonly rostro = inject(RostroService);

  /** CHECADOR: rápido (1–2 giros, 3 tomas). REGISTRO: 2 giros y las tomas que pida el servidor. */
  readonly modo = input<'CHECADOR' | 'REGISTRO'>('CHECADOR');
  readonly pedirReto = input.required<() => Promise<RetoVida | null>>();
  readonly pausado = input(false);
  /** Tomas (cuadros con descriptor) mínimas. */
  readonly minTomas = input(3);
  /** Video más grande (quiosco). */
  readonly grande = input(false);

  readonly capturada = output<CapturaRostro>();
  readonly camara = output<{ ok: boolean; error?: ErrorCamara; mensaje?: string }>();
  /** Hay alguien enfrente (para saber cuándo el dispositivo está sin uso). */
  readonly presencia = output<void>();

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  readonly cargando = signal(true);
  readonly listo = signal(false);
  readonly error = signal<string | null>(null);
  readonly guia = signal<{ estado: 'buscando' | 'reacomoda' | 'alineado'; texto: string }>({ estado: 'buscando', texto: 'Colócate frente a la cámara' });
  readonly grabando = signal(false);
  readonly instruccion = signal('');
  readonly giros = signal<{ lado: 'IZQ' | 'DER'; hecho: boolean }[]>([]);
  readonly lado = signal<'IZQ' | 'DER' | null>(null);
  readonly ovalo = signal({ x: 50, y: 45, ancho: 45, alto: 60 });
  readonly aviso = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private vivo = false;
  private ticksAlineado = 0;
  private pausaHasta = 0;

  private reto: RetoVida | null = null;
  private tReto = 0;
  private t0 = 0;
  private tUltimoDesc = 0;
  private nDesc = 0;
  private cuadros: CuadroRostro[] = [];
  private medidas: { t: number; dx: number }[] = [];
  private paso = 0;
  private esperaCentro = false;
  private postura: number | null = null;

  // Encuadre relativo al lado corto del video (sirve igual en tableta y celular).
  private readonly RATIO_MIN = 0.26;
  private readonly RATIO_MAX = 0.75;
  private readonly RATIO_IDEAL = 0.45;
  private readonly IPD_MINIMO = 40;
  private readonly LUZ_MINIMA = 55;
  private readonly TICKS_PARA_GRABAR = 4;
  private readonly MS_SONDEO = 150;
  private readonly MS_FRAME = 60;
  private readonly MS_MIN = 1200;
  private readonly MS_MAX = 13000;
  private readonly MAX_CUADROS = 190;
  private readonly MS_POSTURA = 800;
  private readonly MS_ANTES_DE_GIRAR = 1000;

  private get maxTomas(): number { return Math.min(15, Math.max(this.minTomas() + 2, this.modo() === 'REGISTRO' ? 10 : 6)); }
  private get msEntreTomas(): number { return this.modo() === 'REGISTRO' ? 450 : 650; }

  async ngOnInit(): Promise<void> {
    try {
      await this.rostro.cargarModelos();
    } catch {
      this.cargando.set(false);
      this.error.set('No se pudo cargar el reconocimiento facial. Revisa la conexión.');
      this.camara.emit({ ok: false, error: 'OTRO', mensaje: this.error()! });
      return;
    }
    const r = await this.rostro.iniciarCamara(this.videoRef().nativeElement);
    this.cargando.set(false);
    if (!r.ok) {
      this.error.set(r.mensaje);
      this.camara.emit({ ok: false, error: r.error, mensaje: r.mensaje });
      return;
    }
    this.stream = r.stream;
    // Si el permiso se quita o la cámara se desconecta, se avisa.
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.listo.set(false);
      this.camara.emit({ ok: false, error: 'SIN_PERMISO', mensaje: 'Se perdió la cámara.' });
    });
    this.listo.set(true);
    this.camara.emit({ ok: true });
    // Precalentar el detector al tamaño de la grabación: la primera detección tarda.
    try { await this.rostro.detectar(this.videoRef().nativeElement, true, DETECTOR_GRABACION); } catch { /* */ }
    this.iniciarCiclo();
  }

  ngOnDestroy(): void {
    this.vivo = false;
    if (this.timer) clearTimeout(this.timer);
    this.cancelar();
    this.rostro.detenerCamara(this.stream);
  }

  /** Para el padre: la foto del momento (checar con número de empleado). */
  tomarFoto(): Promise<Blob | null> {
    return this.listo() ? this.rostro.foto(this.videoRef().nativeElement) : Promise.resolve(null);
  }

  /** Para el padre: empezar a grabar ya (botón "Tomar ahora"). */
  ahora(): void {
    if (!this.grabando() && this.puedeSondear()) void this.iniciarGrabacion();
  }

  private iniciarCiclo(): void {
    this.vivo = true;
    const tick = async () => {
      if (!this.vivo) return;
      let espera = this.MS_SONDEO;
      try {
        if (this.grabando()) {
          const t0 = performance.now();
          await this.tickGrabacion();
          espera = Math.max(5, this.MS_FRAME - (performance.now() - t0));
        } else if (this.puedeSondear()) {
          await this.tickEncuadre();
        }
      } catch { /* un cuadro que falla no detiene el ciclo */ }
      if (this.vivo) this.timer = setTimeout(tick, espera);
    };
    void tick();
  }

  private puedeSondear(): boolean {
    return this.listo() && !this.pausado() && Date.now() >= this.pausaHasta;
  }

  private async tickEncuadre(): Promise<void> {
    const video = this.videoRef().nativeElement;
    const det = await this.rostro.detectar(video, false);
    this.moverOvalo(det, video.videoWidth, video.videoHeight);
    if (!det) {
      this.guia.set({ estado: 'buscando', texto: 'Colócate frente a la cámara' });
      this.ticksAlineado = 0;
      return;
    }
    this.presencia.emit();
    if (this.evaluar(det, video)) {
      if (++this.ticksAlineado >= this.TICKS_PARA_GRABAR) {
        this.ticksAlineado = 0;
        await this.iniciarGrabacion();
      }
    } else {
      this.ticksAlineado = 0;
    }
  }

  /** Tamaño, centrado, luz y de frente. */
  private evaluar(det: DeteccionRostro, video: HTMLVideoElement): boolean {
    const { videoWidth: vw, videoHeight: vh, box } = det;
    const ratio = box.width / Math.min(vw, vh);
    const m = 0.02;
    const cortada = box.x < vw * m || box.y < vh * m || box.x + box.width > vw * (1 - m) || box.y + box.height > vh * (1 - m);
    const cx = (box.x + box.width / 2) / vw;
    const cy = (box.y + box.height / 2) / vh;
    const reacomoda = (texto: string) => { this.guia.set({ estado: 'reacomoda', texto }); return false; };
    if (cortada || ratio > this.RATIO_MAX) return reacomoda(cortada && ratio <= this.RATIO_MAX ? 'Centra tu rostro' : 'Aléjate un poco');
    if (ratio < this.RATIO_MIN || det.ipdPx < this.IPD_MINIMO) return reacomoda('Acércate un poco');
    if (Math.abs(cx - 0.5) > 0.2 || Math.abs(cy - 0.47) > 0.22) return reacomoda('Centra tu rostro');
    if (Math.abs(this.rostro.medirDx(det.puntos)) > 0.1) return reacomoda('Mira de frente a la cámara');
    if (this.rostro.luz(video, box) < this.LUZ_MINIMA) return reacomoda('Busca más luz de frente');
    this.guia.set({ estado: 'alineado', texto: 'Perfecto, no te muevas' });
    return true;
  }

  /** El óvalo rodea al rostro detectado; sin rostro, uno de guía al centro. El video se ve en espejo. */
  private moverOvalo(det: DeteccionRostro | null, vw: number, vh: number): void {
    if (!vw || !vh) return;
    if (!det) {
      const lado = Math.min(vw, vh) * this.RATIO_IDEAL;
      this.ovalo.set({ x: 50, y: 45, ancho: Math.round(lado * 1.25 / vw * 100), alto: Math.round(lado * 1.45 / vh * 100) });
      return;
    }
    const b = det.box;
    this.ovalo.set({
      x: Math.round((1 - (b.x + b.width / 2) / vw) * 1000) / 10,
      y: Math.round(((b.y + b.height / 2) / vh) * 1000) / 10,
      ancho: Math.round(Math.min(98, b.width * 1.25 / vw * 100)),
      alto: Math.round(Math.min(98, b.height * 1.45 / vh * 100))
    });
  }

  private async iniciarGrabacion(): Promise<void> {
    if (this.grabando()) return;
    this.grabando.set(true);          // antes de pedir el reto, para no arrancar dos veces
    this.aviso.set(null);
    let reto: RetoVida | null = null;
    try { reto = await this.pedirReto()(); } catch { reto = null; }
    if (!this.grabando()) return;
    if (!reto) { this.cancelar(); this.pausaHasta = Date.now() + 2000; return; }
    this.reto = reto;
    this.tReto = Date.now();
    this.t0 = performance.now();
    this.tUltimoDesc = 0;
    this.nDesc = 0;
    this.cuadros = [];
    this.medidas = [];
    this.paso = 0;
    this.esperaCentro = false;
    this.postura = null;
    this.lado.set(null);
    this.instruccion.set(this.textoReto(reto.pasos));
    this.giros.set(reto.pasos.map(lado => ({ lado, hecho: false })));
  }

  private textoReto(giros: ('IZQ' | 'DER')[]): string {
    const partes = giros.map((l, i) => {
      const s = l === 'IZQ' ? 'a tu izquierda' : 'a tu derecha';
      return i > 0 && giros[i - 1] === l ? `otra vez ${s}` : s;
    });
    return partes.length === 1 ? `Voltea ${partes[0]}` : `Voltea ${partes.slice(0, -1).join(', luego ')} y luego ${partes[partes.length - 1]}`;
  }

  private cancelar(): void {
    this.grabando.set(false);
    this.lado.set(null);
    this.instruccion.set('');
    this.giros.set([]);
    this.reto = null;
  }

  private async tickGrabacion(): Promise<void> {
    const reto = this.reto;
    if (!reto) return;
    // El reto vence en el servidor: si ya casi vence, se empieza de nuevo.
    if (Date.now() - this.tReto > (reto.segundosVigencia - 2) * 1000) { this.cancelar(); return; }

    const ahora = performance.now();
    const t = Math.round(ahora - this.t0);
    const conDesc = this.nDesc < this.maxTomas && ahora - this.tUltimoDesc >= this.msEntreTomas;
    const video = this.videoRef().nativeElement;
    const det = await this.rostro.detectar(video, conDesc, DETECTOR_GRABACION);
    if (!this.grabando()) return;

    let dx: number | null = null;
    if (det) {
      this.moverOvalo(det, det.videoWidth, det.videoHeight);
      this.presencia.emit();
      const c: CuadroRostro = { t, landmarks: det.puntos, score: det.score };
      if (det.descriptor) { c.descriptor = det.descriptor; this.nDesc++; this.tUltimoDesc = ahora; }
      this.cuadros.push(c);
      dx = this.rostro.medirDx(det.puntos);
      this.medidas.push({ t, dx });
    }
    this.avanzarGiros(t, dx);

    const listo = this.paso >= reto.pasos.length && this.nDesc >= this.minTomas() && t >= this.MS_MIN;
    const acabo = t >= this.MS_MAX || this.cuadros.length >= this.MAX_CUADROS;
    if (!listo && !acabo) return;

    if (this.cuadros.length < 8 || this.nDesc < this.minTomas()) {
      this.cancelar();
      this.aviso.set('No se pudo ver bien tu rostro. Intenta de nuevo.');
      this.pausaHasta = Date.now() + 1500;
      return;
    }
    // Se manda aunque aquí no se hayan visto todos los giros: decide el servidor.
    const foto = await this.rostro.foto(video);
    const captura: CapturaRostro = { idReto: reto.idReto, frames: this.cuadros, foto };
    this.cancelar();
    this.capturada.emit(captura);
  }

  /** Un giro a la vez; el siguiente se pide cuando la cabeza volvió al frente. */
  private avanzarGiros(t: number, dx: number | null): void {
    const pasos = this.reto?.pasos || [];
    if (this.paso >= pasos.length || this.medidas.length < 5 || t - this.medidas[0].t < this.MS_ANTES_DE_GIRAR) {
      this.lado.set(null);
      return;
    }
    if (this.postura === null) {
      let inicial = this.medidas.filter(m => m.t <= this.medidas[0].t + this.MS_POSTURA);
      if (inicial.length < 5) inicial = this.medidas.slice(0, 5);
      this.postura = this.rostro.mediana(inicial.map(m => m.dx));
    }
    if (dx === null) return;
    const ddx = dx - this.postura;
    if (this.esperaCentro) {
      this.esperaCentro = !this.rostro.estaAlCentro(ddx);
      this.lado.set(this.esperaCentro ? null : pasos[this.paso]);
      return;
    }
    this.lado.set(pasos[this.paso]);
    if (this.rostro.direccionGiro(ddx) === pasos[this.paso]) {
      this.giros.update(g => g.map((x, i) => (i === this.paso ? { ...x, hecho: true } : x)));
      this.paso++;
      this.esperaCentro = true;
      this.lado.set(null);
    }
  }
}
