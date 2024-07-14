import { Component, Inject } from '@angular/core';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { ActivatedRoute, Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from 'src/app/auth/services/auth.service';
import { ResponseGet } from 'src/app/interfaces/general.interfaces';
import { ResponseDB_CRUD } from 'src/app/protected/interfaces/global.interfaces';
import { CustomersService } from 'src/app/protected/services/customers.service';
import { FletesService } from 'src/app/protected/services/fletes.service';
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

  cargaForm: any = {
    idFlete: 0,
    idCargaReparto: 0,
    idMovimientoType: 0,
    movTypeDesc: '',
    idDireccionCliente: 0,
    direccionDesc: '',
    fechaCita: '',
    horaCita: '',
    idConductor: 0,
    choferName: '',
    idUnidad: 0,
    nombreUnidad: '',
    apoyo: '',
    tChep: '',
    tBlanca: '',
    tAgranel: ''
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

    , private customerServ: CustomersService
    , private fletesServ: FletesService
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
  
      this.activatedRoute.params
        .pipe(
          switchMap( ({ id }) => this.fletesServ.CGetFleteByID( id ) )
        )
        .subscribe( ( resp: any ) => {
          console.log(resp)
           if(resp.status == 0){
              
              this.idFlete = resp.data.idFlete;

              this.fleteForm.idFlete = resp.data.idFlete;
              this.fleteForm.titulo = resp.data.titulo;
              this.fleteForm.idCliente = resp.data.idCliente;
              this.fleteForm.clientName = resp.data.clientName;
              this.fleteForm.guia = resp.data.guia;
              this.fleteForm.cartaPorte = resp.data.cartaPorte;
              this.fleteForm.bFacturado = resp.data.bFacturado;
              this.fleteForm.active = resp.data.active;
  
           }else{

              this.idFlete = 0;

              this.fleteForm.idFlete = 0;
              this.fleteForm.titulo = '';
              this.fleteForm.idCliente = 0;
              this.fleteForm.clientName = '';
              this.fleteForm.guia = '';
              this.fleteForm.cartaPorte = '';
              this.fleteForm.bFacturado = false;
              this.fleteForm.active = true;
            }
           this.bShowSpinner = false;
        } )
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

    // #region CONEXIONES CON EL BACK
    fn_saveFlete() {

      this.servicesGServ.showDialog('¿Estás seguro?'
        , 'Está a punto de ' + ( this.idFlete > 0 ? 'actualizar el' : 'generar un nuevo' ) + ' Flete'
        , '¿Desea continuar?'
        , 'Si', 'No')
      .afterClosed().subscribe({
        next: ( resp: any ) =>{
          if(resp){

            this.bShowSpinner = true;
  
            this.fletesServ.CSaveFlete( this.fleteForm )
              .subscribe({
                next: (resp: ResponseDB_CRUD) => {
        
                  if( resp.status === 0 ){
                    this.idFlete = resp.insertID;
                  }
      
                  this.servicesGServ.showAlertIA( resp );
                  
                  this.bShowSpinner = false;
        
                },
                error: (ex) => {
        
                  this.servicesGServ.showSnakbar( "Problemas con el servicio" );
                  this.bShowSpinner = false;
        
                }
              })
          
          }
        }
      });
    }
    // #endregion

    //--------------------------------------------------------------------------
  // MÉTODOS PARA COMBO DE ÁREAS

  cbxCustomers: any[] = [];

  cbxClientes_Search() {

      this.customerServ.CCbxGetCustomersCombo( this.fleteForm.clientDesc )
       .subscribe( {
         next: (resp: ResponseGet) =>{
           if(resp.status === 0){
             this.cbxCustomers = resp.data
           }
           else{
            this.cbxCustomers = [];
           }
         },
         error: (ex) => {
           this.servicesGServ.showSnakbar( "Problemas con el servicio" );
           this.bShowSpinner = false;
         }
       });
  }

  cbxClientes_SelectedOption( event: MatAutocompleteSelectedEvent ) {

    this.cbxClientes_Clear();

    setTimeout (() => {
      
      const ODataCbx: any = event.option.value;

      this.fleteForm.idCliente = ODataCbx.idCliente;
      this.fleteForm.clientDesc = ODataCbx.name;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxClientes_Clear(){
    this.fleteForm.idCliente = 0;
    this.fleteForm.clientDesc = '';
  }
  //--------------------------------------------------------------------------
  // MÉTODOS PARA COMBO DE ÁREAS

  cbxDireccionCliente: any[] = [];

  cbxDireccionCliente_Search() {

      this.customerServ.CCbxGetCustomersCombo( this.fleteForm.clientDesc )
       .subscribe( {
         next: (resp: ResponseGet) =>{
           if(resp.status === 0){
             this.cbxCustomers = resp.data
           }
           else{
            this.cbxCustomers = [];
           }
         },
         error: (ex) => {
           this.servicesGServ.showSnakbar( "Problemas con el servicio" );
           this.bShowSpinner = false;
         }
       });
  }

  cbxDireccionCliente_SelectedOption( event: MatAutocompleteSelectedEvent ) {

    this.cbxClientes_Clear();

    setTimeout (() => {
      
      const ODataCbx: any = event.option.value;

      this.fleteForm.idCliente = ODataCbx.idCliente;
      this.fleteForm.clientDesc = ODataCbx.name;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxDireccionCliente_Clear(){
    this.fleteForm.idCliente = 0;
    this.fleteForm.clientDesc = '';
  }
  //--------------------------------------------------------------------------

}
