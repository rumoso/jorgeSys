import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NavController } from '@ionic/angular';
import { environment } from 'src/environments/environment';

import { SQLiteService } from './sqlite.service';
import { Observable } from 'rxjs';
import { ResponseGet } from '../interfaces/global.interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private baseURL: string = environment.baseUrl;

  _api: string = 'api/auth';

  public token: string = '';

  constructor(
    private http: HttpClient
    , private SQLiteServ: SQLiteService
    , private navCtrl: NavController
    ) { }

    public login( userName: string, pwd: string): Observable<ResponseGet>{
      const data = {
        username: userName
        ,pwd: pwd
      };
  
      return this.http.post<ResponseGet>(`${ this.baseURL }/${ this._api }/login` ,data);
    }
    
}
