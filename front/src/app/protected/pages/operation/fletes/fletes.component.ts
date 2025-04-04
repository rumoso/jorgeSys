import { Component, Inject } from '@angular/core';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { ActivatedRoute, Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from 'src/app/auth/services/auth.service';
import { ResponseGet } from 'src/app/interfaces/general.interfaces';
import { ResponseDB_CRUD } from 'src/app/protected/interfaces/global.interfaces';
import { ChoferesService } from 'src/app/protected/services/choferes.service';
import { CustomersService } from 'src/app/protected/services/customers.service';
import { FletesService } from 'src/app/protected/services/fletes.service';
import { UnidadesService } from 'src/app/protected/services/unidades.service';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { environment } from 'src/environments/environment';
import { CargadescargaComponent } from '../mdl/cargadescarga/cargadescarga.component';
import { FolioComponent } from '../mdl/folio/folio.component';

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

  cargasDescargasList: any = [];

  fleteForm: any = {
    idFlete: 0,
    titulo: '',
    idCliente: 0,
    clientName: '',
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

    , private customerServ: CustomersService
    , private fletesServ: FletesService

    , private choferesServ: ChoferesService
    , private unidadesServ: UnidadesService
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

            this.fn_getCargasDescargas( this.idFlete );

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

  openGoogleMaps(lat: any, lon: any) {
    // Construye la URL con las coordenadas lat y lon
    const url = `https://www.google.com/maps?q=${lat},${lon}`;
    // Abre la URL en una nueva pestaña
    window.open(url, '_blank');
}

  showAddFolio( idCargaReparto:number, item: any ){

    var OParams: any = {
      idCargaReparto: idCargaReparto,
      data: item,
      iCount: this.cargasDescargasList.length
    }

    this.servicesGServ.showModalWithParams( FolioComponent, OParams, '1500px')
    .afterClosed().subscribe({
      next: ( resp: any ) =>{
        this.fn_getCargasDescargas( this.idFlete );
      }
    });

  }

  showCargaReparto( item: any ){

    var OParams: any = {
      idFlete: this.fleteForm.idFlete,
      idCliente: this.fleteForm.idCliente,
      data: item
    }

    this.servicesGServ.showModalWithParams( CargadescargaComponent, OParams, '1500px')
    .afterClosed().subscribe({
      next: ( resp: any ) =>{
        this.fn_getCargasDescargas( this.idFlete );
      }
    });

  }

  changeRoute( route: string ): void {
    this.servicesGServ.changeRoute( `/${ this._appMain }/${ route }` );
  }

    // #endregion

    // #region CONEXIONES CON EL BACK

    fn_deleteFolio( item: any ) {

      this.servicesGServ.showDialog('¿Estás seguro?'
        , 'Está a punto de eliminar el Folio: ' + item.folio
        , '¿Desea continuar?'
        , 'Si', 'No')
      .afterClosed().subscribe({
        next: ( resp: any ) =>{
          if(resp){
  
            this.bShowSpinner = true;

            var oParam = {
              idFolio: item.idFolio
            }
  
            this.fletesServ.CDeleteFolio( oParam )
              .subscribe({
                next: (resp: ResponseDB_CRUD) => {
        
                  this.servicesGServ.showAlertIA( resp );
                  
                  this.bShowSpinner = false;

                  this.fn_getCargasDescargas( this.idFlete );
        
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

  fn_getCargasDescargas( idFlete: number ) {

    this.fletesServ.CGetCargasDescargas( idFlete )
      .subscribe( {
        next: (resp: ResponseGet) =>{
          if(resp.status === 0){
            this.cargasDescargasList = resp.data.rows;
          }
          else{
          this.cargasDescargasList = [];
          }
        },
        error: (ex) => {
          this.servicesGServ.showSnakbar( "Problemas con el servicio" );
          this.bShowSpinner = false;
        }
      });
  }

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
                  this.fleteForm.idFlete = resp.insertID;
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

  // #region COMBOS

    //--------------------------------------------------------------------------
  // MÉTODOS PARA COMBO DE ÁREAS

  cbxCustomers: any[] = [];

  cbxClientes_Search() {

      this.customerServ.CCbxGetCustomersCombo( this.fleteForm.clientName )
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
      this.fleteForm.clientName = ODataCbx.name;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxClientes_Clear(){
    this.fleteForm.idCliente = 0;
    this.fleteForm.clientName = '';
  }

  // #endregion

}
