import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Checador → Dispositivos (análisis 005), con sesión. Pass-through. */
@Injectable({ providedIn: 'root' })
export class DispositivosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/dispositivos`;

  getDispositivos(idSucursal: number | null = null): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getDispositivos`, { params: idSucursal ? { idSucursal } : {} });
  }
  getEstadoVinculacion(idDispositivo: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getEstadoVinculacion`, { params: { idDispositivo } });
  }
  insertDispositivo(idSucursal: number, nombre: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertDispositivo`, { idSucursal, nombre });
  }
  regenerarCodigo(idDispositivo: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/regenerarCodigo`, { idDispositivo });
  }
  deleteDispositivoPendiente(idDispositivo: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.api}/deleteDispositivoPendiente`, { body: { idDispositivo } });
  }
  revocarDispositivo(idDispositivo: number): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/revocarDispositivo`, { idDispositivo });
  }
}
