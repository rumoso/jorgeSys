import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Usuarios con acceso a la empresa de la sesión (pass-through). */
@Injectable({ providedIn: 'root' })
export class UsuariosEmpresaService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/usuariosEmpresa`;

  getUsuariosEmpresa(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getUsuariosEmpresa`);
  }
  darAcceso(body: { correo: string; nombre?: string; password?: string; roles: number[]; bTodasSucursales: boolean; sucursales: number[] }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/darAcceso`, body);
  }
  updateUsuarioEmpresa(body: { idUsuario: number; roles: number[]; bTodasSucursales: boolean; sucursales: number[] }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/updateUsuarioEmpresa`, body);
  }
  getPermisosDirectos(idUsuario: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getPermisosDirectos`, { params: { idUsuario } });
  }
  setPermisosDirectos(idUsuario: number, menus: string[], acciones: string[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setPermisosDirectos`, { idUsuario, menus, acciones });
  }
  quitarAcceso(idUsuario: number): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/quitarAcceso`, { idUsuario });
  }
  restablecerPassword(idUsuario: number, password: string): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/restablecerPassword`, { idUsuario, password });
  }
}
