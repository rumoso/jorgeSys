import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Mi cuenta (pass-through). */
@Injectable({ providedIn: 'root' })
export class CuentaService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/cuenta`;

  getMiCuenta(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getMiCuenta`);
  }
  updateMiCuenta(nombre: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/updateMiCuenta`, { nombre });
  }
  cambiarPassword(actual: string, nueva: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/cambiarPassword`, { actual, nueva });
  }
}
