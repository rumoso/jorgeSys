import { Component, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { AuthService } from 'src/app/auth/services/auth.service';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DashboardComponent {
  
  private _appMain: string = environment.appMain;

  _menuList: any = [];
  idUserLogON: number = 0;
  
  constructor(
    private servicesGServ: ServicesGService
    , private authServ: AuthService
  ) { }

  async ngOnInit() {
    this.authServ.checkSession();
    this.idUserLogON = await this.authServ.getIdUserSession();

    this.getMenuByPermissions( this.idUserLogON );
  
  }

  changeRoute( route: string ): void {
    this.servicesGServ.changeRoute( `/${ this._appMain }/${ route }` );
  }

  getMenuByPermissions(idUser: any){
    
    this.authServ.getMenuByPermissions( idUser )
    .subscribe( data =>{
      //console.log(data);
      if(data.status == 0){
        this._menuList = data.data;
      }
    })

  }
  
}
