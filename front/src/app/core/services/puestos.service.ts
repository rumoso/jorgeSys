import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Puestos de la empresa de la sesión (análisis 004, catálogo simple). Pass-through. */
@Injectable({ providedIn: 'root' })
export class PuestosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/puestos`;

  getPuestos(estado: 'activos' | 'todos' = 'activos'): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getPuestos`, { params: { estado } });
  }
  insertUpdatePuesto(body: { id?: number | null; nombre: string }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertUpdatePuesto`, body);
  }
  disablePuesto(id: number, bActivo: boolean): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/disablePuesto`, { id, bActivo });
  }
}
