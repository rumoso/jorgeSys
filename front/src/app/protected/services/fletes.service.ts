import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/auth/services/auth.service';
import { environment } from 'src/environments/environment';
import { Pagination, ResponseDB_CRUD, ResponseGet } from '../interfaces/global.interfaces';

@Injectable({
  providedIn: 'root'
})
export class FletesService {

  private baseURL: string = environment.baseUrl;

  _api: string = 'api/products';

  constructor(
    private http: HttpClient
    , private authServ: AuthService
  ) { }

  CSaveFlete( data : any ): Observable<ResponseDB_CRUD> {
    data.idUserLogON = this.authServ.getIdUserSession();
    return this.http.post<ResponseDB_CRUD>( `${ this.baseURL }/${ this._api }/saveFlete`, data );
  }

  CGetFletesListWithPage( pagination: Pagination, data: any ): Observable<ResponseGet> {

    let start = pagination.pageIndex * pagination.pageSize;
    let limiter = pagination.pageSize;

    data.search = pagination.search;
    data.start = start;
    data.limiter = limiter;

    data.idUserLogON = this.authServ.getIdUserSession();

    return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/getFletesListWithPage`, data);

  }

  CGetFleteByID( id: number ): Observable<ResponseGet> {
    var data = {
      idFlete: id
    }
    return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/getFleteByID`, data);
  }
  
}
