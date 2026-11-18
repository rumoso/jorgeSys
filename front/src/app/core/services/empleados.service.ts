import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { EmpleadoGuardar, FiltrosEmpleados } from '../../models/empleados.models';

/**
 * Empleados de la empresa de la sesión (análisis 004). Pass-through. La foto y
 * la plantilla de Excel llegan como Blob; si el servidor contesta un error,
 * el Blob es el JSON { status_code, message } (tipo application/json).
 */
@Injectable({ providedIn: 'root' })
export class EmpleadosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/empleados`;

  getEmpleados(f: FiltrosEmpleados): Observable<ApiResponse> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    return this.http.get<ApiResponse>(`${this.api}/getEmpleados`, { params });
  }
  getEmpleado(idEmpleado: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getEmpleado`, { params: { idEmpleado } });
  }
  getSiguienteNumero(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getSiguienteNumero`);
  }
  getCatalogosEmpleado(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getCatalogosEmpleado`);
  }
  /** 009: uso del plan de la empresa (global/getAvisoPlan), para quien da de alta, reactiva o carga empleados. */
  getAvisoPlan(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${environment.apiUrl}/global/getAvisoPlan`);
  }
  getEmpleadosActivosEn(fecha: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getEmpleadosActivosEn`, { params: { fecha } });
  }
  insertUpdateEmpleado(body: EmpleadoGuardar): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertUpdateEmpleado`, body);
  }
  getPreciosEmpleado(idEmpleado: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getPreciosEmpleado`, { params: { idEmpleado } });
  }
  setPrecioEmpleado(body: { idEmpleado: number; precioHora: number; aPartirDe: string }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setPrecioEmpleado`, body);
  }
  bajaEmpleado(body: { idEmpleado: number; fechaBaja: string; motivoBaja: string }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/bajaEmpleado`, body);
  }
  reingresoEmpleado(body: { idEmpleado: number; fechaIngreso: string }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/reingresoEmpleado`, body);
  }
  getFotoEmpleado(idEmpleado: number): Observable<Blob> {
    return this.http.get(`${this.api}/getFotoEmpleado`, { params: { idEmpleado }, responseType: 'blob' });
  }
  setFotoEmpleado(idEmpleado: number, archivo: File): Observable<ApiResponse> {
    const fd = new FormData();
    fd.append('idEmpleado', String(idEmpleado));
    fd.append('archivo', archivo);
    return this.http.post<ApiResponse>(`${this.api}/setFotoEmpleado`, fd);
  }
  deleteFotoEmpleado(idEmpleado: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.api}/deleteFotoEmpleado`, { params: { idEmpleado } });
  }
  getPlantillaImportacion(): Observable<Blob> {
    return this.http.get(`${this.api}/getPlantillaImportacion`, { responseType: 'blob' });
  }
  previsualizarImportacion(archivo: File): Observable<ApiResponse> {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return this.http.post<ApiResponse>(`${this.api}/previsualizarImportacion`, fd);
  }
  importarEmpleados(body: { renglones: { renglon: number; datos: Record<string, string> }[]; crearCatalogos: boolean }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/importarEmpleados`, body);
  }
}
