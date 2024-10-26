import { Component, Inject } from '@angular/core';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from 'src/app/auth/services/auth.service';
import { ResponseDB_CRUD } from 'src/app/protected/interfaces/global.interfaces';
import { FletesService } from 'src/app/protected/services/fletes.service';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-folio',
  templateUrl: './folio.component.html',
  styleUrls: ['./folio.component.css']
})
export class FolioComponent {

  // #region VARIABLES
  private _appMain: string = environment.appMain;

  title: string = 'Agregar';
  bShowSpinner: boolean = false;

  idUserLogON: number = 0;

  folio: any = {
    idFolio: 0,
    folio: '',
    recibidoPor: '',
    scan: '',
    nota: ''
  }

  // #endregion

  constructor(
    private dialogRef: MatDialogRef<FolioComponent>
    ,@Inject(MAT_DIALOG_DATA) public ODataP: any

    , private _adapter: DateAdapter<any>
    , @Inject(MAT_DATE_LOCALE) private _locale: string

    , private authServ: AuthService

    , private servicesGServ: ServicesGService

    , private fletesServ: FletesService

  ) { }

  async ngOnInit() {

    this.authServ.checkSession();
    this.idUserLogON = await this.authServ.getIdUserSession();

    this._locale = 'mx';
    this._adapter.setLocale(this._locale);

    console.log(this.ODataP)

    if(this.ODataP.data != null){

      this.folio = {
        idFolio: this.ODataP.data.idFolio,
        folio: this.ODataP.data.folio,
        recibidoPor: this.ODataP.data.recibidoPor,
        scan: this.ODataP.data.scan,
        nota: this.ODataP.data.nota
      };

    }
  }

  // #region MÉTODOS PARA FRONT
  
  fn_CerrarMDL( id: number ){
    this.dialogRef.close( id );
  }

// #endregion

  // #region MÉTODOS PARA FRONT

  fn_insertFolio() {

    this.servicesGServ.showDialog('¿Estás seguro?'
      , 'Está a punto de ' + ( this.folio.idFolio > 0 ? 'Editar el folio' : 'Agregar un folio' )
      , '¿Desea continuar?'
      , 'Si', 'No')
    .afterClosed().subscribe({
      next: ( resp: any ) =>{
        if(resp){

          this.bShowSpinner = true;

          this.folio.idCargaReparto = this.ODataP.idCargaReparto;

          this.fletesServ.CInsertFolio( this.folio )
            .subscribe({
              next: (resp: ResponseDB_CRUD) => {
      
                this.servicesGServ.showAlertIA( resp );
                
                this.bShowSpinner = false;

                this.fn_CerrarMDL( resp.insertID );
      
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

}
