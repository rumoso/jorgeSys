// =============================================================================
// Entrada al panel del superadministrador (análisis 009), en dos pasos:
//   1. POST /api/panel/auth/login { correo, password } → token `panel2fa` (5 min)
//   2. POST /api/panel/auth/verificar2fa { codigo }, con el token `panel2fa`
//      en `x-token-panel` → token `panel` (panel.sesion_minutos)
// Mismo mensaje si falla el correo, la contraseña o el código. Cada intento
// queda en bitacora_sesiones (motivo "Panel") y cada entrada en
// bitacora_producto.
// =============================================================================

const bcrypt = require('bcryptjs');
const { db, QueryTypes } = require('../../helpers/db');
const { leerToken, tokenPanel2fa, tokenPanel } = require('../../helpers/jwt');
const { normalizarCorreo, registrarBitacora } = require('../../helpers/sesion');
const constantes = require('../../helpers/constantes');
const totp = require('../../helpers/panel/totp');
const bitacoraProducto = require('../../helpers/panel/bitacoraProducto');
const { cuentaVigente, datosSuperadmin, sesionPanelInvalida } = require('../../helpers/panel/sesion');

const MSG_DATOS = 'Correo, contraseña o código incorrectos';
// Para comparar aunque el correo no exista: tarda lo mismo que uno real.
const HASH_FALSO = bcrypt.hashSync('panel-sin-cuenta', 10);

const fallo = (res, message = MSG_DATOS) => {
    res.locals.intentoFallido = true;
    return res.json({ status_code: 1, message, data: null });
};

const bitacora = (correo, ip, resultado, detalle = null) =>
    registrarBitacora({ correo, ip, resultado, motivo: detalle ? `Panel · ${ detalle }` : 'Panel' });

/** POST /api/panel/auth/login { correo, password } */
const login = async (req, res) => {
    const correo = normalizarCorreo(req.body.correo);
    try {
        const [cuenta] = await db.panelAcceso.query(`
            SELECT idSuperadmin, passwordHash, bActivo, versionSesion, totpSecreto
              FROM superadmins WHERE correo = :correo`, { replacements: { correo } });

        const coincide = bcrypt.compareSync(String(req.body.password || ''), cuenta?.passwordHash || HASH_FALSO);
        if (!cuenta || !coincide) {
            await bitacora(correo, req.ip, 'FALLO', 'Credenciales');
            return fallo(res);
        }
        // Desactivada o sin segundo factor: el mismo mensaje (no se revela nada).
        if (!cuenta.bActivo || !cuenta.totpSecreto) {
            await bitacora(correo, req.ip, 'FALLO', cuenta.bActivo ? 'Sin segundo factor' : 'Cuenta desactivada');
            return fallo(res);
        }

        return res.json({
            status_code: 0,
            message: 'Escribe el código de tu app de autenticación',
            data: { token2fa: tokenPanel2fa(cuenta) }
        });
    } catch (error) {
        console.error('panel/login', error);
        return res.json({ status_code: 2, message: 'No fue posible iniciar sesión en el panel', data: null });
    }
};

/** POST /api/panel/auth/verificar2fa { codigo } con el token `panel2fa` en x-token-panel. */
const verificar2fa = async (req, res) => {
    const p = leerToken(req.header('x-token-panel'));
    if (!p || p.t !== 'panel2fa' || !p.sa) {
        res.locals.intentoFallido = true;
        return sesionPanelInvalida(res, 'El tiempo para escribir el código terminó. Vuelve a entrar.');
    }
    try {
        const cuenta = await cuentaVigente(p.sa, p.v);
        if (!cuenta) {
            res.locals.intentoFallido = true;
            return sesionPanelInvalida(res, 'El tiempo para escribir el código terminó. Vuelve a entrar.');
        }

        // Desde aquí la cuenta es conocida (token firmado): db.panel ya aplica.
        req.idSuperadmin = Number(cuenta.idSuperadmin);
        req.superadmin = datosSuperadmin(cuenta);

        const paso = totp.verificar(totp.descifrar(cuenta.totpSecreto), req.body.codigo, cuenta.totpUltimoPaso);
        if (paso === null) {
            await bitacora(cuenta.correo, req.ip, 'FALLO', 'Código');
            return fallo(res);
        }

        const minutos = await constantes.valor('panel.sesion_minutos');
        const token = tokenPanel(cuenta, minutos);

        const aceptado = await db.transaccion(async (t) => {
            // Atómico: dos peticiones con el mismo código no entran las dos.
            const [, n] = await db.panel(req).query(`
                UPDATE superadmins SET totpUltimoPaso = :paso, ultimoAcceso = :ahora
                 WHERE idSuperadmin = :id AND (totpUltimoPaso IS NULL OR totpUltimoPaso < :paso)`, {
                replacements: { paso, ahora: new Date(), id: req.idSuperadmin }, type: QueryTypes.UPDATE, transaction: t });
            if (!n) return false;
            await bitacoraProducto.registrar(req, { accion: 'ENTRADA', despues: { sesionMinutos: minutos } }, t);
            return true;
        });
        if (!aceptado) {
            await bitacora(cuenta.correo, req.ip, 'FALLO', 'Código repetido');
            return fallo(res);
        }

        await bitacora(cuenta.correo, req.ip, 'OK');
        return res.json({
            status_code: 0,
            message: `Bienvenido, ${ cuenta.nombre }`,
            data: { token, sesionMinutos: minutos, superadmin: req.superadmin }
        });
    } catch (error) {
        console.error('panel/verificar2fa', error);
        return res.json({ status_code: 2, message: 'No fue posible verificar el código', data: null });
    }
};

/** GET /api/panel/auth/getSesion (validarPanel) */
const getSesion = async (req, res) => {
    try {
        return res.json({ status_code: 0, message: 'Sesión del panel vigente', data: { superadmin: req.superadmin } });
    } catch (error) {
        console.error('panel/getSesion', error);
        return res.json({ status_code: 2, message: 'No fue posible leer la sesión del panel', data: null });
    }
};

module.exports = { login, verificar2fa, getSesion };
