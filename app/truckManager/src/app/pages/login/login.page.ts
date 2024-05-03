import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import { ResponseGet } from 'src/app/interfaces/global.interface';
import { AuthService } from 'src/app/services/auth.service';
import { SQLiteService } from 'src/app/services/sqlite.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {

  login: any = {
    username: '',
    pwd: '',
  };

  constructor(
    private uiServ: UiService
    , private navCtrl: NavController
    , private SQLiteServ: SQLiteService
    , private authServ: AuthService
  ) { }

  ngOnInit() {
  }

  public async loginON() {

    const loading = this.uiServ.showLoading('Cargando...');

    await this.authServ.login(this.login.username, this.login.pwd)
    .subscribe({
      next: async( resp: ResponseGet ) => {

        if(resp.status == 0){
          await this.authServ.saveToken( resp.data.token );
          await this.SQLiteServ.set('user', resp.data.user);
          
          this.navCtrl.navigateRoot( '/start', { animated: true } );
          this.uiServ.showToast('Usuario correcto');
        }
        else{
          this.uiServ.showToast(resp.message);
        }
        this.uiServ.hideLoading( await loading );
      },
      error: async( ex: ResponseGet ) => {
        this.uiServ.showToast(ex.message);
        this.uiServ.hideLoading( await loading );
      },
      complete: async() => {
      }
    });
  }

}
