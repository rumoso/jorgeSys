import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';
import { AltaEmpresa, CambioPlan } from '../../../models/panel.models';

const params = (o: Record<string, unknown>) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  return p;
};

/** Panel → Empresas (009, pass-through). La exportación de la baja llega como Blob (sus errores, JSON). */
@Injectable({ providedIn: 'root' })
export class PanelEmpresasService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/panel/empresas`;

  getEmpresas(f: { q?: string; estado?: string; idPlan?: number | null }): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getEmpresas`, { params: params(f) });
  }
  getEmpresaById(idEmpresa: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getEmpresaById`, { params: { idEmpresa } });
  }
  getCatalogosAlta(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getCatalogosAlta`);
  }
  insertEmpresa(body: AltaEmpresa): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertEmpresa`, body);
  }
  updateEmpresaDatos(body: { idEmpresa: number; nombreComercial: string; razonSocial: string | null; rfc: string | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/updateEmpresaDatos`, body);
  }
  suspenderEmpresa(idEmpresa: number, motivo: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/suspenderEmpresa`, { idEmpresa, motivo });
  }
  reactivarEmpresa(idEmpresa: number, motivo: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/reactivarEmpresa`, { idEmpresa, motivo });
  }
  iniciarBaja(idEmpresa: number, nombreConfirmacion: string, motivo: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/iniciarBaja`, { idEmpresa, nombreConfirmacion, motivo });
  }
  revertirBaja(idEmpresa: number, motivo: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/revertirBaja`, { idEmpresa, motivo });
  }
  descargarExportacion(idEmpresa: number, idExportacion: number): Observable<Blob> {
    return this.http.get(`${this.api}/descargarExportacion`, { params: { idEmpresa, idExportacion }, responseType: 'blob' });
  }
  getModulosEmpresa(idEmpresa: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getModulosEmpresa`, { params: { idEmpresa } });
  }
  setModulosEmpresa(idEmpresa: number, modulos: string[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setModulosEmpresa`, { idEmpresa, modulos });
  }
  setPlanEmpresa(body: CambioPlan): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setPlanEmpresa`, body);
  }
}
