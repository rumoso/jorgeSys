const express = require('express')
const cors = require('cors');

const { dbConnection } = require('../database/config');

class Server {

    constructor(){
        this.app = express();
        this.port = process.env.PORT;

        this.authPath = '/api/auth';
        this.customersPath = '/api/customers';
        this.fletesPath = '/api/fletes';
        this.choferesPath = '/api/choferes';
        this.unidadesPath = '/api/unidades';

        //CONEXION A LA BASE DE DATOS
        this.dbConnection();

        this.middlewares();

        this.routes();
    }

    async dbConnection() {
        try {

            await dbConnection.authenticate();
            console.log('Database online');

        } catch (err) {
            throw new Error( err );
        }
    }

    middlewares(){
        //CORS
        this.app.use( cors() );

        // LECTURA Y PARSEO DEL BODY
        this.app.use( express.json() );

        //DIRECTORIO PÚBLICO
        this.app.use( express.static('public') );
    }

    routes() {
        this.app.use(this.authPath, require('../routes/authRoute'));
        this.app.use(this.customersPath, require('../routes/customersRoute'));
        this.app.use(this.fletesPath, require('../routes/fletesRoute'));
        this.app.use(this.choferesPath, require('../routes/choferesRoute'));
        this.app.use(this.unidadesPath, require('../routes/unidadesRoute'));
    }

    listen() {
        this.app.listen( this.port, () => {
            console.log('Servidor corriendo en el puerto:', this.port );
        } );
    }

}

module.exports = Server;