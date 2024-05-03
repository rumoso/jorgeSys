import { Component, Inject } from '@angular/core';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { AuthService } from 'src/app/auth/services/auth.service';
import { Pagination } from 'src/app/interfaces/general.interfaces';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-fletes-list',
  templateUrl: './fletes-list.component.html',
  styleUrls: ['./fletes-list.component.css']
})
export class FletesListComponent {

  // #region VARIABLES

  private _appMain: string = environment.appMain;

  idUserLogON: number = 0;

  title = 'Lista de Products';
  bShowSpinner: boolean = false;
  catlist: any[] = [];

  panelOpenState: boolean = false;
  
  //-------------------------------
  // VARIABLES PARA LA PAGINACIÓN
  iRows: number = 0;
  pagination: Pagination = {
    search:'',
    length: 10,
    pageSize: 10,
    pageIndex: 0,
    pageSizeOptions: [5, 10, 25, 100]
  }
  //-------------------------------

  parametersForm: any = {
    createDateStart: '',
    createDateEnd: '',
    titulo: '',
    guia: '',
    cartaPorte: '',

    idCliente: 0,
    clienteDesc: '',
  };

  // #endregion

  

  constructor(
    private servicesGServ: ServicesGService
    //, private productsServ: ProductsService

    , private _adapter: DateAdapter<any>
    , @Inject(MAT_DATE_LOCALE) private _locale: string

    , private authServ: AuthService
    ) { }

    async ngOnInit() {

      this.authServ.checkSession();
      this.idUserLogON = await this.authServ.getIdUserSession();

      this._locale = 'mx';
      this._adapter.setLocale(this._locale);

      //this.fn_getProductsListWithPage();
    }

    // #region MÉTODOS PARA EL FRONT

    ////************************************************ */
    // MÉTODOS DE PAGINACIÓN
    changePagination(pag: Pagination) {
      this.pagination = pag;
      //this.fn_getProductsListWithPage();
    }

    onChangeEvent(event: any){
      this.pagination.search = event.target.value;
      //this.fn_getProductsListWithPage();
    }
    ////************************************************ */

    changeRoute( route: string ): void {
      this.servicesGServ.changeRoute( `/${ this._appMain }/${ route }` );
    }

    // #endregion

    

}
