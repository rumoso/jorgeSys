import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/common.models';
import { CuadroRostro } from '../../models/checador.models';

/**
 * El dispositivo checador (análisis 005), SIN sesión. Pass-through. La llave
 * del dispositivo viaja en el encabezado `x-dispositivo`, nunca en la URL ni
 * en el cuerpo; la guarda el componente del checador.
 */
@Injectable({ providedIn: 'root' })
export class ChecadorService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/checador`;

  private headers(llave: string): HttpHeaders { return new HttpHeaders({ 'x-dispositivo': llave }); }

  private multipart(datos: unknown, foto: Blob | null): FormData {
    const f = new FormData();
    f.append('datos', JSON.stringify(datos));
    if (foto) f.append('foto', foto, 'foto.jpg');
    return f;
  }

  vincular(codigo: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/vincular`, { codigo });
  }
  latido(llave: string, version: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/latido`, { version }, { headers: this.headers(llave) });
  }
  getReto(llave: string): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(`${this.api}/getReto`, { headers: this.headers(llave) });
  }
  checar(llave: string, idReto: string, frames: CuadroRostro[], foto: Blob | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/checar`, this.multipart({ idReto, frames }, foto), { headers: this.headers(llave) });
  }
  checarConNumero(llave: string, numeroEmpleado: string, folio: string | null, foto: Blob | null): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.api}/checarConNumero`, this.multipart({ numeroEmpleado, folio }, foto), { headers: this.headers(llave) });
  }
}
