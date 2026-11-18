import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Roles y permisos de la empresa de la sesión (pass-through). */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/roles`;

  getRoles(estado: 'activos' | 'todos' = 'activos'): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getRoles`, { params: { estado } });
  }
  getCatalogoPermisos(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getCatalogoPermisos`);
  }
  getPermisosRol(idRol: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getPermisosRol`, { params: { idRol } });
  }
  getMenuDeRol(idRol: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getMenuDeRol`, { params: { idRol } });
  }
  getBitacoraPermisos(filtro: { idRol?: number; idUsuario?: number } = {}): Observable<ApiResponse> {
    const params: Record<string, number> = {};
    if (filtro.idRol) params['idRol'] = filtro.idRol;
    if (filtro.idUsuario) params['idUsuario'] = filtro.idUsuario;
    return this.http.get<ApiResponse>(`${this.api}/getBitacoraPermisos`, { params });
  }
  insertUpdateRol(body: { idRol?: number | null; nombre: string; descripcion?: string | null; copiarDe?: number | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertUpdateRol`, body);
  }
  disableRol(idRol: number, bActivo: boolean): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/disableRol`, { idRol, bActivo });
  }
  setPermisosRol(idRol: number, menus: string[], acciones: string[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setPermisosRol`, { idRol, menus, acciones });
  }
}
