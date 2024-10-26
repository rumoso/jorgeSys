import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/auth/services/auth.service';
import { environment } from 'src/environments/environment';
import { ResponseGet } from '../interfaces/global.interfaces';

@Injectable({
  providedIn: 'root'
})
export class UnidadesService {

  private baseURL: string = environment.baseUrl;

  _api: string = 'api/unidades';
  
  constructor(
    private http: HttpClient
    , private authServ: AuthService
  ) { }

  CCbxUnidadesCombo( search: string ): Observable<ResponseGet> {
    var data: any = {
      search: search
    }

    data.idUserLogON = this.authServ.getIdUserSession();

    return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/cbxUnidadesCombo`, data);
  }

}
