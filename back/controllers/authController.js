const bcryptjs = require('bcryptjs');
const { response } = require('express');
const { json } = require('express/lib/response');

const { generarJWT } = require('../helpers/generar-jwt');

const User = require('../models/user');

const { dbConnection } = require('../database/config');

const login = async(req, res = response)=>{

    const {
        username
        ,pwd
    }= req.body;

    var OSQL = null;

    try{

        OSQL = await dbConnection.query(`call getUserByUserName('${ username }' )`);

        console.log(OSQL);

        if( OSQL.length == 0 ){
            return res.json({
                status:1,
                message:"Usuario / Password no son correctos",
                data:null
            })
        }
    
        var user = OSQL[0];

        //Si el usuario está activo
        if( !user.active ){
            return res.json({
                status:1,
                message:"Usuario / Password no son correctos",
                data:null
            })
        }

        //Verificar contraseña
        const validPassword = bcryptjs.compareSync(pwd, user.pwd);

        if(!validPassword){
            return res.json({
                status:1,
                message:"Usuario / Password no son correctos",
                data:null
            })
        }

        //Generar el JWT
        const token = await generarJWT( user.iduser );

        //const salt = bcryptjs.genSaltSync();
        //const token = bcryptjs.hashSync( '112501184', salt);

        res.json({
            status:0,
            message:"Conectado correctamente.",
            data:{
                user,
                token
            }            
        });
    }
    catch( error ){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data: OSQL
        });
    }
}

const app_login = async(req, res = response)=>{

    const {
        username
        ,pwd
    }= req.body;

    var OSQL = null;

    try{

        OSQL = await dbConnection.query(`call app_getUserByUserName('${ username }' )`);

        console.log(OSQL);

        if( OSQL.length == 0 ){
            return res.json({
                status:1,
                message:"Usuario / Password no son correctos",
                data:null
            })
        }
    
        var user = OSQL[0];

        //Si el usuario está activo
        if( !user.active ){
            return res.json({
                status:1,
                message:"Usuario / Password no son correctos",
                data:null
            })
        }

        //Verificar contraseña
        const validPassword = bcryptjs.compareSync(pwd, user.pwd);

        if(!validPassword){
            return res.json({
                status:1,
                message:"Usuario / Password no son correctos",
                data:null
            })
        }

        //Generar el JWT
        const token = await generarJWT( user.iduser );

        //const salt = bcryptjs.genSaltSync();
        //const token = bcryptjs.hashSync( '112501184', salt);

        res.json({
            status:0,
            message:"Conectado correctamente.",
            data:{
                user,
                token
            }            
        });
    }
    catch( error ){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            data: OSQL
        });
    }
}

const getMenuByPermissions = async(req, res = response)=>{

    const {
        idUser
    }= req.body;

    var OSQL = null;

    try{

        var OMenuList = [];

        OGetMenuFatherList = await dbConnection.query(`call getMenuFathersByPermission(${ idUser })`);

        //console.log(OGetMenuFatherList);

        if( OGetMenuFatherList.length == 0 ){
            return res.json({
                status:1,
                message:"No tiene permisos",
                data:null
            })
        }else{

            for(var i = 0; i < OGetMenuFatherList.length; i++){

                var oMenuFather = OGetMenuFatherList[i];

                var OMenu = {
                    'idMenu': oMenuFather.idMenu,
                    'lugar': oMenuFather.lugar,
                    'name': oMenuFather.name,
                    'icon': oMenuFather.icon,
                    'subMenus': []
                }

                OGetMenuDetailFatherList = await dbConnection.query(`call getMenuDetailsByPermission( ${ idUser }, ${ oMenuFather.idMenu } )`);
                
                var OSubMenus = [];
                for(var n = 0; n < OGetMenuDetailFatherList.length; n++){
                    //console.log(OGetMenuDetailFatherList[n])

                    var oGetMenuDetail = OGetMenuDetailFatherList[n];

                    var OMenuDetail = {
                        'idMenu': oGetMenuDetail.idMenu,
                        'idMenuPadre': oGetMenuDetail.idMenuPadre,
                        'lugar': oGetMenuDetail.lugar,
                        'name': oGetMenuDetail.name,
                        'description': oGetMenuDetail.description,
                        'icon': oGetMenuDetail.icon,
                        'linkCat': oGetMenuDetail.linkCat,
                        'linkList': oGetMenuDetail.linkList,
                        'imgDash': oGetMenuDetail.imgDash,
                        'imgDashSize': oGetMenuDetail.imgDashSize
                    };

                    OMenu.subMenus.push( OMenuDetail );
                }

                OMenuList.push(OMenu);
            }

            console.log( OMenuList )

            res.json({
                status:0,
                message:"Conectado correctamente.",
                data: OMenuList
            });

        }
        
    }
    catch( error ){
        
        res.status(500).json({
            status:2,
            message:"Sucedió un error inesperado",
            error: error.message,
            data: OSQL
        });
    }
}

module.exports={
    login
    , app_login
    , getMenuByPermissions
}