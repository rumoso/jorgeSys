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

    public async saveToken( token: string ) {
      await this.SQLiteServ.set('token', token);
      await this.validaToken();
    }
  
    public async cargarToken() {
      this.token = await this.SQLiteServ.get('token') || null;
    }
  
    public async validaToken(): Promise<boolean> {
  
      await this.cargarToken();
  
      if ( !this.token ) {
        await this.SQLiteServ.set('token', '');
        await this.SQLiteServ.set('user', null);
        this.navCtrl.navigateRoot( '/login' );
        return Promise.resolve(false);
      } else {
        // AQUI DEBERIA VALIDAR EL UUID EN LA BASE DE DATOS
        return Promise.resolve(true);
      }
    }
  
    public async validaSesion() {
      await this.validaToken();
    }
  
    public async getIdSession(): Promise<number> {
      let user = await this.SQLiteServ.get('user');
  
      if(user != null || user != undefined)
        return Promise.resolve(user.idUser);
      else
        return Promise.resolve(0);
    }
  
    public async cerrarSesion() {
      this.token = '';
      await this.SQLiteServ.clear();
      this.navCtrl.navigateRoot('/login', { animated: true });
    }
  
    public CGetMenu(idUser: number): Observable<ResponseGet>{
      const data = {
        idUser: idUser
      };
  
      return this.http.post<ResponseGet>(`${ this.baseURL }/${ this._api }/CGetMenu`,data);
    }
    
}
