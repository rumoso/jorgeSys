require('dotenv').config();

// El proceso corre en UTC a propósito (ARQUITECTURA §7): cada sucursal tiene
// su propia zona horaria, así que la fecha de negocio nunca sale del reloj
// del proceso sino de la zona de la sucursal (helper de zona, análisis 003).
process.env.TZ = 'UTC';

// Errores que escapan de todo try/catch (de AgroEnvases, análisis 060): una
// promesa rechazada se registra y el proceso sigue; una excepción síncrona
// deja el proceso en estado incierto, así que se registra y se sale para que
// pm2 lo levante limpio.
process.on('unhandledRejection', (reason) => {
    console.error(`[unhandledRejection] ${ new Date().toISOString() }`, reason);
});
process.on('uncaughtException', (error) => {
    console.error(`[uncaughtException] ${ new Date().toISOString() }`, error);
    process.exit(1);
});

const Server = require('./models/server');

new Server().listen();
