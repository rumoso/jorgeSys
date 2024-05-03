import { Component, Inject } from '@angular/core';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/auth/services/auth.service';
import { ResponseGet } from 'src/app/interfaces/general.interfaces';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-fletes',
  templateUrl: './fletes.component.html',
  styleUrls: ['./fletes.component.css']
})
export class FletesComponent {

  // #region VARIABLES

  private _appMain: string = environment.appMain;

  //@ViewChild('cbxSucursalCBX') cbxSucursalCBX!: ElementRef;

  title: string = 'Fletes';
  bShowSpinner: boolean = false;
  idFlete: number = 0;

  idUserLogON: number = 0;

  fleteForm: any = {
    idFlete: 0,
    titulo: '',
    idCliente: 0,
    clientDesc: '',
    guia: '',
    cartaPorte: '',
    bFacturado: false,
    active: true
  };

  // #endregion
  

  constructor(
    private servicesGServ: ServicesGService
    //, private productsServ: ProductsService
    , private router: Router
    , private activatedRoute: ActivatedRoute

    , private _adapter: DateAdapter<any>
    , @Inject(MAT_DATE_LOCALE) private _locale: string

    , private authServ: AuthService
    ) { }

    

    async ngOnInit() {
      this.authServ.checkSession();
      this.idUserLogON = await this.authServ.getIdUserSession();

      this._locale = 'mx';
      this._adapter.setLocale(this._locale);
  
      if( !this.router.url.includes('editFlete') ){
        return;
      }
  
      this.bShowSpinner = true;
  
      // this.activatedRoute.params
      //   .pipe(
      //     switchMap( ({ id }) => this.productsServ.CGetProductByID( id ) )
      //   )
      //   .subscribe( ( resp: any ) => {
      //     console.log(resp)
      //      if(resp.status == 0){
              
      //       this.idProduct = resp.data.idProduct;
  
      //       this.productForm = {
      //         idProduct: resp.data.idProduct,
      //         idSucursal: resp.data.idSucursal,
      //         sucursalDesc: resp.data.sucursalDesc,
      //         createDate: resp.data.createDate,
      //         barCode: resp.data.barCode,
      //         name: resp.data.name,
      //         gramos: resp.data.gramos,
      //         cost: resp.data.cost,
      //         price: resp.data.price,
      //         idFamily: resp.data.idFamily,
      //         familyDesc: resp.data.familyDesc,
      //         idGroup: resp.data.idGroup,
      //         groupDesc: resp.data.groupDesc,
      //         idQuality: resp.data.idQuality,
      //         qualityDesc: resp.data.qualityDesc,
      //         idOrigin: resp.data.idOrigin,
      //         originDesc: resp.data.originDesc,
      //         idSupplier: resp.data.idSupplier,
      //         supplierDesc: resp.data.supplierDesc,
      //         active: resp.data.active,
      //         addInv: 1,
      //         idUser: this.idUserLogON
      //        };
  
  
      //        this.fn_getInventarylogByIdProductWithPage();
      //      }else{
      //       this.servicesGServ.showSnakbar(resp.message);
      //      }
      //      this.bShowSpinner = false;
      //   } )
    }

    // #region MÉTODOS DEL FRONT

    showCat( sOption: string ){

      var OParams: any = {
        sOption: sOption
      }
  
      // this.servicesGServ.showModalWithParams( CatComponent, OParams, '1500px')
      // .afterClosed().subscribe({
      //   next: ( resp: any ) =>{
  
      //   }
      // });

    }

    changeRoute( route: string ): void {
      this.servicesGServ.changeRoute( `/${ this._appMain }/${ route }` );
    }

    // #endregion

    //--------------------------------------------------------------------------
  // MÉTODOS PARA COMBO DE ÁREAS

  cbxClientes: any[] = [];

  cbxClientes_Search() {

      // this.sucursalesServ.CCbxGetSucursalesCombo( this.fleteForm.clientDesc )
      //  .subscribe( {
      //    next: (resp: ResponseGet) =>{
      //      if(resp.status === 0){
      //        this.cbxSucursales = resp.data
      //      }
      //      else{
      //       this.cbxSucursales = [];
      //      }
      //    },
      //    error: (ex) => {
      //      this.servicesGServ.showSnakbar( "Problemas con el servicio" );
      //      this.bShowSpinner = false;
      //    }
      //  });
  }

  cbxClientes_SelectedOption( event: MatAutocompleteSelectedEvent ) {

    this.cbxClientes_Clear();

    setTimeout (() => {
      
      const ODataCbx: any = event.option.value;

      this.fleteForm.idSucursal = ODataCbx.idSucursal;
      this.fleteForm.sucursalDesc = ODataCbx.name;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxClientes_Clear(){
    this.fleteForm.idSucursal = 0;
    this.fleteForm.sucursalDesc = '';
  }
  //--------------------------------------------------------------------------

}
