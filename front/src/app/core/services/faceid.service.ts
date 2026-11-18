import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { CuadroRostro } from '../../models/checador.models';

/** Face ID: consentimiento y registro del rostro (análisis 005). Pass-through. */
@Injectable({ providedIn: 'root' })
export class FaceIdService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/faceid`;

  getConsentimientoTexto(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getConsentimientoTexto`);
  }
  insertConsentimientoTexto(texto: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertConsentimientoTexto`, { texto });
  }
  getRostroEmpleado(idEmpleado: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getRostroEmpleado`, { params: { idEmpleado } });
  }
  aceptarConsentimiento(body: { idEmpleado: number; version: number; medio: 'PAPEL_FIRMADO' | 'EN_PANTALLA'; nota?: string | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/aceptarConsentimiento`, body);
  }
  retirarConsentimiento(idEmpleado: number, motivo: string | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/retirarConsentimiento`, { idEmpleado, motivo });
  }
  getRetoRegistro(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getRetoRegistro`);
  }
  registrarRostro(idEmpleado: number, idReto: string, frames: CuadroRostro[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/registrarRostro`, { idEmpleado, idReto, frames });
  }
  /** Tras el aviso de parecido: guarda la captura ya validada. */
  confirmarRostro(idEmpleado: number, tokenConfirmacion: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/registrarRostro`, { idEmpleado, tokenConfirmacion, confirmarParecido: true });
  }
}
