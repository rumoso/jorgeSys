import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../models/common.models';

/**
 * Panel → Sesión de soporte (009, pass-through). Ambas van con el token del
 * panel; el token de soporte que regresa entrarEmpresa lo guarda AuthService.
 */
@Injectable({ providedIn: 'root' })
export class PanelSoporteService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/panel/soporte`;

  entrarEmpresa(idEmpresa: number, motivo: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/entrarEmpresa`, { idEmpresa, motivo });
  }
  salirEmpresa(idSesionSoporte: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/salirEmpresa`, { idSesionSoporte });
  }
}
