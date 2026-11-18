const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { dbConnection } = require('../database/config');

// ─── Endurecimiento (heredado de AgroEnvases, análisis 032 y 060) ───────────
// Todo se configura por variable de entorno (ver `.example.env`) para que el
// mismo código sirva en el servidor público y en las instalaciones locales de
// cada sucursal, que se sirven desde la red interna con puertos distintos.

// Orígenes del Front cuando no se define CORS_ORIGINS. Salen de
// `front/angular.json` (`allowedHosts`) y del `ng serve` de desarrollo; los
// `apiUrl` de `front/src/environments/*.ts` NO son orígenes, son destinos.
const DEFAULT_CORS_ORIGINS = [
    'http://localhost:4200',
    'http://127.0.0.1:4200'
];

// Loopback y rangos privados (RFC1918) en cualquier puerto. Las instalaciones
// on-premise sirven el Front desde la misma máquina o desde otro equipo de la
// LAN de la sucursal, y ese puerto/IP no se conoce de antemano — por eso el
// default los acepta. En el despliegue expuesto a internet conviene apagarlo
// con CORS_ALLOW_LOCAL=false.
const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

const parseList = (value) =>
    (value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);

class Server{

    constructor(){
        this.app = express();        
        this.port = process.env.PORT;
        
        // Rutas por módulo. Cada análisis agrega las suyas (001: auth,
        // empresas, sucursales, usuarios…).
        this.paths = {
            health:          '/api/health',
            auth:            '/api/auth',
            sucursales:      '/api/sucursales',
            usuariosEmpresa: '/api/usuariosEmpresa',
            cuenta:          '/api/cuenta',
            global:          '/api/global',
            roles:           '/api/roles',
            configuracion:   '/api/configuracion',
            puestos:         '/api/puestos',
            departamentos:   '/api/departamentos',
            empleados:       '/api/empleados',
            // 005: proceso de marcaje y dispositivo checador
            dispositivos:    '/api/dispositivos',
            checador:        '/api/checador',
            faceid:          '/api/faceid',
            marcajes:        '/api/marcajes',
            formasChecado:   '/api/formasChecado',
            // 006: horarios y días programados
            horarios:        '/api/horarios',
            // 009: panel del superadministrador (su propio token, x-token-panel)
            panelAuth:       '/api/panel/auth',
            panelEmpresas:   '/api/panel/empresas',
            panelPlanes:     '/api/panel/planes',
            panelCobro:      '/api/panel/cobro',
            panelSoporte:    '/api/panel/soporte',
            panelConstantes: '/api/panel/constantes',
            panelBitacora:   '/api/panel/bitacora'
        }

        //Conectar a base de datos. Nunca rechaza: si MySQL no esta listo,
        //reintenta solo (analisis 060). El .catch es la red de seguridad.
        this.dbConnection().catch(error => console.error('dbConnection', error));
        
        //Middlewares
        this.middlewares();    
        
        //Rutas de mi app
        this.routes();

        //404 + handler final de errores (siempre al final)
        this.errorHandlers();

    }

    // Reintenta con espera creciente y no se rinde: un arranque con MySQL
    // todavia levantando (reinicio del servidor, deploy) debe conectarse solo
    // cuando la base vuelva, sin reiniciar el proceso. Base: Diprolim
    // (`models/server.js`), que se rendia a los 5 intentos.
    async dbConnection(intento = 1) {

        const ESPERAS_S = [2, 5, 10, 30];

        try {
            await dbConnection.authenticate();
            console.log('Database online');
        } catch (error) {
            const espera = ESPERAS_S[Math.min(intento - 1, ESPERAS_S.length - 1)];
            console.error(`[DB] Sin conexion a la base de datos (intento ${intento}): ${error.message}. Reintento en ${espera}s`);
            setTimeout(() => {
                this.dbConnection(intento + 1).catch(e => console.error('dbConnection', e));
            }, espera * 1000).unref();
        }

    }

    // ── CORS con origen restringido ──────────────────────────────────────────
    // Antes: cors() sin `origin` → Access-Control-Allow-Origin: * para todo
    // internet. Ahora solo responden los orígenes de la lista.
    corsOptions(){

        const configurados = parseList(process.env.CORS_ORIGINS);
        const permitidos   = configurados.length ? configurados : DEFAULT_CORS_ORIGINS;
        const permitirTodo = permitidos.includes('*');
        // Solo se apaga poniendo explícitamente CORS_ALLOW_LOCAL=false.
        const permitirLocal = String(process.env.CORS_ALLOW_LOCAL || '').toLowerCase() !== 'false';

        console.log('CORS — orígenes permitidos:', permitirTodo ? '* (abierto)' : permitidos.join(', '),
                    permitirLocal ? '+ loopback/LAN privada' : '');

        return {
            origin: (origin, callback) => {
                // Sin cabecera Origin: peticiones que no son de navegador
                // (curl, health checks, el nodo puente local, Postman). No hay
                // nada que proteger ahí — CORS solo aplica a navegadores.
                if (!origin)                              return callback(null, true);
                if (permitirTodo)                         return callback(null, true);
                if (permitidos.includes(origin))          return callback(null, true);
                if (permitirLocal && LOCAL_ORIGIN_REGEX.test(origin)) return callback(null, true);

                // callback(null, false) — no un Error: así la respuesta sale
                // sin cabecera CORS (el navegador la bloquea) en vez de un 500.
                console.warn(`CORS: origen rechazado → ${origin}`);
                return callback(null, false);
            },
            // Se conserva: el Front lee el nombre del archivo en descargas
            // binarias (ej. generarOrdenPago, XML/PDF de CFDI).
            exposedHeaders: ['Content-Disposition'],
            // allowedHeaders se deja por default (refleja Access-Control-
            // Request-Headers) para no romper el header `x-token` del Front.
            optionsSuccessStatus: 204
        };
    }

    middlewares(){

        // Detrás de Cloudflare/nginx todas las peticiones llegan con la IP del
        // proxy: sin esto el rate limit metería a todas las sucursales en el
        // mismo cubo. Solo se activa si TRUST_PROXY está definido (ej. `1`,
        // `true`, o una lista de IPs/CIDR de confianza).
        if (process.env.TRUST_PROXY) {
            const valor = process.env.TRUST_PROXY;
            this.app.set('trust proxy', /^\d+$/.test(valor) ? Number(valor) : valor);
        }

        // Cabeceras de seguridad. Es un API JSON, no sirve HTML propio
        // (salvo el index.html de /public), así que:
        //  - CSP apagada: no aplica a respuestas JSON y solo genera ruido.
        //    Si se activa, debe permitir `frame-src https://www.google.com`
        //    (mapa del modal de sucursal, análisis 015).
        //  - crossOriginResourcePolicy en 'cross-origin': el Front vive en otro
        //    origen y debe poder leer los archivos que sirve el API (descargas
        //    de XML/PDF y /public).
        this.app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' }
        }));

        // Compresión gzip de las respuestas (análisis 061). Los listados JSON
        // (reportes, cartera, pedidos con detalle) bajan a ~1/5 de su tamaño.
        // Queda FUERA el SSE de notificaciones: comprimirlo retiene los eventos
        // en el buffer del compresor y dejarían de llegar al instante.
        this.app.use(compression({
            filter: (req, res) => !req.path.startsWith('/api/notificaciones/stream')
                && compression.filter(req, res)
        }));

        //CORS — exponemos Content-Disposition para que el front pueda leer
        //el nombre de archivo en descargas binarias (ej. generarOrdenPago).
        this.app.use( cors( this.corsOptions() ));

        // El límite de intentos del login (por IP y por correo) va en
        // routes/auth.js, después de leer el body: helpers/limitadores.js.

        //Lectura y parse del body — con tope explícito. 1mb sobra: el payload
        //más grande del sistema es un pedido/solicitud con muchas líneas
        //(~300 bytes por línea) y ningún endpoint recibe archivos ni base64.
        this.app.use( express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }) );

        //Directorio público
        this.app.use(express.static('public'));
    }

    // ── Manejo de errores (después de las rutas) ─────────────────────────────
    errorHandlers(){

        // 404 en formato del proyecto, no el HTML de express.
        this.app.use((req, res) => res.status(404).json({
            status_code: 1,
            message: 'Recurso no encontrado',
            data: null
        }));

        // Handler final: JSON body inválido, payload demasiado grande y
        // cualquier excepción que se escape de un controlador. Nunca devuelve
        // el objeto de error ni el stack (hallazgo 18 de la auditoría).
        // eslint-disable-next-line no-unused-vars
        this.app.use((error, req, res, next) => {
            console.error('Error no controlado:', error);

            if (error?.type === 'entity.too.large') {
                return res.status(413).json({
                    status_code: 1,
                    message: 'La información enviada excede el tamaño permitido',
                    data: null
                });
            }

            if (error instanceof SyntaxError && 'body' in error) {
                return res.status(400).json({
                    status_code: 1,
                    message: 'El cuerpo de la petición no es un JSON válido',
                    data: null
                });
            }

            return res.status(500).json({
                status_code: 2,
                message: 'Sucedió un error inesperado',
                data: null
            });
        });
    }

    routes(){
        this.app.use(this.paths.health, require('../routes/health'));
        this.app.use(this.paths.auth, require('../routes/auth'));
        this.app.use(this.paths.sucursales, require('../routes/sucursales'));
        this.app.use(this.paths.usuariosEmpresa, require('../routes/usuariosEmpresa'));
        this.app.use(this.paths.cuenta, require('../routes/cuenta'));
        this.app.use(this.paths.global, require('../routes/global'));
        this.app.use(this.paths.roles, require('../routes/roles'));
        this.app.use(this.paths.configuracion, require('../routes/configuracion'));
        this.app.use(this.paths.puestos, require('../routes/puestos'));
        this.app.use(this.paths.departamentos, require('../routes/departamentos'));
        this.app.use(this.paths.empleados, require('../routes/empleados'));
        this.app.use(this.paths.dispositivos, require('../routes/dispositivos'));
        this.app.use(this.paths.checador, require('../routes/checador'));
        this.app.use(this.paths.faceid, require('../routes/faceid'));
        this.app.use(this.paths.marcajes, require('../routes/marcajes'));
        this.app.use(this.paths.formasChecado, require('../routes/formasChecado'));
        this.app.use(this.paths.horarios, require('../routes/horarios'));
        this.app.use(this.paths.panelAuth, require('../routes/panel/auth'));
        this.app.use(this.paths.panelEmpresas, require('../routes/panel/empresas'));
        this.app.use(this.paths.panelPlanes, require('../routes/panel/planes'));
        this.app.use(this.paths.panelCobro, require('../routes/panel/cobro'));
        this.app.use(this.paths.panelSoporte, require('../routes/panel/soporte'));
        this.app.use(this.paths.panelConstantes, require('../routes/panel/constantes'));
        this.app.use(this.paths.panelBitacora, require('../routes/panel/bitacora'));
    }

    listen(){

        this.app.listen( this.port, () =>{
            console.log(`Truck Manager API en el puerto ${ this.port }`);
        } );

        // Análisis 005: borra a diario las fotos de evidencia vencidas.
        require('../helpers/tareaFotosVencidas').programar();
        // Análisis 006: red de seguridad de los días programados, una vez al día por empresa.
        require('../helpers/tareaDiasProgramados').programar();
        // Análisis 009: conteo de empleados activos de cada empresa (cobro), cada hora.
        require('../helpers/panel/conteo').programar();
        // Análisis 009: elimina las empresas cuya baja ya venció, una vez al día.
        require('../helpers/panel/eliminacionEmpresa').programar();
    }
}


module.exports = Server;
