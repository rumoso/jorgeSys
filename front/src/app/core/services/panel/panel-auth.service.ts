import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';
import { Superadmin } from '../../../models/panel.models';

const K_TOKEN = 'rh_panel_token';
const K_SUPERADMIN = 'rh_panel_superadmin';
const ZONA_DEFAULT = 'America/Mexico_City';

/**
 * Sesión del panel del superadministrador (009). Su token vive aparte del de
 * la empresa (otra llave) y viaja solo a `/api/panel` en `x-token-panel`
 * (auth.interceptor). Como AuthService, guarda la sesión: no es pass-through.
 */
@Injectable({ providedIn: 'root' })
export class PanelAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = `${environment.apiUrl}/panel/auth`;

  readonly token = signal<string | null>(this._leer(K_TOKEN));
  readonly superadmin = signal<Superadmin | null>(this._json(K_SUPERADMIN));
  readonly autenticado = computed(() => !!this.token());
  /** Zona del producto (`producto.zona_horaria`) para las fechas del panel; la carga el marco del panel. */
  readonly zona = signal(ZONA_DEFAULT);

  /** Paso 1: correo y contraseña → token de 5 minutos para mandar el código. */
  async login(correo: string, password: string): Promise<{ ok: boolean; texto: string; token2fa?: string }> {
    try {
      const r = await firstValueFrom(this.http.post<ApiResponse>(`${this.api}/login`, { correo, password }));
      if (r.status_code !== 0) return { ok: false, texto: r.message };
      return { ok: true, texto: r.message, token2fa: r.data.token2fa };
    } catch (e: any) {
      if (e?.status === 429) return { ok: false, texto: e.error?.message || 'Demasiados intentos fallidos. Espera unos minutos.' };
      return { ok: false, texto: 'No fue posible comunicarse con el servidor.' };
    }
  }

  /** Paso 2: el código de 6 dígitos, con el token del paso 1 en `x-token-panel`. */
  async verificar(codigo: string, token2fa: string): Promise<{ ok: boolean; texto: string; vencido?: boolean }> {
    try {
      const r = await firstValueFrom(this.http.post<ApiResponse>(`${this.api}/verificar2fa`, { codigo },
        { headers: { 'x-token-panel': token2fa } }));
      if (r.status_code !== 0) return { ok: false, texto: r.message };
      this.token.set(r.data.token);
      this.superadmin.set(r.data.superadmin);
      try {
        localStorage.setItem(K_TOKEN, r.data.token);
        localStorage.setItem(K_SUPERADMIN, JSON.stringify(r.data.superadmin));
      } catch { /* sin storage */ }
      return { ok: true, texto: r.message };
    } catch (e: any) {
      if (e?.status === 401) return { ok: false, vencido: true, texto: e.error?.message || 'El tiempo para escribir el código terminó. Vuelve a entrar.' };
      if (e?.status === 429) return { ok: false, texto: e.error?.message || 'Demasiados intentos fallidos. Espera unos minutos.' };
      return { ok: false, texto: 'No fue posible comunicarse con el servidor.' };
    }
  }

  /** Confirma la sesión con el servidor (un 401 lo atiende el interceptor). */
  async refrescar(): Promise<void> {
    if (!this.token()) return;
    try {
      const r = await firstValueFrom(this.http.get<ApiResponse>(`${this.api}/getSesion`));
      if (r.status_code === 0) {
        this.superadmin.set(r.data.superadmin);
        try { localStorage.setItem(K_SUPERADMIN, JSON.stringify(r.data.superadmin)); } catch { /* */ }
      }
    } catch { /* */ }
  }

  /** Termina la sesión del panel (no toca la de la empresa). */
  cerrar(navegar = true): void {
    for (const k of [K_TOKEN, K_SUPERADMIN]) { try { localStorage.removeItem(k); } catch { /* */ } }
    this.token.set(null);
    this.superadmin.set(null);
    if (navegar) this.router.navigate(['/panel/entrar']);
  }

  private _leer(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
  private _json<T>(k: string): T | null { try { return JSON.parse(this._leer(k) || 'null'); } catch { return null; } }
}
