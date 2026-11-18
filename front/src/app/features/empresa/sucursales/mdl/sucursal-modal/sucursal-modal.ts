import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { debounceTime, firstValueFrom } from 'rxjs';

import { ConfiguracionService, GlobalService, SucursalesService } from '../../../../../core/services';
import { AjusteSucursal, ValorAjuste } from '../../../../../models/configuracion.models';
import { CampoDinamico, errorAjuste, textoAjuste } from '../../../../../shared/components/campo-dinamico/campo-dinamico';
import {
  Coordenadas, esEnlaceCorto, leerCoordenadas, textoCoordenadas, urlAbrir, urlBuscar, urlFrame
} from '../../../../../shared/utils/ubicacion';

export interface ZonaHoraria { zona: string; nombre: string; }
export interface Sucursal {
  idSucursal: number; nombre: string; direccion: string | null; latitud: number | null; longitud: number | null;
  zonaHoraria: string; zonaNombre: string; bActivo: number;
}
export interface SucursalModalData { sucursal: Sucursal | null; zonas: ZonaHoraria[]; }

/** Un ajuste que admite excepción, como se edita en el modal. */
interface ExcepcionEditable { def: AjusteSucursal; propio: boolean; valor: ValorAjuste; }

const ZONA_DEFAULT = 'America/Mexico_City';
/** Precisión (metros) a partir de la cual se avisa que el punto puede estar lejos. */
const PRECISION_AVISO = 100;
const mismoPunto = (a: Coordenadas | null, b: Coordenadas | null) => a?.latitud === b?.latitud && a?.longitud === b?.longitud;

/**
 * Alta y edición de una sucursal. No se cierra al guardar (convención de
 * modales CRUD). Al editar muestra la sección "Configuración": los ajustes de
 * la empresa que admiten un valor propio en esta sucursal (análisis 003), y
 * la sección "Ubicación (opcional)" con el mapa de Google (análisis 015).
 */
@Component({
  selector: 'app-sucursal-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, CampoDinamico],
  templateUrl: './sucursal-modal.html'
})
export class SucursalModal {
  private readonly api = inject(SucursalesService);
  private readonly configApi = inject(ConfiguracionService);
  private readonly ref = inject(MatDialogRef<SucursalModal, boolean>);
  readonly data = inject<SucursalModalData>(MAT_DIALOG_DATA);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly global = inject(GlobalService);
  /** Sin el permiso, el modal abre de solo lectura y sin Guardar. */
  readonly puedeGuardar = this.global.tienePermiso('sucursales_CreateUpdate');
  /** Las excepciones de configuración tienen su propio permiso. */
  readonly puedeExcepciones = this.global.tienePermiso('configuracion_Editar');

  readonly idSucursal = signal<number | null>(this.data.sucursal?.idSucursal ?? null);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly excepciones = signal<ExcepcionEditable[]>([]);
  readonly texto = textoAjuste;
  private zonaGuardada = this.data.sucursal?.zonaHoraria ?? null;
  private cambios = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: [this.data.sucursal?.nombre ?? '', [Validators.required, Validators.maxLength(100)]],
    direccion: [this.data.sucursal?.direccion ?? '', [Validators.maxLength(250)]],
    ubicacion: [textoCoordenadas(this.ubicacionInicial())],
    zonaHoraria: [this.data.sucursal?.zonaHoraria ?? ZONA_DEFAULT, [Validators.required]]
  });

  readonly excepcionesCambiadas = computed(() => this.excepciones().filter(e => this.cambio(e) !== undefined));
  // ── Ubicación (análisis 015) ──
  private readonly textoUbicacion = toSignal(this.form.controls.ubicacion.valueChanges, { initialValue: this.form.controls.ubicacion.value });
  private readonly direccion = toSignal(this.form.controls.direccion.valueChanges, { initialValue: this.form.controls.direccion.value });
  readonly hayDireccion = computed(() => !!this.direccion().trim());
  readonly hayUbicacion = computed(() => !!this.textoUbicacion().trim());
  /** Coordenadas válidas del campo, o null. */
  readonly coordenadas = computed(() => leerCoordenadas(this.textoUbicacion()));
  readonly errorUbicacion = computed(() => {
    const t = this.textoUbicacion().trim();
    if (!t || this.coordenadas()) return null;
    if (esEnlaceCorto(t)) {
      return 'Ese enlace corto no trae las coordenadas. En Google Maps toca el punto, copia los números que aparecen (19.4326, -99.1332) y pégalos aquí.';
    }
    return 'Escribe las coordenadas como 19.4326, -99.1332 o pega un enlace de Google Maps que las traiga (latitud entre -90 y 90, longitud entre -180 y 180).';
  });
  /** El punto del mapa: espera a que se deje de escribir para no recargar el frame en cada tecla. */
  readonly punto = toSignal(toObservable(this.coordenadas).pipe(debounceTime(600)),
    { initialValue: this.coordenadas(), equal: mismoPunto });
  /** Solo con números ya validados por leerCoordenadas. */
  readonly urlMapa = computed(() => {
    const p = this.punto();
    return p ? this.sanitizer.bypassSecurityTrustResourceUrl(urlFrame(p.latitud, p.longitud)) : null;
  });
  readonly urlAbrirMapa = computed(() => { const p = this.punto(); return p ? urlAbrir(p.latitud, p.longitud) : null; });
  readonly localizando = signal(false);
  /** Aviso de "Usar mi ubicación actual": precisión, permiso negado o sin soporte. */
  readonly avisoUbicacion = signal<string | null>(null);

  readonly mostrarGuardar = computed(() => this.puedeGuardar || (!!this.idSucursal() && this.puedeExcepciones && this.excepciones().length > 0));

  constructor() {
    if (!this.puedeGuardar) this.form.disable();
    // Un enlace pegado se convierte en "lat, lng".
    this.form.controls.ubicacion.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(v => {
      const c = /[a-z]/i.test(v) ? leerCoordenadas(v) : null;
      if (c) this.form.controls.ubicacion.setValue(textoCoordenadas(c));
    });
    if (this.idSucursal()) this.cargarExcepciones();
  }

  private cargarExcepciones(): void {
    this.configApi.getConfiguracionSucursal(this.idSucursal()!).subscribe(r => {
      if (r.status_code !== 0) return;
      this.excepciones.set((r.data.ajustes as AjusteSucursal[]).map(def => ({
        def, propio: def.bPropio, valor: def.bPropio ? def.valorPropio : def.valorGeneral
      })));
    });
  }

  usarPropio(e: ExcepcionEditable, propio: boolean): void {
    this.excepciones.update(l => l.map(x => x === e ? { ...x, propio, valor: propio ? x.valor : x.def.valorGeneral } : x));
  }
  cambiarValor(e: ExcepcionEditable, valor: ValorAjuste): void {
    this.excepciones.update(l => l.map(x => x === e ? { ...x, valor } : x));
  }
  error(e: ExcepcionEditable): string | null { return e.propio ? errorAjuste(e.def, e.valor) : null; }

  /** Lo que hay que mandar: `undefined` si no cambió, `null` para quitar la excepción. */
  private cambio(e: ExcepcionEditable): ValorAjuste | undefined {
    if (!e.propio) return e.def.bPropio ? null : undefined;
    return e.def.bPropio && String(e.valor) === String(e.def.valorPropio) ? undefined : e.valor;
  }

  private ubicacionInicial(): Coordenadas | null {
    const s = this.data.sucursal;
    return s && s.latitud !== null && s.longitud !== null ? { latitud: s.latitud, longitud: s.longitud } : null;
  }

  usarUbicacionActual(): void {
    const sinUbicacion = 'Puedes pegar las coordenadas a mano: en Google Maps toca el punto y copia los números que aparecen.';
    if (!navigator.geolocation) {
      this.avisoUbicacion.set(`Este navegador no da la ubicación. ${sinUbicacion}`);
      return;
    }
    this.localizando.set(true);
    this.avisoUbicacion.set(null);
    navigator.geolocation.getCurrentPosition(pos => {
      this.localizando.set(false);
      const c = leerCoordenadas(`${pos.coords.latitude}, ${pos.coords.longitude}`);
      if (!c) { this.avisoUbicacion.set(`No fue posible leer tu ubicación. ${sinUbicacion}`); return; }
      this.form.controls.ubicacion.setValue(textoCoordenadas(c));
      const metros = Math.round(pos.coords.accuracy);
      if (metros > PRECISION_AVISO) {
        this.avisoUbicacion.set(`La precisión es de unos ${metros} m: revisa el punto en el mapa y corrígelo si hace falta.`);
      }
    }, err => {
      this.localizando.set(false);
      this.avisoUbicacion.set(err.code === err.PERMISSION_DENIED
        ? `No se dio permiso para usar tu ubicación. ${sinUbicacion}`
        : `No fue posible obtener tu ubicación. ${sinUbicacion}`);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  buscarEnMapa(): void {
    if (this.hayDireccion()) window.open(urlBuscar(this.direccion()), '_blank', 'noopener');
  }

  quitarUbicacion(): void {
    this.form.controls.ubicacion.setValue('');
    this.avisoUbicacion.set(null);
  }

  async guardar(): Promise<void> {
    if (this.guardando() || !this.mostrarGuardar()) return;
    if (this.puedeGuardar && this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ ok: false, texto: 'Escribe el nombre y escoge la zona horaria.' });
      return;
    }
    if (this.puedeGuardar && this.errorUbicacion()) {
      this.banner.set({ ok: false, texto: `Ubicación: ${this.errorUbicacion()}` });
      return;
    }
    const conError = this.excepciones().find(e => this.error(e));
    if (conError) {
      this.banner.set({ ok: false, texto: `${conError.def.etiqueta}: ${this.error(conError)}` });
      return;
    }

    this.guardando.set(true);
    try {
      const mensajes: string[] = [];
      if (this.puedeGuardar) {
        const r = await this.guardarSucursal();
        if (!r) return;
        mensajes.push(r);
      }
      for (const e of this.excepcionesCambiadas()) {
        const r = await firstValueFrom(this.configApi.setExcepcionSucursal(this.idSucursal()!, e.def.clave, this.cambio(e)!));
        if (r.status_code !== 0) { this.banner.set({ ok: false, texto: `${e.def.etiqueta}: ${r.message}` }); return; }
        this.cambios = true;
        mensajes.push(`${e.def.etiqueta}: ${e.propio ? 'valor propio guardado' : 'usa el de la empresa'}`);
      }
      if (this.excepciones().length) this.cargarExcepciones();
      this.banner.set({ ok: true, texto: mensajes.join(' · ') || 'No hubo cambios' });
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Guarda los datos de la sucursal. Si cambia la zona horaria, el servidor
   * pide confirmación (CONFIRMAR_ZONA) con la explicación del efecto: se
   * muestra y, si se acepta, se reenvía confirmada. Regresa el mensaje o null.
   */
  private async guardarSucursal(): Promise<string | null> {
    const v = this.form.getRawValue();
    const c = leerCoordenadas(v.ubicacion);
    const body = {
      idSucursal: this.idSucursal(), nombre: v.nombre.trim(), direccion: v.direccion.trim() || null,
      latitud: c?.latitud ?? null, longitud: c?.longitud ?? null, zonaHoraria: v.zonaHoraria
    };
    let r = await firstValueFrom(this.api.insertUpdateSucursal(body));
    if (r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_ZONA') {
      if (!confirm(`${r.message}\n\n¿Cambiar la zona horaria?`)) {
        this.banner.set({ ok: false, texto: 'No se guardó: la zona horaria no cambió.' });
        return null;
      }
      r = await firstValueFrom(this.api.insertUpdateSucursal({ ...body, confirmarZona: true }));
    }
    if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return null; }
    this.cambios = true;
    this.zonaGuardada = v.zonaHoraria;
    if (!this.idSucursal()) { this.idSucursal.set(r.data.id); this.cargarExcepciones(); }
    return r.message;
  }

  /** Aviso en el formulario mientras la zona escogida no es la guardada. */
  zonaCambiada(): boolean { return !!this.zonaGuardada && this.form.controls.zonaHoraria.value !== this.zonaGuardada; }

  cerrar(): void { this.ref.close(this.cambios); }
}
