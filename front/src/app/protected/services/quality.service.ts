import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ResponseGet } from '../interfaces/global.interfaces';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class QualityService {

  private baseURL: string = environment.baseUrl;

  _api: string = 'api/quality';
  
  constructor(
    private http: HttpClient
  ) { }

  CCbxGetQualityCombo( search: string ): Observable<ResponseGet> {
    var data = {
      search: search
    }
    return this.http.post<ResponseGet>( `${ this.baseURL }/${ this._api }/cbxGetQualityCombo`, data);
  }

}
