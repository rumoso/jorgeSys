import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';

/** Sucursales de la empresa de la sesión (pass-through). */
@Injectable({ providedIn: 'root' })
export class SucursalesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/sucursales`;

  getSucursales(estado: 'activas' | 'todas' = 'activas'): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getSucursales`, { params: { estado } });
  }
  getZonasHorarias(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getZonasHorarias`);
  }
  insertUpdateSucursal(body: {
    idSucursal?: number | null; nombre: string; direccion?: string | null;
    latitud: number | null; longitud: number | null; zonaHoraria: string; confirmarZona?: boolean;
  }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertUpdateSucursal`, body);
  }
  disableSucursal(idSucursal: number, bActivo: boolean): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/disableSucursal`, { idSucursal, bActivo });
  }
}
