import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { GrupoMenuSesion } from '../../models/permisos.models';

/**
 * Menú y permisos de la sesión (análisis 002). Es la excepción a los
 * servicios pass-through, igual que en AgroEnvases: guarda en memoria lo que
 * puede el usuario para pintar menús y botones. Solo es para la pantalla:
 * el servidor valida cada acción.
 */
@Injectable({ providedIn: 'root' })
export class GlobalService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/global`;
  private cargando: Promise<void> | null = null;

  readonly menu = signal<GrupoMenuSesion[]>([]);
  readonly acciones = signal<Set<string>>(new Set());
  readonly menus = signal<Set<string>>(new Set());
  readonly admin = signal(false);
  readonly cargado = signal(false);

  /** Accesos de la barra inferior del celular (máximo 3). */
  readonly inferior = computed(() => this.menu().filter(g => !g.bloqueado).flatMap(g => g.items).filter(i => i.inferior).slice(0, 3));

  /** Vuelve a leer menú y permisos del servidor. */
  cargar(): Promise<void> {
    this.cargando = (async () => {
      try {
        const [m, a] = await Promise.all([
          firstValueFrom(this.http.get<ApiResponse>(`${this.api}/getMenu`)),
          firstValueFrom(this.http.get<ApiResponse>(`${this.api}/getUserActions`))
        ]);
        if (m.status_code === 0) this.menu.set(m.data);
        if (a.status_code === 0) {
          this.acciones.set(new Set(a.data.acciones));
          this.menus.set(new Set(a.data.menus));
          this.admin.set(!!a.data.admin);
        }
        this.cargado.set(true);
      } catch { /* el interceptor manda al login con 401 */ }
    })();
    return this.cargando;
  }

  /** Para los guards: espera la carga en curso o la inicia. */
  asegurar(): Promise<void> {
    if (this.cargado()) return Promise.resolve();
    return this.cargando ?? this.cargar();
  }

  tienePermiso(accion: string): boolean { return this.acciones().has(accion); }
  tieneMenu(menu: string): boolean { return this.menus().has(menu); }

  limpiar(): void {
    this.menu.set([]);
    this.acciones.set(new Set());
    this.menus.set(new Set());
    this.admin.set(false);
    this.cargado.set(false);
    this.cargando = null;
  }
}
