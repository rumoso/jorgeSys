import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/**
 * Checador → Por revisar (análisis 005). Pass-through. La foto llega como
 * Blob; si el servidor contesta un error, el Blob es el JSON
 * { status_code, message } (tipo application/json).
 */
@Injectable({ providedIn: 'root' })
export class MarcajesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/marcajes`;

  getPorRevisar(estado: 'pendientes' | 'revisados', idSucursal: number | null): Observable<ApiResponse> {
    const params: Record<string, string | number> = { estado };
    if (idSucursal) params['idSucursal'] = idSucursal;
    return this.http.get<ApiResponse>(`${this.api}/getPorRevisar`, { params });
  }
  getContadorPorRevisar(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getContadorPorRevisar`);
  }
  getFotoEvidencia(idMarcaje: number): Observable<Blob> {
    return this.http.get(`${this.api}/getFotoEvidencia`, { params: { idMarcaje }, responseType: 'blob' });
  }
  aprobarMarcaje(idMarcaje: number, motivo: string | null = null): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/aprobarMarcaje`, { idMarcaje, motivo });
  }
  rechazarMarcaje(idMarcaje: number, motivo: string): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/rechazarMarcaje`, { idMarcaje, motivo });
  }
}
