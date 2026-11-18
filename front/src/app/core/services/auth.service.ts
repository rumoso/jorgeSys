import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { GlobalService } from './global.service';
import { PreferenciasService } from './preferencias.service';
import { ThemeService } from './theme.service';

export interface UsuarioSesion { idUsuario: number; nombre: string; correo: string; }
export interface EmpresaSesion { idEmpresa: number; nombre: string; }
export interface SucursalSesion { idSucursal: number; nombre: string; zonaHoraria: string; }
/** Sesión de soporte (009): el superadministrador dentro de la empresa. `vence` en ISO. */
export interface SoporteSesion { idSesionSoporte: number; empresa: string; vence: string; superadmin: string; motivo: string; }
export interface Sesion {
  usuario: UsuarioSesion;
  empresa: EmpresaSesion;
  empresas: EmpresaSesion[];
  todasSucursales: boolean;
  sucursales: SucursalSesion[];
  soporte?: SoporteSesion | null;
}
export interface Seleccion { tokenSeleccion: string; usuario: UsuarioSesion; empresas: EmpresaSesion[]; }
/** Lo que regresa panel/soporte/entrarEmpresa. */
export interface EntradaSoporte {
  token: string; idSesionSoporte: number; vence: string; minutos: number;
  empresa: { idEmpresa: number; nombre: string; estado: string };
}

const K_TOKEN = 'rh_token';
const K_SESION = 'rh_sesion';
// 009: la sesión de soporte vive en sessionStorage (solo esta pestaña) y,
// mientras existe, tiene prioridad sobre la sesión normal de localStorage,
// que no se toca: al salir de soporte la pestaña vuelve a la normal.
const K_SOPORTE_TOKEN = 'rh_soporte_token';
const K_SOPORTE_SESION = 'rh_soporte_sesion';
/** Aviso que el panel muestra al regresar de una sesión de soporte. */
export const K_AVISO_PANEL = 'rh_panel_aviso';

/**
 * Sesión (análisis 001). El token viaja en `x-token` y trae la empresa: el
 * servidor nunca la toma del navegador (LP-1). Lo que se guarda aquí de la
 * sesión es solo para pintar; el servidor la vuelve a validar en cada
 * petición.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly global = inject(GlobalService);
  private readonly prefs = inject(PreferenciasService);
  private readonly theme = inject(ThemeService);
  private readonly api = `${environment.apiUrl}/auth`;

  /** 009: esta pestaña trae una sesión de soporte (tiene prioridad sobre la normal). */
  readonly modoSoporte = signal(!!this._leerSoporte(K_SOPORTE_TOKEN));
  readonly token = signal<string | null>(this.modoSoporte() ? this._leerSoporte(K_SOPORTE_TOKEN) : this._leer(K_TOKEN));
  readonly sesion = signal<Sesion | null>(this.modoSoporte() ? this._jsonSoporte(K_SOPORTE_SESION) : this._json(K_SESION));
  /** Datos de la sesión de soporte (empresa, vence…), o null en una sesión normal. */
  readonly soporte = computed(() => (this.modoSoporte() ? this.sesion()?.soporte ?? null : null));
  private saliendoDeSoporte = false;

  readonly autenticado = computed(() => !!this.token());
  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly empresa = computed(() => this.sesion()?.empresa ?? null);
  readonly empresas = computed(() => this.sesion()?.empresas ?? []);
  readonly sucursales = computed(() => this.sesion()?.sucursales ?? []);

  /** Sucursal escogida en la barra superior (null = todas las mías). Por empresa. */
  readonly sucursalActiva = signal<number | null>(null);

  /**
   * Zona para lo que se muestra "de hoy" sin una sucursal propia: la de la
   * sucursal escogida o, con todas, la de la primera (análisis 003 §5).
   * `mixtas` dice si mis sucursales están en zonas distintas.
   */
  readonly zonaActiva = computed(() => {
    const lista = this.sucursales();
    const activa = lista.find(s => s.idSucursal === this.sucursalActiva()) ?? lista[0];
    return {
      zona: activa?.zonaHoraria ?? 'America/Mexico_City',
      mixtas: !this.sucursalActiva() && new Set(lista.map(s => s.zonaHoraria)).size > 1
    };
  });

  constructor() {
    this.prefs.soloLocal.set(this.modoSoporte());
    this._cargarSucursalActiva();
  }

  /** Paso 1: correo y contraseña. Con varias empresas regresa la selección. */
  async login(correo: string, password: string): Promise<{ ok: boolean; texto: string; seleccion?: Seleccion }> {
    try {
      const r = await firstValueFrom(this.http.post<ApiResponse>(`${this.api}/login`, { correo, password }));
      if (r.status_code !== 0) return { ok: false, texto: r.message };
      if (r.data.seleccion) return { ok: true, texto: r.message, seleccion: r.data };
      this._guardar(r.data);
      return { ok: true, texto: r.message };
    } catch (e: any) {
      if (e?.status === 429) return { ok: false, texto: e.error?.message || 'Demasiados intentos fallidos. Espera unos minutos.' };
      return { ok: false, texto: 'No fue posible comunicarse con el servidor.' };
    }
  }

  /**
   * Paso 2 del login (con el token de selección) o cambio de empresa (con el
   * token de sesión actual). Si se rechaza, regresa la lista vigente.
   */
  async seleccionarEmpresa(idEmpresa: number, tokenSeleccion?: string): Promise<{ ok: boolean; texto: string; empresas?: EmpresaSesion[] }> {
    try {
      const headers = tokenSeleccion ? { 'x-token': tokenSeleccion } : undefined;
      const r = await firstValueFrom(this.http.post<ApiResponse>(`${this.api}/seleccionarEmpresa`, { idEmpresa }, { headers }));
      if (r.status_code !== 0) return { ok: false, texto: r.message, empresas: r.data?.empresas };
      this._guardar(r.data);
      return { ok: true, texto: r.message };
    } catch (e: any) {
      if (e?.status === 401) return { ok: false, texto: 'La selección venció. Vuelve a escribir tu contraseña.' };
      if (e?.status === 429) return { ok: false, texto: e.error?.message };
      return { ok: false, texto: 'No fue posible comunicarse con el servidor.' };
    }
  }

  /**
   * Cambiar de empresa desde la barra superior. Con éxito hace una recarga
   * completa: así no queda en pantalla nada de la empresa anterior.
   */
  async cambiarEmpresa(idEmpresa: number): Promise<{ ok: boolean; texto: string }> {
    const r = await this.seleccionarEmpresa(idEmpresa);
    if (r.ok) window.location.assign('/app/hoy');
    else await this.refrescarSesion();
    return r;
  }

  /**
   * Vuelve a leer la sesión del servidor (empresas, sucursales), el menú con
   * los permisos y las preferencias del usuario (apariencia, sucursal).
   */
  async refrescarSesion(): Promise<void> {
    if (!this.token()) return;
    try {
      const [r] = await Promise.all([
        firstValueFrom(this.http.get<ApiResponse<Sesion>>(`${this.api}/getSesion`)),
        this.global.cargar(),
        this.prefs.cargar()
      ]);
      this.theme.desdePreferencias();
      if (r.status_code === 0) this._guardarSesion(r.data);
    } catch { /* el interceptor ya manda al login con 401 */ }
  }

  /** Token nuevo que regresa el servidor al cambiar la contraseña o el propio acceso. */
  setToken(token: string): void {
    this.token.set(token);
    if (this.modoSoporte()) { try { sessionStorage.setItem(K_SOPORTE_TOKEN, token); } catch { /* sin storage */ } return; }
    try { localStorage.setItem(K_TOKEN, token); } catch { /* sin storage */ }
  }

  /** Sucursal de la barra superior: preferencia del usuario (003a), con copia local para pintar rápido. */
  escogerSucursal(idSucursal: number | null): void {
    this.sucursalActiva.set(idSucursal);
    this.prefs.guardar('sesion', 'sucursal', idSucursal);
    // En soporte solo vale en memoria: no se pisa la copia del usuario de esta empresa.
    if (this.modoSoporte()) return;
    const e = this.empresa()?.idEmpresa;
    try {
      if (idSucursal === null) localStorage.removeItem(`rh_sucursal_${e}`);
      else localStorage.setItem(`rh_sucursal_${e}`, String(idSucursal));
    } catch { /* sin storage */ }
  }

  /**
   * 009: "Entrar a la empresa" desde el panel. La sesión de soporte se guarda
   * aparte (sessionStorage de esta pestaña) sin tocar la sesión normal de la
   * empresa ni la del panel, y la app se abre con una recarga completa para
   * no arrastrar nada de otra sesión.
   */
  iniciarSoporte(d: EntradaSoporte): void {
    const sesion: Sesion = {
      usuario: { idUsuario: 0, nombre: 'Soporte', correo: '' },
      empresa: { idEmpresa: d.empresa.idEmpresa, nombre: d.empresa.nombre },
      empresas: [], todasSucursales: true, sucursales: [],
      soporte: { idSesionSoporte: d.idSesionSoporte, empresa: d.empresa.nombre, vence: d.vence, superadmin: '', motivo: '' }
    };
    try {
      sessionStorage.setItem(K_SOPORTE_TOKEN, d.token);
      sessionStorage.setItem(K_SOPORTE_SESION, JSON.stringify(sesion));
    } catch { /* sin storage: no hay forma de abrir la sesión */ return; }
    window.location.assign('/app/hoy');
  }

  /**
   * 009: termina la sesión de soporte en esta pestaña (Salir, vencida o
   * cerrada en el servidor) y regresa al panel, a la ficha de la empresa. La
   * sesión normal de la empresa, si había, vuelve a ser la de esta pestaña.
   * Cerrarla en el servidor (salirEmpresa) le toca a quien llama.
   */
  terminarSoporte(aviso?: string): void {
    if (this.saliendoDeSoporte) return;
    this.saliendoDeSoporte = true;
    const idEmpresa = this.empresa()?.idEmpresa;
    try {
      sessionStorage.removeItem(K_SOPORTE_TOKEN);
      sessionStorage.removeItem(K_SOPORTE_SESION);
      if (aviso) sessionStorage.setItem(K_AVISO_PANEL, aviso);
    } catch { /* */ }
    this.global.limpiar();
    this.prefs.limpiar();
    window.location.assign(idEmpresa ? `/panel/empresas/${idEmpresa}` : '/panel/empresas');
  }

  logout(): void {
    if (this.modoSoporte()) { this.terminarSoporte(); return; }
    for (const k of [K_TOKEN, K_SESION, 'rh_usuario', 'rh_empresa', 'rh_empresas']) {
      try { localStorage.removeItem(k); } catch { /* */ }
    }
    this.token.set(null);
    this.sesion.set(null);
    this.global.limpiar();
    this.prefs.limpiar();
    this.sucursalActiva.set(null);
    this.router.navigate(['/auth/login']);
  }

  private _guardar(d: Sesion & { token: string }): void {
    const { token, ...sesion } = d;
    this.setToken(token);
    this._guardarSesion(sesion);
    // Sesión nueva (login o cambio de empresa): los permisos y las
    // preferencias son otros.
    this.global.limpiar();
    this.prefs.limpiar();
  }

  private _guardarSesion(s: Sesion): void {
    this.sesion.set(s);
    try {
      if (this.modoSoporte()) sessionStorage.setItem(K_SOPORTE_SESION, JSON.stringify(s));
      else localStorage.setItem(K_SESION, JSON.stringify(s));
    } catch { /* sin storage */ }
    this._cargarSucursalActiva();
  }

  /** La sucursal guardada solo vale si sigue entre las permitidas. Manda la del servidor. */
  private _cargarSucursalActiva(): void {
    const e = this.empresa()?.idEmpresa;
    const delServidor = this.prefs.cargadas() ? this.prefs.get<number | null>('sesion', 'sucursal') : undefined;
    const local = this.modoSoporte() ? null : this._leer(`rh_sucursal_${e}`);
    const guardada = (delServidor !== undefined ? Number(delServidor) : Number(local)) || null;
    this.sucursalActiva.set(guardada && this.sucursales().some(s => s.idSucursal === guardada) ? guardada : null);
  }

  private _leer(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
  private _json<T>(k: string): T | null { try { return JSON.parse(this._leer(k) || 'null'); } catch { return null; } }
  private _leerSoporte(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } }
  private _jsonSoporte<T>(k: string): T | null { try { return JSON.parse(this._leerSoporte(k) || 'null'); } catch { return null; } }
}
