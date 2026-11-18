import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';
import { FiltrosBitacora } from '../../../models/panel.models';

/** Panel → Bitácora del producto (009, pass-through, solo lectura). */
@Injectable({ providedIn: 'root' })
export class PanelBitacoraService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/panel/bitacora`;

  getBitacora(f: FiltrosBitacora): Observable<ApiResponse> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    return this.http.get<ApiResponse>(`${this.api}/getBitacora`, { params });
  }
  getFiltrosBitacora(): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getFiltrosBitacora`);
  }
}
