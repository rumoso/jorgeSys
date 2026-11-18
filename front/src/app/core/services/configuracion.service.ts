import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { ValorAjuste } from '../../models/configuracion.models';

/** Configuración de la empresa y excepciones por sucursal (análisis 003, pass-through). */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/configuracion`;

  getConfiguracion(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getConfiguracion`);
  }
  getConfiguracionSucursal(idSucursal: number): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getConfiguracionSucursal`, { params: { idSucursal } });
  }
  getBitacoraConfiguracion(limite = 100): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getBitacoraConfiguracion`, { params: { limite } });
  }
  /** 009: cuándo entró soporte del proveedor a esta empresa, quién, por qué y cuánto duró. */
  getAccesosSoporte(limite = 100): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getAccesosSoporte`, { params: { limite } });
  }
  setConfiguracion(valores: { clave: string; valor: ValorAjuste }[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setConfiguracion`, { valores });
  }
  confirmarConfiguracion(claves: string[]): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/confirmarConfiguracion`, { claves });
  }
  /** `valor` nulo quita la excepción: la sucursal regresa al valor general. */
  setExcepcionSucursal(idSucursal: number, clave: string, valor: ValorAjuste): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/setExcepcionSucursal`, { idSucursal, clave, valor });
  }
}
