import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { CambioDia, DiaSemanaHorario } from '../../models/horarios.models';

/** Horarios, plantillas y días programados (análisis 006). Pass-through. */
@Injectable({ providedIn: 'root' })
export class HorariosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/horarios`;

  getSucursalesHorarios(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getSucursalesHorarios`);
  }

  // ── Horario del empleado ──
  getHorarioEmpleado(idEmpleado: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getHorarioEmpleado`, { params: { idEmpleado } });
  }
  revisarHorario(dias: DiaSemanaHorario[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/revisarHorario`, { dias });
  }
  setHorarioEmpleado(body: { idEmpleado: number; dias: DiaSemanaHorario[]; aPartirDe: string; motivo?: string | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setHorarioEmpleado`, body);
  }

  // ── Plantilla de la sucursal ──
  getPlantilla(idSucursal: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getPlantilla`, { params: { idSucursal } });
  }
  setPlantilla(body: { idSucursal: number; dias: DiaSemanaHorario[]; motivo?: string | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setPlantilla`, body);
  }
  previsualizarAplicar(idSucursal: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/previsualizarAplicar`, { params: { idSucursal } });
  }
  aplicarPlantilla(body: { idSucursal: number; idEmpleados: number[]; aPartirDe: string; motivo?: string | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/aplicarPlantilla`, body);
  }

  // ── Días ──
  getDiasEmpleado(idEmpleado: number, desde: string, hasta: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getDiasEmpleado`, { params: { idEmpleado, desde, hasta } });
  }
  getDiasSucursal(idSucursal: number, fecha: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getDiasSucursal`, { params: { idSucursal, fecha } });
  }
  setDia(body: CambioDia & { idEmpleado: number; fecha: string; idSucursal?: number | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setDia`, body);
  }
  setDiaVarios(body: CambioDia & { idSucursal: number; fecha: string; idEmpleados: number[] }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setDiaVarios`, body);
  }
  regresarDia(body: { idEmpleado: number; fecha: string; motivo: string }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/regresarDia`, body);
  }
  getSalidaPlantilla(idSucursal: number, fecha: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getSalidaPlantilla`, { params: { idSucursal, fecha } });
  }

  // ── Listas ──
  getHorariosPorAjustar(idSucursal?: number | null): Observable<ApiResponse> {
    const params = idSucursal ? new HttpParams().set('idSucursal', idSucursal) : new HttpParams();
    return this.http.get<ApiResponse>(`${this.api}/getHorariosPorAjustar`, { params });
  }
  getBitacoraHorarios(f: { idEmpleado?: number | null; idSucursal?: number | null; desde?: string | null; hasta?: string | null }): Observable<ApiResponse> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    return this.http.get<ApiResponse>(`${this.api}/getBitacoraHorarios`, { params });
  }
}
