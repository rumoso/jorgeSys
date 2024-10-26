const { response } = require('express');
const bcryptjs = require('bcryptjs');

const { dbConnection } = require('../database/config');

const cbxChoferesCombo = async(req, res = response) => {

    const {
        search = ''

        , idUserLogON
        , idSucursalLogON

    } = req.body;

    console.log(req.body)

    try{

        var OSQL = await dbConnection.query(`call cbxChoferesCombo( '${search}' )`)

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
    cbxChoferesCombo
  }