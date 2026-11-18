import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';

/** Panel → Cobro (009, pass-through). El Excel llega como Blob; si es application/json, es el error. */
@Injectable({ providedIn: 'root' })
export class PanelCobroService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/panel/cobro`;

  getCobroMes(mes: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getCobroMes`, { params: { mes } });
  }
  exportarCobroMes(mes: string): Observable<Blob> {
    return this.http.get(`${this.api}/exportarCobroMes`, { params: { mes }, responseType: 'blob' });
  }
}
