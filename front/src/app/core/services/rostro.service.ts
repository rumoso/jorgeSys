import { Injectable } from '@angular/core';

/**
 * Rostro en el navegador (análisis 005, T31; portado de AgroEnvases 069).
 *
 * Aquí solo se DETECTA el rostro y se calcula su descriptor con
 * `@vladmandic/face-api`; los modelos los sirve el propio sitio
 * (/assets/models/face, copiados de node_modules al compilar). La imagen
 * nunca sale a un servicio externo. La COMPARACIÓN y la decisión de la
 * PRUEBA DE VIDA las hace el servidor con la secuencia completa: las medidas
 * de aquí (encuadre, luz, giros) solo guían a la persona en pantalla.
 *
 * face-api pesa varios MB: se carga con import() dinámico la primera vez que
 * se usa, nunca en el arranque del sistema.
 */

const MODEL_URL = '/assets/models/face';

// Puntos que se mandan al servidor (de los 68): ojos (36–47) y nariz (30).
// Mismo orden que espera back/helpers/faceVida.js.
const INDICES_PUNTOS = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 30];

// Mismos umbrales que el servidor, solo para palomear el giro en pantalla.
const GIRO_HORIZONTAL = 0.12;
const CENTRO_HORIZONTAL = 0.06;

/** Tamaño de entrada del detector: más grande al encuadrar (lejos), rápido al grabar. */
export const DETECTOR_ENCUADRE = 416;
export const DETECTOR_GRABACION = 224;

export interface DeteccionRostro {
  box: { x: number; y: number; width: number; height: number };
  videoWidth: number;
  videoHeight: number;
  puntos: number[][];
  ipdPx: number;
  score: number;
  descriptor?: number[];
}

export type ErrorCamara = 'SIN_PERMISO' | 'SIN_CAMARA' | 'NO_SEGURO' | 'NO_SOPORTADO' | 'OTRO';

@Injectable({ providedIn: 'root' })
export class RostroService {
  private faceapi: any = null;
  private cargando: Promise<void> | null = null;
  private lienzoLuz: HTMLCanvasElement | null = null;

  /** Carga face-api y los tres modelos (detector, puntos y descriptor). */
  cargarModelos(): Promise<void> {
    if (this.faceapi) return Promise.resolve();
    if (!this.cargando) {
      this.cargando = import('@vladmandic/face-api').then(async (mod: any) => {
        const api = mod.default?.nets ? mod.default : mod;
        await Promise.all([
          api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        this.faceapi = api;
      }).catch((e) => { this.cargando = null; throw e; });
    }
    return this.cargando;
  }

  /** La cámara solo funciona en https (o localhost). */
  camaraDisponible(): boolean {
    return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  }

  /** Estado del permiso de cámara sin pedirlo ('granted' | 'denied' | 'prompt' | null si no se sabe). */
  async permisoCamara(): Promise<PermissionState | null> {
    try {
      const p = await (navigator.permissions as any)?.query({ name: 'camera' });
      return p?.state ?? null;
    } catch { return null; }
  }

  async iniciarCamara(video: HTMLVideoElement, frente: 'user' | 'environment' = 'user'):
    Promise<{ ok: true; stream: MediaStream } | { ok: false; error: ErrorCamara; mensaje: string }> {
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, error: 'NO_SOPORTADO', mensaje: 'Este navegador no permite usar la cámara.' };
    if (!window.isSecureContext) return { ok: false, error: 'NO_SEGURO', mensaje: 'La cámara solo funciona con https.' };
    try {
      // 1280x720 ideal: con menos, la cara tiene muy pocos pixeles a una distancia cómoda.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: frente, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
      });
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      await video.play();
      return { ok: true, stream };
    } catch (e: any) {
      const n = e?.name || '';
      if (n === 'NotAllowedError' || n === 'SecurityError') return { ok: false, error: 'SIN_PERMISO', mensaje: 'No hay permiso para usar la cámara.' };
      if (n === 'NotFoundError' || n === 'OverconstrainedError') return { ok: false, error: 'SIN_CAMARA', mensaje: 'No se encontró una cámara en este equipo.' };
      return { ok: false, error: 'OTRO', mensaje: e?.message || 'No se pudo abrir la cámara.' };
    }
  }

  detenerCamara(stream: MediaStream | null | undefined): void {
    stream?.getTracks().forEach(t => t.stop());
  }

  /** Detecta un rostro con sus puntos y, si se pide, su descriptor (lo caro). */
  async detectar(video: HTMLVideoElement, conDescriptor: boolean, tamDetector = DETECTOR_ENCUADRE): Promise<DeteccionRostro | null> {
    if (!video.videoWidth || !this.faceapi) return null;
    const api = this.faceapi;
    const opciones = new api.TinyFaceDetectorOptions({ inputSize: tamDetector, scoreThreshold: 0.4 });
    const det: any = conDescriptor
      ? await api.detectSingleFace(video, opciones).withFaceLandmarks().withFaceDescriptor()
      : await api.detectSingleFace(video, opciones).withFaceLandmarks();
    if (!det) return null;
    const todos = det.landmarks.positions as { x: number; y: number }[];
    const puntos = INDICES_PUNTOS.map(i => [Math.round(todos[i].x * 10) / 10, Math.round(todos[i].y * 10) / 10]);
    const b = det.detection.box;
    return {
      box: { x: b.x, y: b.y, width: b.width, height: b.height },
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      puntos,
      ipdPx: this.ipd(puntos),
      score: Math.round((det.detection.score ?? 0) * 1000) / 1000,
      // 4 decimales: no cambia la comparación y la petición pesa menos.
      descriptor: conDescriptor ? Array.from(det.descriptor as Float32Array).map(n => Math.round(n * 10000) / 10000) : undefined
    };
  }

  /** Posición horizontal de la nariz respecto al centro de los ojos, en distancias-entre-ojos. */
  medirDx(puntos: number[][]): number {
    const a = this.centro(puntos.slice(0, 6));
    const b = this.centro(puntos.slice(6, 12));
    return (puntos[12][0] - (a[0] + b[0]) / 2) / this.dist(a, b);
  }

  /** Coordenadas sin espejo: voltear a la izquierda mueve la nariz a la derecha de la imagen. */
  direccionGiro(ddx: number): 'IZQ' | 'DER' | null {
    if (ddx >= GIRO_HORIZONTAL) return 'IZQ';
    if (ddx <= -GIRO_HORIZONTAL) return 'DER';
    return null;
  }

  estaAlCentro(ddx: number): boolean { return Math.abs(ddx) < CENTRO_HORIZONTAL; }

  mediana(arr: number[]): number {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Luz promedio (0–255) en la zona del rostro: solo para guiar ("busca más luz"). */
  luz(video: HTMLVideoElement, box: DeteccionRostro['box']): number {
    const c = this.lienzoLuz ??= document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 128;
    ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }

  /** Foto del momento (evidencia): cuadro centrado de 320 px en JPEG. */
  foto(video: HTMLVideoElement): Promise<Blob | null> {
    const c = document.createElement('canvas');
    const lado = 320;
    c.width = lado; c.height = lado;
    const ctx = c.getContext('2d');
    if (!ctx || !video.videoWidth) return Promise.resolve(null);
    const s = Math.min(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, lado, lado);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.8));
  }

  private dist(a: number[], b: number[]): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  private centro(o: number[][]): number[] { return [o.reduce((s, p) => s + p[0], 0) / o.length, o.reduce((s, p) => s + p[1], 0) / o.length]; }
  private ipd(p: number[][]): number { return this.dist(this.centro(p.slice(0, 6)), this.centro(p.slice(6, 12))); }
}
