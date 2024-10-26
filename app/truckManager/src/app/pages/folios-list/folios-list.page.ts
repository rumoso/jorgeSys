import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationExtras } from '@angular/router';
import { NavController } from '@ionic/angular';
import { ResponseGet } from 'src/app/interfaces/global.interface';
import { AuthService } from 'src/app/services/auth.service';
import { FletesService } from 'src/app/services/fletes.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-folios-list',
  templateUrl: './folios-list.page.html',
  styleUrls: ['./folios-list.page.scss'],
})
export class FoliosListPage implements OnInit {

  oFoliosList: any[] = [];
  idCargaReparto: number = 0;

  constructor(
    private navCtrl: NavController
    , private uiService: UiService
    , private authServ: AuthService
    , private fletesServ: FletesService
    , private activatedRoute: ActivatedRoute
  ) {
  }

  async ngOnInit() {
    await this.authServ.validaSesion('');

    await this.activatedRoute.queryParams.subscribe
    ({
      next: async( resp: any ) => {
        if(resp.idCargaReparto > 0){

          this.idCargaReparto = resp.idCargaReparto;

          this.fn_GetFoliosByReparto(this.idCargaReparto);

        }
      },
      error: async( ex: any ) => {
        this.uiService.showToast('Error al conectarse al servidor');
      }
    });

  }

  public showAddFolio( idFolio: any ){
    const navigationExtras: NavigationExtras = {
      queryParams: {
        idCargaReparto: this.idCargaReparto,
        idFolio: idFolio
      }
    };
    this.navCtrl.navigateRoot(['/folio'],
    navigationExtras);

  }

  // public addClient( idClient: number ){
  //   const navigationExtras: NavigationExtras = {
  //     queryParams: {
  //       idClient: idClient
  //     }
  //   };
  //   this.navCtrl.navigateRoot(['/client'],
  //   navigationExtras);

  // }

  public async fn_GetFoliosByReparto( idCargaReparto: number ){

    const loading = this.uiService.showLoading('Cargando...');

    this.fletesServ.CGetFoliosByReparto( idCargaReparto )
    .subscribe({
      next: async( resp: ResponseGet ) => {
        for(var i = 0; i < resp.data.rows.length; i++){
          this.oFoliosList.push(resp.data.rows[i]);
        }
      },
      error: async( ex: any ) => {
        this.uiService.showToast('Error al conectarse al servidor');
        this.uiService.hideLoading( await loading );
      },
      complete: async() => {
        this.uiService.hideLoading( await loading );
      }
    });


  }

}
