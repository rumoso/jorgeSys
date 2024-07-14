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

    var OSQLCargaDescargas = await dbConnection.query(`call getCargasDescargasListWithPage(${ idFlete }, '', 0, 100)`)
  
    res.json({
        status: OSQL.length > 0 ? 0 : 1,
        message:"Ejecutado correctamente.",
        data: OSQL.length > 0 ? OSQL[0] : null,
        OSQLCargaDescargas: OSQLCargaDescargas
      });
  
  };

module.exports = {
    saveFlete
    , getFletesListWithPage
    , getFleteByID
  }