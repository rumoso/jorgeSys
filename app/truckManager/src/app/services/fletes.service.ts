import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { SQLiteService } from './sqlite.service';
import { ResponseDB_CRUD, ResponseGet } from '../interfaces/global.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FletesService {

  private baseURL: string = environment.baseUrl;

  _api: string = 'api/fletes';

  public token: string = '';

  constructor(
    private http: HttpClient
    , private SQLiteServ: SQLiteService
    ) { }

    public CGetCargasDescargasByChofer( id: number ): Observable<ResponseGet> {
      var data = {
        idConductor: id
      }
      return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/app_getCargasDescargasByChofer`, data);
    }

    public CInsertCargaDescargaMovimiento(data: any): Observable<ResponseDB_CRUD>{

      return this.http.post<ResponseDB_CRUD>(`${ this.baseURL }/${ this._api }/app_insertCargaDescargaMovimiento`,data);
    }

    public CGetFoliosByReparto( id: number ): Observable<ResponseGet> {
      var data = {
        idCargaReparto: id
      }
      return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/app_getFoliosByReparto`, data);
    }

    public CInsertFolio(data: any): Observable<ResponseDB_CRUD>{

      return this.http.post<ResponseDB_CRUD>(`${ this.baseURL }/${ this._api }/app_insertFolio`,data);
    }

    public CGetFolioByID( id: number ): Observable<ResponseGet> {
      var data = {
        idFolio: id
      }
      return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/app_getFolioByID`, data);
    }

}
