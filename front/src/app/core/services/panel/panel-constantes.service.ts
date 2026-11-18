import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';
import { ValorAjuste } from '../../../models/configuracion.models';
import { DefinicionConstante } from '../../../models/panel.models';

/** Panel → Constantes del sistema (009, pass-through). */
@Injectable({ providedIn: 'root' })
export class PanelConstantesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/panel/constantes`;

  getConstantes(f: { q?: string; incluirInactivas?: boolean }): Observable<ApiResponse> {
    let params = new HttpParams();
    if (f.q) params = params.set('q', f.q);
    if (f.incluirInactivas) params = params.set('incluirInactivas', 1);
    return this.http.get<ApiResponse>(`${this.api}/getConstantes`, { params });
  }
  getValoresEmpresas(clave: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getValoresEmpresas`, { params: { clave } });
  }
  getConstantesDeEmpresa(idEmpresa: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getConstantesDeEmpresa`, { params: { idEmpresa } });
  }
  getImpactoGlobal(clave: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getImpactoGlobal`, { params: { clave } });
  }
  setValorGlobal(clave: string, valor: ValorAjuste): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setValorGlobal`, { clave, valor });
  }
  setValorEmpresa(clave: string, idEmpresa: number, valor: ValorAjuste): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setValorEmpresa`, { clave, idEmpresa, valor });
  }
  quitarValorEmpresa(clave: string, idEmpresa: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/quitarValorEmpresa`, { clave, idEmpresa });
  }
  insertConstante(body: DefinicionConstante & { valor: ValorAjuste }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertConstante`, body);
  }
  updateDefinicionConstante(body: DefinicionConstante): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/updateDefinicionConstante`, body);
  }
  disableConstante(clave: string, claveConfirmacion: string): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/disableConstante`, { clave, claveConfirmacion });
  }
  enableConstante(clave: string): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/enableConstante`, { clave });
  }
}
