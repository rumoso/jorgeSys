import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Checador → Formas de checar: la política de la empresa (análisis 005). Pass-through. */
@Injectable({ providedIn: 'root' })
export class FormasChecadoService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/formasChecado`;

  getFormasSucursal(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getFormasSucursal`);
  }
  setFormaSucursal(idSucursal: number, forma: string, bActiva: boolean): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setFormaSucursal`, { idSucursal, forma, bActiva });
  }
  getFormasEmpleado(idEmpleado: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getFormasEmpleado`, { params: { idEmpleado } });
  }
  /** `bPermitida = null` quita la excepción: el empleado usa la regla de su sucursal. */
  setFormaEmpleado(idEmpleado: number, forma: string, bPermitida: boolean | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setFormaEmpleado`, { idEmpleado, forma, bPermitida });
  }
}
