const rateLimit = require('express-rate-limit');
const { normalizarCorreo, registrarBitacora } = require('./sesion');
const constantes = require('./constantes');
const { leerToken } = require('./jwt');

// Límite de intentos fallidos (heredado de AgroEnvases, análisis 032).
// Los aciertos NO cuentan: varias personas de una empresa salen por la misma
// IP (NAT). Como todo responde HTTP 200, el controlador marca el fallo en
// `res.locals.intentoFallido` y eso decide si el intento cuenta.

const respuesta = (minutos) => async (req, res) => {
    await registrarBitacora({ correo: normalizarCorreo(req.body?.correo) || '(sin correo)', ip: req.ip,
        resultado: 'BLOQUEADO', motivo: 'Límite de intentos fallidos' });
    return res.status(429).json({
        status_code: 1,
        message: `Demasiados intentos fallidos. Espera ${ minutos } minutos e intenta de nuevo.`,
        data: null
    });
};

const base = (minutos, max, extra = {}) => rateLimit({
    windowMs: minutos * 60 * 1000,
    limit: max,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => !res.locals.intentoFallido,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: respuesta(minutos),
    ...extra
});

const minIP = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MIN) || 5;
const minCorreo = Number(process.env.LOGIN_CORREO_WINDOW_MIN) || 15;

// Cuántos intentos: constantes del sistema (análisis 003), leídas en cada
// petición (con caché). La ventana en minutos sigue en .env porque el
// limitador la fija al arrancar.

/** Por IP: `sesion.intentos_por_ip` fallos (50) en 5 minutos. */
const limitePorIP = base(minIP, () => constantes.valorSeguro('sesion.intentos_por_ip', 50));

/** Por correo: `sesion.intentos_por_correo` fallos (8) en 15 minutos. Requiere el body ya leído. */
const limitePorCorreo = base(minCorreo, () => constantes.valorSeguro('sesion.intentos_por_correo', 8), {
    keyGenerator: (req) => `correo:${ normalizarCorreo(req.body?.correo) }`
});

// ── Dispositivo checador (análisis 005) ─────────────────────────────────────
// Igual que el login: cuentan solo los fallos (el controlador marca
// `res.locals.intentoFallido`). No escriben en bitacora_sesiones: no hay correo.

const bloqueoChecador = (minutos, texto) => (req, res) => res.status(429).json({
    status_code: 1,
    message: `${ texto } Espera ${ minutos } minutos e intenta de nuevo.`,
    data: { codigo: 'LIMITE_INTENTOS' }
});

const minVinculacion = Number(process.env.CHECADOR_VINCULACION_WINDOW_MIN) || 15;
const minDispositivo = Number(process.env.CHECADOR_DISPOSITIVO_WINDOW_MIN) || 5;

// Origen = IP. Solo fuera de producción y desde la misma máquina, las pruebas
// pueden fijar el origen con `x-origen-prueba` para no bloquear la IP de quien
// las corre (scripts/pruebas-checador.js).
const ES_LOOPBACK = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/;
const origenVinculacion = (req) => {
    const prueba = req.get('x-origen-prueba');
    if (prueba && process.env.NODE_ENV !== 'production' && ES_LOOPBACK.test(req.ip || '')) return `prueba:${ prueba.slice(0, 60) }`;
    return `vincular:${ rateLimit.ipKeyGenerator(req.ip || '') }`;
};

/** Vincular: `checador.intentos_vinculacion` códigos inválidos (10) por origen en 15 minutos. */
const limiteVinculacion = base(minVinculacion, () => constantes.valorSeguro('checador.intentos_vinculacion', 10), {
    keyGenerator: origenVinculacion,
    handler: bloqueoChecador(minVinculacion, 'Demasiados códigos inválidos desde este equipo.')
});

/** Checar: `checador.intentos_por_dispositivo` fallos (40) por dispositivo en 5 minutos. Va después de validarDispositivo. */
const limitePorDispositivo = base(minDispositivo, (req) => constantes.valorSeguro('checador.intentos_por_dispositivo', 40, req), {
    keyGenerator: (req) => `dispositivo:${ req.idEmpresa }:${ req.idDispositivo }`,
    handler: bloqueoChecador(minDispositivo, 'Demasiados intentos fallidos en este dispositivo.')
});

// ── Panel del superadministrador (análisis 009) ─────────────────────────────
// Más estricto que el login de las empresas y con sus propias constantes.
// Cuentan los fallos de contraseña y de código. El intento bloqueado queda en
// bitacora_sesiones con motivo "Panel".

const minPanel = Number(process.env.PANEL_LOGIN_WINDOW_MIN) || 15;

// Igual que el checador: solo fuera de producción y desde la misma máquina,
// `x-origen-prueba` separa los contadores de las pruebas (scripts/pruebas-panel.js
// y pruebas-fuga.js) para no bloquear la IP ni la cuenta demo de quien las corre.
const origenPanel = (req) => {
    const prueba = req.get('x-origen-prueba');
    return prueba && process.env.NODE_ENV !== 'production' && ES_LOOPBACK.test(req.ip || '') ? `prueba:${ prueba.slice(0, 60) }:` : '';
};

const bloqueoPanel = async (req, res) => {
    await registrarBitacora({ correo: normalizarCorreo(req.body?.correo) || '(panel)', ip: req.ip,
        resultado: 'BLOQUEADO', motivo: 'Panel · Límite de intentos fallidos' });
    return res.status(429).json({
        status_code: 1,
        message: `Demasiados intentos fallidos. Espera ${ minPanel } minutos e intenta de nuevo.`,
        data: { codigo: 'LIMITE_INTENTOS' }
    });
};

/** Panel por IP: `panel.intentos_por_ip` fallos (10) en 15 minutos. */
const limitePanelPorIP = base(minPanel, () => constantes.valorSeguro('panel.intentos_por_ip', 10), {
    keyGenerator: (req) => `panel-ip:${ origenPanel(req) || rateLimit.ipKeyGenerator(req.ip || '') }`,
    handler: bloqueoPanel
});

/** Panel por correo (login): `panel.intentos_por_correo` fallos (5) en 15 minutos. Requiere el body ya leído. */
const limitePanelPorCorreo = base(minPanel, () => constantes.valorSeguro('panel.intentos_por_correo', 5), {
    keyGenerator: (req) => `panel-correo:${ origenPanel(req) }${ normalizarCorreo(req.body?.correo) }`,
    handler: bloqueoPanel
});

/** Panel por cuenta (código): la misma constante, por la cuenta del token `panel2fa` (x-token-panel). */
const limitePanelPorCuenta = base(minPanel, () => constantes.valorSeguro('panel.intentos_por_correo', 5), {
    keyGenerator: (req) => {
        const p = leerToken(req.header('x-token-panel'));
        return `panel-cuenta:${ origenPanel(req) }${ p?.t === 'panel2fa' && p.sa ? p.sa : 'sin-token' }`;
    },
    handler: bloqueoPanel
});

module.exports = {
    limitePorIP, limitePorCorreo, limiteVinculacion, limitePorDispositivo,
    limitePanelPorIP, limitePanelPorCorreo, limitePanelPorCuenta
};
