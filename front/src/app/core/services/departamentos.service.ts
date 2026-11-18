import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Departamentos de la empresa de la sesión (análisis 004, catálogo simple). Pass-through. */
@Injectable({ providedIn: 'root' })
export class DepartamentosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/departamentos`;

  getDepartamentos(estado: 'activos' | 'todos' = 'activos'): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getDepartamentos`, { params: { estado } });
  }
  insertUpdateDepartamento(body: { id?: number | null; nombre: string }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertUpdateDepartamento`, body);
  }
  disableDepartamento(id: number, bActivo: boolean): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/disableDepartamento`, { id, bActivo });
  }
}
