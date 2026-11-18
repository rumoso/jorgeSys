import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';
import { PlanGuardar } from '../../../models/panel.models';

/** Panel → Planes (009, pass-through). */
@Injectable({ providedIn: 'root' })
export class PanelPlanesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/panel/planes`;

  getPlanes(soloActivos = false): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getPlanes`, { params: soloActivos ? { soloActivos: 1 } : {} });
  }
  insertUpdatePlan(body: PlanGuardar): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/insertUpdatePlan`, body);
  }
  disablePlan(idPlan: number): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/disablePlan`, { idPlan });
  }
  enablePlan(idPlan: number): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.api}/enablePlan`, { idPlan });
  }
}
