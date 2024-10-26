const { response } = require('express');
const bcryptjs = require('bcryptjs');

const { dbConnection } = require('../database/config');

const cbxGetCustomersCombo = async(req, res = response) => {

    const {
        search = ''

        , idUserLogON
        , idSucursalLogON

    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call cbxGetCustomersCombo( '${search}' )`)

        if(OSQL.length == 0){
        
                res.json({
                    status: 2,
                    message: "No se encontró información.",
                    data: null
                });
        
            }
            else{
        
                res.json({
                    status: 0,
                    message: "Ejecutado correctamente.",
                    data: OSQL
                });
        
            }

    }catch(error){
        
        res.json({
            status: 3,
            message: "Sucedió un error inesperado",
            data: error.message
        });
    }

};

const getClientsListWithPage = async(req, res = response) => {

    const {
        search = '', limiter = 10, start = 0
    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call getClientsListWithPage('${ search }',${ start },${ limiter })`)

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

const getClientByID = async(req, res = response) => {

  const {
      idClient
  } = req.body;

  console.log(req.body)
  var OSQL = await dbConnection.query(`call getClientByID(${ idClient })`)

  const iRows = ( OSQL.length > 0 ? OSQL[0].iRows: 0 );
      
  res.json({
      status:0,
      message:"Ejecutado correctamente.",
      data: OSQL
    });

};

const insertClient = async(req, res) => {
   
  console.log(req.body)
  const {
    name,
    address = '',
    tel = '',
    cel = ''
  } = req.body;

  try{

      var OSQL = await dbConnection.query(`call insertClient(
          '${name}'
          , '${address}'
          , '${tel}'
          , '${cel}'
          ,1
          )`)

      res.json({
          status:0,
          message:"Cliente guardado con éxito.",
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

const updateClient = async(req, res) => {
   
  console.log(req.body)
  const {
    idClient,
    name,
    address = '',
    tel = '',
    cel = ''
  } = req.body;

  try{

      var OSQL = await dbConnection.query(`call updateClient(
          ${idClient}  
          , '${name}'
          , '${address}'
          , '${tel}'
          , '${cel}'
          ,1
          )`)

      res.json({
          status:0,
          message:"Cliente actualizado con éxito.",
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

const deleteClient = async(req, res) => {
   
  console.log(req.body)
  const {
    idClient
  } = req.body;

  try{

      var OSQL = await dbConnection.query(`call deleteClient(
          ${idClient}
          )`)

      res.json({
          status:0,
          message:"Cliente eliminado con éxito.",
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

const getClientsToSale = async(req, res = response) => {

    try{

        var OSQL = await dbConnection.query(`call getClientsListWithPage('', 0, 9999)`)

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

            var ODataList = [];
            for(var i = 0; i < iRows; i++){

                var OData = {
                    'idClient': OSQL[i].idClient,
                    'name': OSQL[i].name
                };

                ODataList.push( OData )

            }

            console.log( ODataList )
            
            res.json({
                status:0,
                message:"Ejecutado correctamente.",
                data:{
                rows: ODataList
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

const cbxDireccionCliente = async(req, res = response) => {

    const {
        search = ''

        , idUserLogON
        , idSucursalLogON

    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call cbxDireccionCliente( '${search}' )`)

        if(OSQL.length == 0){
        
                res.json({
                    status: 2,
                    message: "No se encontró información.",
                    data: null
                });
        
            }
            else{
        
                res.json({
                    status: 0,
                    message: "Ejecutado correctamente.",
                    data: OSQL
                });
        
            }

    }catch(error){
        
        res.json({
            status: 3,
            message: "Sucedió un error inesperado",
            data: error.message
        });
    }

};

module.exports = {
    cbxGetCustomersCombo
    , getClientsListWithPage
    , getClientByID
    , insertClient
    , updateClient
    , deleteClient
    , getClientsToSale
    , cbxDireccionCliente
  }