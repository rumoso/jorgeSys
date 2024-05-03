import { Injectable } from '@angular/core';
import { SucursalesService } from './sucursales.service';
import { Observable, async } from 'rxjs';
import { SalesService } from './sales.service';
import { CustomersService } from './customers.service';
import { ResponseGet } from '../interfaces/global.interfaces';
import { ServicesGService } from 'src/app/servicesG/servicesG.service';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { CajasService } from './cajas.service';
import { PrintersService } from './printers.service';

@Injectable({
  providedIn: 'root'
})
export class PrintTicketService {

  _api: string = 'http://localhost/printT/Print';

  constructor(
    private http: HttpClient
    , private sucursalesServ: SucursalesService
    , private salesServ: SalesService
    , private customersServ: CustomersService
    , private servicesG: ServicesGService
    , private cajasServ: CajasService
    , private printersServ: PrintersService
  ) { }

  async printTicket( type: string, idRelation: any, idPrinter: number, iPayments: number = 0, idPayment: any = '' ): Promise<any> {

    var bOK = false;

    let USDollar = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    var oLinesP: any = [];

    if(type == "Venta"){

      const sale = await this.salesServ.CGetSaleByIDPromise( idRelation );

      console.log(sale);

      // CONSTRUYO EL HEADER
      const HeaderSuc = await this.sucursalesServ.CGetPrintTicketSuc( sale.data.idSucursal, "Header");

      var oLines: any = [];

      oLines = [];
      var oLine: any = { aling: "Center", size: 20, text: "NOTA" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      for(var i = 0; i < HeaderSuc.length; i++){

        oLines = [];

        var oLine: any = {
          aling: HeaderSuc[i].aling
          , size: HeaderSuc[i].size
          , text: HeaderSuc[i].text
        }

        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

      // AGREGO LA INFORMACIÓN DEL CLIENTE
      const OCustomerData = await this.customersServ.CGetCustomerByIDPromise( sale.data.idCustomer );

      if( OCustomerData != null ){

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "CLIENTE: " + OCustomerData.lastName + " " + OCustomerData.name }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "DIRECCIÓN: " + OCustomerData.address }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "TELEFONO: " + OCustomerData.tel }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

      // AGREGO LA INFORMACIÓN DELA OPERACIÓN
      if( sale != null ){

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "OPERACIÓN: Venta de " + sale.data.saleTypeDesc }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "Folio: #" + sale.data.idSale }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "FECHA: " + sale.data.createDateString }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "ATENDIÓ: " + sale.data.sellerDesc }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }

      if( sale.data.idSaleType == 5 ){

        oLines = [];
        var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "DESCRIPCIÓN", iWith: 100 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        for(var i = 0; i < sale.dataDetail.length; i++){

          var ODataDetail = sale.dataDetail[i];

          oLines = [];
          var oLine: any = { aling: "Left", size: 7, text: ODataDetail.productDesc, iWith: 100 }
          oLines.push( oLine );
          oLinesP.push( { oLines: oLines } );

        }

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }else{

        oLines = [];
        var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "DESCRIPCIÓN", iWith: 35 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 5, style: "Bold", text: "CANTIDAD", iWith: 15 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 5, style: "Bold", text: "PRECIO", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 5, style: "Bold", text: "IMPORTE", iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        for(var i = 0; i < sale.dataDetail.length; i++){

          var ODataDetail = sale.dataDetail[i];

          oLines = [];
          var oLine: any = { aling: "Left", size: 7, text: ODataDetail.productDesc, iWith: 35 }
          oLines.push( oLine );
          var oLine: any = { aling: "Center", size: 7, text: ODataDetail.cantidad, iWith: 15 }
          oLines.push( oLine );
          var oLine: any = { aling: "Right", size: 7, text: USDollar.format( ODataDetail.precio ), iWith: 25 }
          oLines.push( oLine );
          var oLine: any = { aling: "Right", size: 7, text: USDollar.format( ODataDetail.importe ), iWith: 25 }
          oLines.push( oLine );
          oLinesP.push( { oLines: oLines } );

        }

      }

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "SUBTOTAL:", iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.data.saleTotal ), iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "IVA:", iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( 0 ), iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "TOTAL:", iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.data.saleTotal ), iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      //SI ES DE CONSIGNACIÓN, DEBE FIRMAR EL CLIENTE
      if(sale.data.idSaleType == 4 || sale.data.idSaleType == 1){

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "---------------------------------------------------- " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "CLIENTE: " + OCustomerData.lastName + " " + OCustomerData.name }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }

      // //SI ES DE CONTADO NO APARECE TANTO DETALLE EN EL PAGO
      // if(sale.data.idSaleType == 2){

      //   for(var i = 0; i < sale.dataPayments.length; i++){

      //     oLines = [];
      //     var oLine: any = { aling: "Left", size: 7, text: " " }
      //     oLines.push( oLine );
      //     oLinesP.push( { oLines: oLines } );

      //     oLines = [];
      //     var oLine: any = { aling: "Right", size: 7, style: "Bold", text: sale.dataPayments[i].formaPagoDesc, iWith: 75 }
      //     oLines.push( oLine );
      //     var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.dataPayments[i].pago ), iWith: 25 }
      //     oLines.push( oLine );
      //     oLinesP.push( { oLines: oLines } );

      //   }

      // }else{

      //   oLines = [];
      //   var oLine: any = { aling: "Left", size: 7, text: " " }
      //   oLines.push( oLine );
      //   oLinesP.push( { oLines: oLines } );

      //   oLines = [];
      //   var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "FECHA PAGO", iWith: 45 }
      //   oLines.push( oLine );
      //   var oLine: any = { aling: "Center", size: 5, style: "Bold", text: "FORMA DE PAGO", iWith: 25 }
      //   oLines.push( oLine );
      //   var oLine: any = { aling: "Right", size: 5, style: "Bold", text: "PAGO", iWith: 30 }
      //   oLines.push( oLine );
      //   oLinesP.push( { oLines: oLines } );

      //   for(var i = 0; i < sale.dataPayments.length; i++){

      //     oLines = [];
      //     var oLine: any = { aling: "Center", size: 7, text: sale.dataPayments[i].createDateString, iWith: 45 }
      //     oLines.push( oLine );
      //     var oLine: any = { aling: "Center", size: 7, text: sale.dataPayments[i].formaPagoDesc, iWith: 25 }
      //     oLines.push( oLine );
      //     var oLine: any = { aling: "Right", size: 7, text: USDollar.format( sale.dataPayments[i].pago ), iWith: 30 }
      //     oLines.push( oLine );
      //     oLinesP.push( { oLines: oLines } );

      //   }

      //   oLines = [];
      //   var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "PAGADO:", iWith: 75 }
      //   oLines.push( oLine );
      //   var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.data.pagado ), iWith: 25 }
      //   oLines.push( oLine );
      //   oLinesP.push( { oLines: oLines } );

      //   oLines = [];
      //   var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "PENDIENTE:", iWith: 75 }
      //   oLines.push( oLine );
      //   var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.data.pendingAmount ), iWith: 25 }
      //   oLines.push( oLine );
      //   oLinesP.push( { oLines: oLines } );

      // }

      // CONSTRUYO EL FOOTER
      const FooterSuc = await this.sucursalesServ.CGetPrintTicketSuc( sale.data.idSucursal, "footer");

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      for(var i = 0; i < FooterSuc.length; i++){

        oLines = [];

        var oLine: any = {
          aling: FooterSuc[i].aling
          , size: FooterSuc[i].size
          , text: FooterSuc[i].text
        }

        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

    }
    else if(type == "Payments" || type == "RePayment"){

      const sale = await this.salesServ.CGetSaleByIDPromise( idRelation );

      console.log(sale);

      // CONSTRUYO EL HEADER
      const HeaderSuc = await this.sucursalesServ.CGetPrintTicketSuc( sale.data.idSucursal, "Header");

      var oLines: any = [];

      oLines = [];
      var oLine: any = { aling: "Center", size: 20, text: "PAGO" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      for(var i = 0; i < HeaderSuc.length; i++){

        oLines = [];

        var oLine: any = {
          aling: HeaderSuc[i].aling
          , size: HeaderSuc[i].size
          , text: HeaderSuc[i].text
        }

        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

      // AGREGO LA INFORMACIÓN DEL CLIENTE
      const OCustomerData = await this.customersServ.CGetCustomerByIDPromise( sale.data.idCustomer );

      if( OCustomerData != null ){

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "CLIENTE: " + OCustomerData.lastName + " " + OCustomerData.name }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "DIRECCIÓN: " + OCustomerData.address }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "TELEFONO: " + OCustomerData.tel }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

      // AGREGO LA INFORMACIÓN DELA OPERACIÓN
      if( sale != null ){

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "OPERACIÓN: "
        + ( sale.data.idSaleType == "1" ? "Abono al crédito #" : sale.data.idSaleType == "2" ? "Pago de la venta #" : sale.data.idSaleType == "3" ? "Abono al apartado #" : "Pago al #" ) +  sale.data.idSale }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "FECHA: " + sale.dataPayments[0].createDateString }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "# PAGO", iWith: 25 }
      oLines.push( oLine );
      var oLine: any = { aling: "Center", size: 5, style: "Bold", text: "FORMA DE PAGO", iWith: 45 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 5, style: "Bold", text: "PAGO", iWith: 30 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      var dataPayments = [];

      if(type == "RePayment"){
        dataPayments = sale.dataPayments.filter( ( item: any ) => item.idPayment === idPayment);
      }
      else{
        dataPayments = sale.dataPayments;
      }

      for(var i = 0; i < iPayments; i++){

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: dataPayments[i].idPayment, iWith: 20 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, text: ( dataPayments[i].fxRate > 0 ?
          dataPayments[i].formaPagoDesc + '(' + USDollar.format( dataPayments[i].pagoF ) + ')'
          : dataPayments[i].formaPagoDesc ), iWith: 50 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, text: USDollar.format( dataPayments[i].pago ), iWith: 30 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }

      oLines = [];
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "PAGADO:", iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.data.pagado ), iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "PENDIENTE:", iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( sale.data.pendingAmount ), iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );


      // CONSTRUYO EL FOOTER
      // const FooterSuc = await this.sucursalesServ.CGetPrintTicketSuc( sale.data.idSucursal, "footer");

      // oLines = [];
      // var oLine: any = { aling: "Left", size: 7, text: " " }
      // oLines.push( oLine );
      // oLinesP.push( { oLines: oLines } );

      // for(var i = 0; i < FooterSuc.length; i++){

      //   oLines = [];

      //   var oLine: any = {
      //     aling: FooterSuc[i].aling
      //     , size: FooterSuc[i].size
      //     , text: FooterSuc[i].text
      //   }

      //   oLines.push( oLine );
      //   oLinesP.push( { oLines: oLines } );
      // }

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 7, text: "GRACIAS POR SU PAGO" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );
      oLines = [];
      var oLine: any = { aling: "Center", size: 7, text: "CONSERVE SU TICKET PARA ACLARACIONES" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

    }
    else if(type == "CorteCaja"){

      var idCorteCaja = idRelation;

      const oCorteCaja = await this.salesServ.CGetCorteCajaByIDPromise( idCorteCaja );

      console.log( oCorteCaja )

      const HeaderSuc = await this.sucursalesServ.CGetPrintTicketSuc( oCorteCaja.data.idSucursal, "Header");

      var oLines: any = [];

      for(var i = 0; i < HeaderSuc.length; i++){

        oLines = [];

        var oLine: any = {
          aling: HeaderSuc[i].aling
          , size: HeaderSuc[i].size
          , text: HeaderSuc[i].text
        }

        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }


      if( oCorteCaja != null ){

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "OPERACIÓN: Corte de Caja" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "Folio: #" + idCorteCaja }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "FECHA: " + oCorteCaja.data.createDateString }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "CREADO POR: " + oCorteCaja.data.createUserName }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, style: "Bold", text: "INGRESOS:", iWith: 100 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "VENTA:", iWith: 33 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "TALLER:", iWith: 33 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "INGRESO TOTAL:", iWith: 34 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.sales ), iWith: 33 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.tallerSales ), iWith: 33 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.ingresoTotal ), iWith: 34 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "EGRESOS:", iWith: 50 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "INGRESO TOTAL:", iWith: 50 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.egresos ), iWith: 50 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.ingresoReal ), iWith: 50 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, style: "Bold", text: "DESGLOSE SISTEMA", iWith: 50 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 7, style: "Bold", text: "EXISTENCIA EN CAJA", iWith: 50 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "PESOS", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.pesos ), iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "PESOS", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.pesosCaja ), iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "DÓLARES (TC: "+ oCorteCaja.data.fxRate +")", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.dolares ), iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "DÓLARES", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.dolaresCaja ), iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "VOUCHERS", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.vouchers ), iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "VOUCHERS", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.vouchersCaja ), iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "TRANSFER", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.transferencias ), iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "TRANSFER", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.transferenciasCaja ), iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: " ", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: " ", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "DIFERENCIA", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( oCorteCaja.data.diferencia ), iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );


        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "SI CUADRÓ", iWith: 50 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: "NO CUADRÓ", iWith: 50 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: ( oCorteCaja.data.bCuadro == 1 ? "X" : " " ), iWith: 50 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 7, style: "Bold", text: ( oCorteCaja.data.bCuadro == 2 ? "X" : " " ), iWith: 50 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, style: "Bold", text: "COMENTARIOS:", iWith: 100 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, style: "Bold", text: oCorteCaja.data.observaciones, iWith: 100 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        const oEgresos = await this.salesServ.CGetEgresosByIDCorteCaja( idCorteCaja );

        console.log(oEgresos)

        if( oEgresos.data.length > 0 ){

          oLines = [];
          var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
          oLines.push( oLine );
          oLinesP.push( { oLines: oLines } );

          oLines = [];
          var oLine: any = { aling: "Left", size: 7, style: "Bold", text: "LISTA DE EGRESOS:", iWith: 100 }
          oLines.push( oLine );
          oLinesP.push( { oLines: oLines } );

          oLines = [];
          var oLine: any = { aling: "Center", size: 10, text: " " }
          oLines.push( oLine );
          oLinesP.push( { oLines: oLines } );

          oLines = [];
          var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "# EGRESO", iWith: 20 }
          oLines.push( oLine );
          var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "DESCRIPCIÓN", iWith: 50 }
          oLines.push( oLine );
          var oLine: any = { aling: "Right", size: 5, style: "Bold", text: "MONTO", iWith: 30 }
          oLines.push( oLine );
          oLinesP.push( { oLines: oLines } );

          for(var i = 0; i < oEgresos.data.length; i++){

            oLines = [];
            var oLine: any = { aling: "Left", size: 7, text: oEgresos.data[i].idEgreso, iWith: 20 }
            oLines.push( oLine );
            var oLine: any = { aling: "Left", size: 7, text: oEgresos.data[i].description, iWith: 50 }
            oLines.push( oLine );
            var oLine: any = { aling: "Right", size: 7, text: USDollar.format( oEgresos.data[i].amount ), iWith: 30 }
            oLines.push( oLine );
            oLinesP.push( { oLines: oLines } );

          }

        }

      }



    }
    else if(type == "Egreso"){

      const egreso = await this.salesServ.CGetEgresoByIDPromise( idRelation );

      console.log(egreso);

      // CONSTRUYO EL HEADER
      const HeaderSuc = await this.sucursalesServ.CGetPrintTicketSuc( egreso.data.idSucursal, "Header");

      var oLines: any = [];

      for(var i = 0; i < HeaderSuc.length; i++){

        oLines = [];

        var oLine: any = {
          aling: HeaderSuc[i].aling
          , size: HeaderSuc[i].size
          , text: HeaderSuc[i].text
        }

        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

      // AGREGO LA INFORMACIÓN DELA OPERACIÓN
      if( egreso != null ){

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "OPERACIÓN: EGRESO #" +  egreso.data.idEgreso }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "FECHA: " + egreso.data.createDateString }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 5, style: "Bold", text: "DESCRIPCIÓN", iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 5, style: "Bold", text: "MONTO", iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, style: "Bold", text: egreso.data.description, iWith: 75 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: USDollar.format( egreso.data.amount ), iWith: 25 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 7, text: "---------------------------------------------------- " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 7, text: "FIRMA DE QUIEN EXPIDE" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 7, text: " " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 7, text: "---------------------------------------------------- " }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Center", size: 7, text: "FIRMA DE QUIEN RECIBE" }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

    }
    else if(type == "ConsHistory"){

      const sale = await this.salesServ.CGetSaleByIDPromise( idRelation );

      // CONSTRUYO EL HEADER
      const HeaderSuc = await this.sucursalesServ.CGetPrintTicketSuc( sale.data.idSucursal, "Header");

      var oLines: any = [];

      for(var i = 0; i < HeaderSuc.length; i++){

        oLines = [];

        var oLine: any = {
          aling: HeaderSuc[i].aling
          , size: HeaderSuc[i].size
          , text: HeaderSuc[i].text
        }

        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );
      }

      var OConsHistory = await this.salesServ.CGetConsHistoryPromise( idRelation );

      OConsHistory.data.rows[0].createDateString

      // AGREGO LA INFORMACIÓN DELA OPERACIÓN
      if( OConsHistory != null ){

        oLines = [];
        var oLine: any = { aling: "Center", size: 7, text: "OPERACIÓN: Movimientos de #" +  sale.data.idSale }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "PRODUCTO", iWith: 25 }
        oLines.push( oLine );
        var oLine: any = { aling: "Center", size: 6, style: "Bold", text: "CANT", iWith: 10 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "DESCRIPCIÓN", iWith: 40 }
        oLines.push( oLine );
        var oLine: any = { aling: "Left", size: 6, style: "Bold", text: "FECHA", iWith: 25 }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        for(var i = 0; i < OConsHistory.data.rows.length; i++){

          var oConsHistoryLine = OConsHistory.data.rows[i];

          oLines = [];
          var oLine: any = { aling: "Left", size: 7, text: oConsHistoryLine.name, iWith: 25 }
          oLines.push( oLine );
          var oLine: any = { aling: "Center", size: 7, text: oConsHistoryLine.consCantidad, iWith: 10 }
          oLines.push( oLine );
          var oLine: any = { aling: "Left", size: 7, text: oConsHistoryLine.description, iWith: 40 }
          oLines.push( oLine );
          var oLine: any = { aling: "Left", size: 7, text: oConsHistoryLine.createDateString, iWith: 25 }
          oLines.push( oLine );

          oLinesP.push( { oLines: oLines } );

        }

      }

    }
    else if(type == "DineroElectronico"){

      // AGREGO LA INFORMACIÓN DEL CLIENTE
      const OCustomerData = await this.customersServ.CGetCustomerByIDPromise( idRelation );

      if( OCustomerData != null ){

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "CLIENTE: " + OCustomerData.lastName + " " + OCustomerData.name }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "DIRECCIÓN: " + OCustomerData.address }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: "TELEFONO: " + OCustomerData.tel }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Left", size: 7, text: " " }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

        oLines = [];
        var oLine: any = { aling: "Center", size: 10, text: "---------------------------------------------------------" }
        oLines.push( oLine );
        oLinesP.push( { oLines: oLines } );

      }


      oLines = [];
      var oLine: any = { aling: "Left", size: 7, style: "Bold", text: "DESCRIPCIÓN", iWith: 60 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 7, style: "Bold", text: "SALDO", iWith: 40 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

      oLines = [];
      var oLine: any = { aling: "Left", size: 9, text: 'Dinero Electrónico', iWith: 60 }
      oLines.push( oLine );
      var oLine: any = { aling: "Right", size: 9, text: USDollar.format( iPayments ), iWith: 40 }
      oLines.push( oLine );
      oLinesP.push( { oLines: oLines } );

    }

    if(idPrinter > 0){

      var oPrinterData = await this.printersServ.CGetPrinterByIDPromise( idPrinter );

      if( oPrinterData.status == 0 && oLinesP.length > 0 ){

        let oPrinter: any = {
          printerName: oPrinterData.data.printerName,
          maxMargen: oPrinterData.data.maxMargen
        };

        let printParameters: any = {
          oPrinter: oPrinter,
          oLinesP: oLinesP
        }

        console.log(printParameters);

        //for( var pri = 0; pri < iCopy; pri++ ){
          bOK = await this.CPrintTicketAwait( oPrinterData.data._api, printParameters );
          bOK = await this.CPrintTicketAwait( oPrinterData.data._api, printParameters );
        //}

        return new Promise((resolve, reject) => {
          resolve( bOK )
        });

      }

    }


  }

  CPrintTicketAwait( _api:string, data : any ): Promise<any> {

    return new Promise((resolve, reject) => {

      this.http.post<ResponseGet>( `${ _api }/printTicket`, data)
      .subscribe({
        next: ( resp: ResponseGet ) => {
          resolve( resp );
        }
        , error: ( err: any ) => {
          reject( err );
        }
      });

    });

  }

}
