import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

type Preferencias = Record<string, Record<string, unknown>>;

/**
 * Preferencias del usuario (003a): se guardan en el servidor, por usuario y
 * por empresa, y siguen a la persona a cualquier equipo. Como `GlobalService`,
 * es una excepción a los servicios pass-through: guarda en memoria lo que
 * escogió para no preguntarlo en cada pantalla.
 *
 * Guardar es optimista: la pantalla cambia al instante y el servidor se
 * actualiza detrás. Si falla, la preferencia vale en esta sesión y se pierde
 * al recargar; no vale la pena interrumpir a nadie por eso.
 */
@Injectable({ providedIn: 'root' })
export class PreferenciasService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/global`;

  readonly valores = signal<Preferencias>({});
  readonly cargadas = signal(false);
  /**
   * Sesión de soporte (009): no hay usuario, así que no hay preferencias en el
   * servidor (responden NO_APLICA_SOPORTE). Lo que se escoja vale solo en
   * memoria mientras dura la sesión. Lo pone AuthService.
   */
  readonly soloLocal = signal(false);

  async cargar(): Promise<Preferencias> {
    if (this.soloLocal()) { this.cargadas.set(true); return this.valores(); }
    try {
      const r = await firstValueFrom(this.http.get<ApiResponse<Preferencias>>(`${this.api}/getPreferencias`));
      if (r.status_code === 0) this.valores.set(r.data || {});
    } catch { /* el interceptor manda al login con 401 */ }
    this.cargadas.set(true);
    return this.valores();
  }

  get<T>(ambito: string, clave: string): T | undefined {
    return this.valores()[ambito]?.[clave] as T | undefined;
  }

  /** `valor` null o undefined la borra. */
  guardar(ambito: string, clave: string, valor: unknown): void {
    this.valores.update(v => {
      const copia: Preferencias = { ...v, [ambito]: { ...(v[ambito] || {}) } };
      if (valor === null || valor === undefined) delete copia[ambito][clave];
      else copia[ambito][clave] = valor;
      return copia;
    });
    if (this.soloLocal()) return;
    this.http.post<ApiResponse>(`${this.api}/setPreferencia`, { ambito, clave, valor: valor ?? null })
      .subscribe({ error: () => { /* optimista: ver arriba */ } });
  }

  limpiar(): void {
    this.valores.set({});
    this.cargadas.set(false);
  }
}
