import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import { AlertController, NavController } from '@ionic/angular';
import { ResponseDB_CRUD, ResponseGet } from 'src/app/interfaces/global.interface';
import { AuthService } from 'src/app/services/auth.service';
import { FletesService } from 'src/app/services/fletes.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-folio',
  templateUrl: './folio.page.html',
  styleUrls: ['./folio.page.scss'],
})
export class FolioPage implements OnInit {

  idCargaReparto: number = 0;
  _user: any = null;
  oDataP: any = null;

  folio: any = {
    idFolio: 0,
    folio: '',
    recibidoPor: '',
    scan: '',
    nota: ''
  }

  constructor(
    private navCtrl: NavController
    , private router: Router
    , private authServ: AuthService
    , private activatedRoute: ActivatedRoute
    , private uiService: UiService
    , private alertController: AlertController
    , private fletesServ: FletesService
  ) { }

  async ngOnInit() {

    await this.authServ.validaSesion('');
    this._user = await this.authServ.getUser();

    await this.activatedRoute.queryParams.subscribe
    ({
      next: async( resp: any ) => {
        if(resp.idCargaReparto > 0){

          this.oDataP = resp;

          this.idCargaReparto = resp.idCargaReparto;

          console.log( resp )

          if( this.oDataP.idFolio > 0 ){
            this.getFolioByID();
          }

        }
      },
      error: async( ex: any ) => {
        this.uiService.showToast('Error al conectarse al servidor');
      }
    });

  }

  public cerrar(){
    const navigationExtras: NavigationExtras = {
      queryParams: {
        idCargaReparto: this.idCargaReparto
      }
    };
    this.navCtrl.navigateRoot(['/folios-list',{animated: true}],
    navigationExtras);
  }

  public async getFolioByID(){
    this.fletesServ.CGetFolioByID( this.oDataP.idFolio )
      .subscribe({
        next: async (resp: ResponseGet) => {
          this.folio = resp.data;
        },
        error: async (ex: any) => {
          this.uiService.showToast('Error al conectarse al servidor');
        },
        complete: async () => {
          console.log('complete: getProductByID');
        }
      });

  }

  public async fn_insertFolio(){

    const loading = this.uiService.showLoading('Cargando...');

    this.folio.idCargaReparto = this.idCargaReparto;
    this.folio.idUserLogON = this._user.idUser;

    this.fletesServ.CInsertFolio( this.folio )
    .subscribe({
      next: async( resp: ResponseDB_CRUD ) => {

        if(resp.status == 0){
          this.uiService.showToast(resp.message);
          this.cerrar();
        }
        else{
          this.uiService.showToast(resp.message);
        }
        this.uiService.hideLoading( await loading );
      },
      error: async( ex: any ) => {
        this.uiService.showToast('Error al conectarse al servidor');
        this.uiService.hideLoading( await loading );
      },
      complete: async() => {
      }
    });

  }

}
