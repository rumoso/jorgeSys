import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { NavigationExtras } from '@angular/router';
import { AlertController, NavController } from '@ionic/angular';
import { Pagination, ResponseDB_CRUD, ResponseGet } from 'src/app/interfaces/global.interface';
import { AuthService } from 'src/app/services/auth.service';
import { FletesService } from 'src/app/services/fletes.service';
import { SQLiteService } from 'src/app/services/sqlite.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-start',
  templateUrl: './start.page.html',
  styleUrls: ['./start.page.scss'],
})
export class StartPage implements OnInit {

  _user: any = null;

  pagination: Pagination = {
    search: "",
    iRows: 0,
    start: 0,
    limiter: 10
  }

  ORutasList: any = [];

  constructor(
    private SQLite: SQLiteService
    , private authServ: AuthService
    , private navCtrl: NavController
    , private fletesServ: FletesService
    , private uiServ: UiService
    , private alertController: AlertController
    , private cdr: ChangeDetectorRef

  ) {

  }

  async ngOnInit() {

    await this.authServ.validaSesion('');
    this._user = await this.authServ.getUser();

    if( this._user?.idConductor > 0 ){

      this.fn_getCargasDescargasByChofer();

    }

  }

  public showFolios( idCargaReparto: number ){
    const navigationExtras: NavigationExtras = {
      queryParams: {
        idCargaReparto: idCargaReparto
      }
    };
    this.navCtrl.navigateRoot(['/folios-list'],
    navigationExtras);

  }

  public async fn_getCargasDescargasByChofer(){

    this.ORutasList = [];

    const loading = this.uiServ.showLoading('Cargando...');

    this.fletesServ.CGetCargasDescargasByChofer( this._user.idConductor )
    .subscribe({
      next: async( resp: ResponseGet ) => {

        if(resp.data.count > 0){
          for(var i = 0; i < resp.data.rows.length; i++){
            this.ORutasList.push(resp.data.rows[i]);
          }
        }

        this.cdr.detectChanges();

      },
      error: async( ex: any ) => {
        this.uiServ.showToast('Error al conectarse al servidor');
        this.uiServ.hideLoading( await loading );
      },
      complete: async() => {
        this.uiServ.hideLoading( await loading );
        console.log( 1 )
      }
    });
  }

  public async fn_CInsertCargaDescargaMovimiento( items: any, idMovimientoType: number ){
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: 'Confirma!',
      message: '¿Quieres registrar ' + ( idMovimientoType == 3 ? 'entrada' : 'salida' ) + '?',
      buttons: [
         {
          text: 'Si',
          handler: async () => {

            const position = await this.uiServ.getCurrentLocation();
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            const loading = this.uiServ.showLoading('Cargando...');

            var oParams: any = {
              idCargaReparto: items.idCargaReparto,
              idMovimientoType: idMovimientoType,
              latGPS: position.coords.latitude,
              longGPS: position.coords.longitude,
              idUserLogON: this._user.idUser
            }

            this.fletesServ.CInsertCargaDescargaMovimiento( oParams )
            .subscribe({
              next: async( resp: ResponseDB_CRUD ) => {

                if(resp.status == 0){
                  this.uiServ.showToast(resp.message);
                }
                else{
                  this.uiServ.showToast(resp.message);
                }

                this.fn_getCargasDescargasByChofer();

              },
              error: async( ex: any ) => {
                this.uiServ.showToast('Error al conectarse al servidor');
                this.uiServ.hideLoading( await loading );
              },
              complete: async() => {
                this.uiServ.hideLoading( await loading );
              }
            });

          },
        },
        {
          text: 'No',
          role: 'cancel',
          cssClass: 'secondary',
          handler: (blah) => {
            console.log('Confirm Cancel');
          }
        }
      ]
    });

    await alert.present();

  }

}
