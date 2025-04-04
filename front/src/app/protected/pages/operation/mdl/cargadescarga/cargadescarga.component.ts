import { Component, Inject } from '@angular/core';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from 'src/app/auth/services/auth.service';
import { ResponseDB_CRUD, ResponseGet } from 'src/app/protected/interfaces/global.interfaces';
import { ChoferesService } from 'src/app/protected/services/choferes.service';
import { CustomersService } from 'src/app/protected/services/customers.service';
import { FletesService } from 'src/app/protected/services/fletes.service';
import { UnidadesService } from 'src/app/protected/services/unidades.service';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-cargadescarga',
  templateUrl: './cargadescarga.component.html',
  styleUrls: ['./cargadescarga.component.css']
})
export class CargadescargaComponent {

// #region VARIABLES
  private _appMain: string = environment.appMain;

  title: string = 'Agregar';
  bShowSpinner: boolean = false;

  idUserLogON: number = 0;

  cargaForm: any = {
    idFlete: 0,
    idCargaReparto: 0,
    idMovimientoType: 0,
    movTypeDesc: '',
    idCliente: 0,
    idDireccionCliente: 0,
    direccionDesc: '',
    fechaCita: '',
    horaCita: '',
    idConductor: 0,
    choferName: '',
    idUnidad: 0,
    unidadDesc: '',
    apoyo: '',
    tChep: 0,
    tBlanca: 0,
    tAgranel: 0
  };

// #endregion

  constructor(
    private dialogRef: MatDialogRef<CargadescargaComponent>
    ,@Inject(MAT_DIALOG_DATA) public ODataP: any

    , private _adapter: DateAdapter<any>
    , @Inject(MAT_DATE_LOCALE) private _locale: string

    , private authServ: AuthService

    , private servicesGServ: ServicesGService

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

    if(this.ODataP.data != null){
      console.log( this.ODataP.data )

      this.cargaForm = {
        idFlete: this.ODataP.idFlete,
        idCargaReparto: this.ODataP.data.idCargaReparto,
        idMovimientoType: this.ODataP.data.idMovimientoType,
        movTypeDesc: this.ODataP.data.movTypeDesc,
        idCliente: this.ODataP.data.idCliente,
        idDireccionCliente: this.ODataP.data.idDireccionCliente,
        direccionDesc: this.ODataP.data.direccion,
        fechaCita: this.ODataP.data.fechaCita,
        horaCita: this.ODataP.data.horaCita,
        idConductor: this.ODataP.data.idConductor,
        choferName: this.ODataP.data.choferName,
        idUnidad: this.ODataP.data.idUnidad,
        unidadDesc: this.ODataP.data.nombreUnidad,
        apoyo: this.ODataP.data.apoyo,
        tChep: this.ODataP.data.tChep,
        tBlanca: this.ODataP.data.tBlanca,
        tAgranel: this.ODataP.data.tAgranel
      };
    }

  }

// #region MÉTODOS PARA FRONT

aplicarMascara(event: any): void {
  let valor = event.target.value.replace(/[^0-9]/g, ''); // Solo permite números
  
  // Aplicar el formato hh:mm:ss
  if (valor.length >= 2) {
    valor = valor.slice(0, 2) + ':' + valor.slice(2);
  }
  if (valor.length >= 5) {
    valor = valor.slice(0, 5) + ':' + valor.slice(5, 7);
  }
  if (valor.length > 8) {
    valor = valor.slice(0, 8);
  }

  // Validar cada parte del formato para evitar valores incorrectos
  const partes = valor.split(':');
  const horas = parseInt(partes[0], 10);
  const minutos = parseInt(partes[1], 10);
  const segundos = parseInt(partes[2], 10);

  if (horas > 23 || minutos > 59 || segundos > 59) {
    return; // Evita actualizar el valor si es inválido
  }

  this.cargaForm.horaCita = valor;
}

isHoraValida(hora: string): boolean {
  const regex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
  return regex.test(hora);
}

verificarHoraValida(): void {
  if (!this.isHoraValida(this.cargaForm.horaCita)) {
    alert('El formato de la hora es incorrecto. Debe ser hh:mm:ss con valores válidos.');
  }
}
  
  fn_CerrarMDL( id: number ){
    this.dialogRef.close( id );
  }

// #endregion

// #region MÉTODOS PARA FRONT

  fn_saveCargaRepato() {

    this.servicesGServ.showDialog('¿Estás seguro?'
      , 'Está a punto de ' + ( this.cargaForm.idCargaReparto > 0 ? 'editar' : 'crear' ) + ( this.ODataP.iCount == 0 ? ' una carga' : ' un reparto' )
      , '¿Desea continuar?' 
      , 'Si', 'No')
    .afterClosed().subscribe({
      next: ( resp: any ) =>{
        if(resp){

          this.bShowSpinner = true;

          this.cargaForm.idFlete = this.ODataP.idFlete;
          this.cargaForm.idCliente = this.ODataP.idCliente;

          this.fletesServ.CSaveCargaRepato( this.cargaForm )
            .subscribe({
              next: (resp: ResponseDB_CRUD) => {
      
                this.servicesGServ.showAlertIA( resp );
                
                this.bShowSpinner = false;

                this.fn_CerrarMDL( 0 );
      
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

  cbxDireccionClienteList: any[] = [];

  cbxDireccionCliente_Search() {

      this.customerServ.CCbxDireccionCliente( this.cargaForm.direccionDesc )
       .subscribe( {
         next: (resp: ResponseGet) =>{
           if(resp.status === 0){
             this.cbxDireccionClienteList = resp.data
           }
           else{
            this.cbxDireccionClienteList = [];
           }
         },
         error: (ex) => {
           this.servicesGServ.showSnakbar( "Problemas con el servicio" );
           this.bShowSpinner = false;
         }
       });
  }

  cbxDireccionCliente_SelectedOption( event: MatAutocompleteSelectedEvent ) {

    this.cbxDireccionCliente_Clear();

    setTimeout (() => {
      
      const ODataCbx: any = event.option.value;

      this.cargaForm.idDireccionCliente = ODataCbx.idDireccionCliente;
      this.cargaForm.direccionDesc = ODataCbx.clientName + ' - ' +ODataCbx.direccionDesc;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxDireccionCliente_Clear(){
    this.cargaForm.idDireccionCliente = 0;
    this.cargaForm.direccionDesc = '';
  }
  //--------------------------------------------------------------------------
  //--------------------------------------------------------------------------
  // MÉTODOS PARA COMBO DE ÁREAS

  cbxChoferesList: any[] = [];

  cbxChoferes_Search() {

      this.choferesServ.CCbxChoferesCombo( this.cargaForm.choferName )
       .subscribe( {
         next: (resp: ResponseGet) =>{
           if(resp.status === 0){
             this.cbxChoferesList = resp.data
           }
           else{
            this.cbxChoferesList = [];
           }
         },
         error: (ex) => {
           this.servicesGServ.showSnakbar( "Problemas con el servicio" );
           this.bShowSpinner = false;
         }
       });
  }

  cbxChoferes_SelectedOption( event: MatAutocompleteSelectedEvent ) {

    this.cbxChoferes_Clear();

    setTimeout (() => {
      
      const ODataCbx: any = event.option.value;

      this.cargaForm.idConductor = ODataCbx.idConductor;
      this.cargaForm.choferName = ODataCbx.choferName;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxChoferes_Clear(){
    this.cargaForm.idConductor = 0;
    this.cargaForm.choferName = '';
  }
  //--------------------------------------------------------------------------
  //--------------------------------------------------------------------------
  // MÉTODOS PARA COMBO DE ÁREAS

  cbxUnidadesList: any[] = [];

  cbxUnidades_Search() {

      this.unidadesServ.CCbxUnidadesCombo( this.cargaForm.unidadDesc )
       .subscribe( {
         next: (resp: ResponseGet) =>{
           if(resp.status === 0){
             this.cbxUnidadesList = resp.data
           }
           else{
            this.cbxUnidadesList = [];
           }
         },
         error: (ex) => {
           this.servicesGServ.showSnakbar( "Problemas con el servicio" );
           this.bShowSpinner = false;
         }
       });
  }

  cbxUnidades_SelectedOption( event: MatAutocompleteSelectedEvent ) {

    this.cbxUnidades_Clear();

    setTimeout (() => {
      
      const ODataCbx: any = event.option.value;

      this.cargaForm.idUnidad = ODataCbx.idUnidad;
      this.cargaForm.unidadDesc = ODataCbx.unidadDesc;
  
      //this.ev_fn_nextInput_keyup_enter( 'cbxSupplier' );

    }, 1);

  }

  cbxUnidades_Clear(){
    this.cargaForm.idUnidad = 0;
    this.cargaForm.unidadDesc = '';
  }
  //--------------------------------------------------------------------------

  // #endregion

}
