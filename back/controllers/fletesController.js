const { response } = require('express');
const bcryptjs = require('bcryptjs');
const moment = require('moment');

const { dbConnection } = require('../database/config');

const saveFlete = async(req, res) => {
   
  const {
    idFlete = 0,
    titulo = '',
    idCliente = 0,
    guia = '',
    cartaPorte = '',
    bFacturado = false,
    active = true,

    idUserLogON
  } = req.body;

  const oGetDateNow = moment().format('YYYY-MM-DD HH:mm:ss');

  try{

      var OSQL = await dbConnection.query(`call saveFlete(
        '${ oGetDateNow }'  
        , ${ idFlete }
        , '${ titulo }'
        , ${ idCliente }
        , '${ guia }'
        , '${ cartaPorte }'
        , ${ bFacturado }
        , ${ idUserLogON }
        , ${ active }
        )`)

      res.json({
          status: OSQL[0].out_id > 0 ? 0 : 1,
          message: OSQL[0].message, //"Flete guardado con éxito.",
          insertID: OSQL[0].out_id
      });
      
  }catch(error){
      
      res.status(500).json({
          status:2,
          message:"Sucedió un error inesperado",
          data:error
      });
  }
}

const getFletesListWithPage = async(req, res = response) => {

    const {
        createDateStart = '',
        createDateEnd = '',
        titulo = '',
        guia = '',
        cartaPorte = '',

        idCliente = 0,

        limiter = 10,
        start = 0
    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call getFletesListWithPage(
            '${ createDateStart }'
            ,'${ createDateEnd }'
            ,'${ idCliente }'
            ,'${ titulo }'
            ,'${ guia }'
            ,'${ cartaPorte }'
            
            ,${ start }
            ,${ limiter }
            )`)

        if(OSQL.length == 0){

            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                count: 0,
                rows: null
                }
            });

        }
        else{

            const iRows = ( OSQL.length > 0 ? OSQL[0].iRows: 0 );
            
            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                count: iRows,
                rows: OSQL
                }
            });
            
        }
        
    }catch(error){
      
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
};

const getFleteByID = async(req, res = response) => {

    const {
        idFlete
    } = req.body;
  
    console.log(req.body)
    var OSQL = await dbConnection.query(`call getFleteByID(${ idFlete })`)

    var OSQLCargaDescargas = await dbConnection.query(`call getCargasDescargas(${ idFlete })`)

    // const salt = bcryptjs.genSaltSync(10);

    // console.log(bcryptjs.hashSync( 'Tijuana.2024', salt ))
  
    res.json({
        status: OSQL.length > 0 ? 0 : 1,
        message:"Ejecutado correctamente.",
        data: OSQL.length > 0 ? OSQL[0] : null,
        OSQLCargaDescargas: OSQLCargaDescargas
      });
  
};

const save_cargas_repartos = async(req, res) => {
   
    const {
        idFlete = 0,
        idCargaReparto = 0,
        idCliente = 0,
        idDireccionCliente = 0,
        fechaCita = '',
        horaCita = '',
        idConductor = 0,
        idUnidad = 0,
        apoyo = '',
        tChep = 0,
        tBlanca = 0,
        tAgranel = 0,
    
        idUserLogON
    } = req.body;
  
    const oGetDateNow = moment().format('YYYY-MM-DD HH:mm:ss');
  
    try{

            if(!validarHora(horaCita)){
                return res.json({
                    status: 1,
                    message: 'Formato de hora incorrecto'
                });
            }


            var justfechaCita = "";
            if(fechaCita.length > 0){
                justfechaCita = fechaCita.substring(0,10);
            }

            var time24h = "";

            if(horaCita.length > 0){
                time24h = moment(horaCita, 'h:mm A').format('HH:mm:ss');
            }

            console.log( time24h )
  
            var OSQL = await dbConnection.query(`call save_cargas_repartos(
            '${ oGetDateNow }'
            , ${ idCargaReparto }
            , ${ idFlete }
            , ${ idCliente }
            , ${ idDireccionCliente }
            , '${ justfechaCita }'
            , '${ horaCita }'
            , ${ idConductor }
            , ${ idUnidad }
            , '${ apoyo }'
            , ${ tChep }
            , ${ tBlanca }
            , ${ tAgranel }
            , ${ idUserLogON }
          )`)

          console.log( OSQL )
  
        res.json({
            status: OSQL[0].out_id > 0 ? 0 : 1,
            message: OSQL[0].message,
            insertID: OSQL[0].out_id
        });
        
    }catch(error){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
}

const getCargasDescargas = async(req, res = response) => {

    const {
        idFlete = 0
    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call getCargasDescargas(
            ${ idFlete }
            )`)

        if(OSQL.length == 0){

            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                count: 0,
                rows: null
                }
            });

        }
        else{

            const iRows = ( OSQL.length > 0 ? OSQL[0].iRows: 0 );

            for( var i = 0; i < OSQL.length; i++ ){
                var oData = OSQL[i];
                OSQL[i].foliosList = await dbConnection.query(`call app_getFoliosByReparto(
                    ${ oData.idCargaReparto }
                    )`)
            }

            console.log( OSQL );
            
            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                    count: iRows,
                    rows: OSQL
                }
            });
            
        }
        
    }catch(error){
      
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
};

const app_getCargasDescargasByChofer = async(req, res = response) => {

    const {
        idConductor = 0
    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call app_getCargasDescargasByChofer(
            ${ idConductor }
            )`)

        if(OSQL.length == 0){

            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                count: 0,
                rows: null
                }
            });

        }
        else{

            const iRows = ( OSQL.length > 0 ? OSQL[0].iRows: 0 );
            
            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                    count: iRows,
                    rows: OSQL
                }
            });
            
        }
        
    }catch(error){
      
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
};

const app_insertCargaDescargaMovimiento = async(req, res) => {
   
    const {
        idCargaReparto,
        idMovimientoType,
        latGPS,
        longGPS,
  
        idUserLogON
    } = req.body;
  
    const oGetDateNow = moment().format('YYYY-MM-DD HH:mm:ss');
  
    try{
  
        var OSQL = await dbConnection.query(`call app_insertCargaDescargaMovimiento(
          '${ oGetDateNow }'  
          , ${ idCargaReparto }
          , ${ idMovimientoType }
          , '${ latGPS }'
          , '${ longGPS }'
          , ${ idUserLogON }
          )`)
  
        res.json({
            status: OSQL[0].out_id > 0 ? 0 : 1,
            message: OSQL[0].message, //"Flete guardado con éxito.",
            insertID: OSQL[0].out_id
        });
        
    }catch(error){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
}

const app_getFoliosByReparto = async(req, res = response) => {

    const {
        idCargaReparto = 0
    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call app_getFoliosByReparto(
            ${ idCargaReparto }
            )`)

        if(OSQL.length == 0){

            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                count: 0,
                rows: null
                }
            });

        }
        else{

            const iRows = ( OSQL.length > 0 ? OSQL[0].iRows: 0 );
            
            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                    count: iRows,
                    rows: OSQL
                }
            });
            
        }
        
    }catch(error){
      
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
};

const app_insertFolio = async(req, res) => {
   
    const {
        idFolio = 0,
        idCargaReparto,
        folio = '',
        recibidoPor = '',
        scan = '',
        nota = '',
  
        idUserLogON
    } = req.body;
  
    const oGetDateNow = moment().format('YYYY-MM-DD HH:mm:ss');
  
    try{
  
        var OSQL = await dbConnection.query(`call app_insertFolio(
          '${ oGetDateNow }'  
          , ${ idFolio }
          , ${ idCargaReparto }
          , '${ folio }'
          , '${ recibidoPor }'
          , '${ scan }'
          , '${ nota }'
          , ${ idUserLogON }
          )`)
  
        res.json({
            status: OSQL[0].out_id > 0 ? 0 : 1,
            message: OSQL[0].message, //"Flete guardado con éxito.",
            insertID: OSQL[0].out_id
        });
        
    }catch(error){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
}

function validarHora(hora) {
    try {
        const formatos = ['HH:mm', 'HH:mm:ss'];
        return moment(hora, formatos, true).isValid();
      } catch (ex) {
        return false;
    }
}

const app_getFolioByID = async(req, res = response) => {

    const {
        idFolio
    } = req.body;
  
    var OSQL = await dbConnection.query(`call app_getFolioByID(${ idFolio })`)

    res.json({
        status: OSQL.length > 0 ? 0 : 1,
        message:"Ejecutado correctamente.",
        data: OSQL.length > 0 ? OSQL[0] : null
      });
  
};

const deleteFolio = async(req, res) => {
   
    const {
        idFolio,
  
        idUserLogON
    } = req.body;
  
    const oGetDateNow = moment().format('YYYY-MM-DD HH:mm:ss');
  
    try{
  
        var OSQL = await dbConnection.query(`call deleteFolio(
          ${ idFolio }
          )`)
  
        res.json({
            status: OSQL[0].out_id > 0 ? 0 : 1,
            message: OSQL[0].message, //"Flete guardado con éxito.",
            insertID: OSQL[0].out_id
        });
        
    }catch(error){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data:error
        });
    }
}

module.exports = {
    saveFlete
    , getFletesListWithPage
    , getFleteByID
    , save_cargas_repartos
    , getCargasDescargas

    , app_getCargasDescargasByChofer
    , app_insertCargaDescargaMovimiento
    , app_getFoliosByReparto
    , app_insertFolio
    , app_getFolioByID
    , deleteFolio
  }