const bcrypt = require('bcryptjs');
const { db } = require('../helpers/db');
const { generarToken, leerToken, tokenSesion } = require('../helpers/jwt');
const { normalizarCorreo, registrarBitacora, empresasDeUsuario, datosSesion } = require('../helpers/sesion');

const MSG_CREDENCIALES = 'Correo o contraseña incorrectos';
const MSG_SIN_EMPRESA = 'Tu cuenta no tiene acceso a ninguna empresa activa';
const MSG_SIN_ACCESO = 'No tienes acceso a esa empresa';

const fallo = (res, message, data = null) => {
    res.locals.intentoFallido = true;
    return res.json({ status_code: 1, message, data });
};

/** Emite el token de sesión de una empresa y regresa los datos de la sesión. */
const entrarAEmpresa = async (cuenta, empresa) => {
    const token = tokenSesion({
        idUsuario: cuenta.idUsuario,
        idEmpresa: empresa.idEmpresa,
        versionCuenta: cuenta.versionSesion,
        versionAcceso: empresa.vAcceso
    });
    const sesion = await datosSesion({ uid: cuenta.idUsuario, idEmpresa: empresa.idEmpresa });
    return { token, ...sesion };
};

/**
 * POST /api/auth/login { correo, password }
 *  - una empresa activa → token de sesión;
 *  - varias → token de selección (5 min) y la lista para escoger;
 *  - ninguna → mensaje (suspendida si es el caso).
 */
const login = async (req, res) => {
    const correo = normalizarCorreo(req.body.correo);
    const ip = req.ip;
    try {
        const [cuenta] = await db.global.query(`
            SELECT idUsuario, nombre, correo, passwordHash, bActivo, versionSesion
              FROM usuarios WHERE correo = :correo`, { replacements: { correo } });

        // Mismo mensaje si el correo no existe o la contraseña no coincide:
        // no se revela qué correos existen.
        if (!cuenta || !bcrypt.compareSync(String(req.body.password || ''), cuenta.passwordHash)) {
            await registrarBitacora({ correo, idUsuario: cuenta?.idUsuario, ip, resultado: 'FALLO', motivo: 'Credenciales' });
            return fallo(res, MSG_CREDENCIALES);
        }
        if (!cuenta.bActivo) {
            await registrarBitacora({ correo, idUsuario: cuenta.idUsuario, ip, resultado: 'FALLO', motivo: 'Cuenta desactivada' });
            return fallo(res, 'Tu cuenta está desactivada');
        }

        const todas = await empresasDeUsuario(cuenta.idUsuario);
        const activas = todas.filter(e => e.estado === 'ACTIVA');

        if (!activas.length) {
            const suspendida = todas.find(e => e.estado === 'SUSPENDIDA');
            // 009: en baja (periodo de gracia) o eliminada, con su propio mensaje.
            const deBaja = !suspendida && todas.find(e => ['EN_BAJA', 'ELIMINADA'].includes(e.estado));
            const message = suspendida
                ? `La empresa ${ suspendida.nombre } está suspendida. Comunícate con el proveedor del sistema.`
                : deBaja
                    ? `La empresa ${ deBaja.nombre } fue dada de baja. Comunícate con el proveedor del sistema.`
                    : MSG_SIN_EMPRESA;
            await registrarBitacora({ correo, idUsuario: cuenta.idUsuario, idEmpresa: (suspendida || deBaja)?.idEmpresa, ip,
                resultado: 'FALLO', motivo: suspendida ? 'Empresa suspendida' : deBaja ? 'Empresa dada de baja' : 'Sin empresa activa' });
            return fallo(res, message);
        }

        if (activas.length === 1) {
            const data = await entrarAEmpresa(cuenta, activas[0]);
            await registrarBitacora({ correo, idUsuario: cuenta.idUsuario, idEmpresa: activas[0].idEmpresa, ip, resultado: 'OK' });
            return res.json({ status_code: 0, message: `Bienvenido, ${ cuenta.nombre }`, data: { seleccion: false, ...data } });
        }

        return res.json({
            status_code: 0,
            message: 'Escoge la empresa',
            data: {
                seleccion: true,
                tokenSeleccion: generarToken('seleccion', { uid: cuenta.idUsuario, v: cuenta.versionSesion }),
                usuario: { idUsuario: cuenta.idUsuario, nombre: cuenta.nombre, correo: cuenta.correo },
                empresas: activas.map(({ idEmpresa, nombre }) => ({ idEmpresa, nombre }))
            }
        });
    } catch (error) {
        console.error('login', error);
        return res.json({ status_code: 2, message: 'No fue posible iniciar sesión', data: null });
    }
};

/**
 * POST /api/auth/seleccionarEmpresa { idEmpresa }
 * Con el token de selección (después del login) o con uno de sesión
 * (cambiar de empresa). ÚNICA ruta que recibe un idEmpresa: solo escoge entre
 * las empresas a las que la cuenta ya tiene acceso activo.
 */
const seleccionarEmpresa = async (req, res) => {
    const p = leerToken(req.header('x-token'));
    if (!p || !['seleccion', 'sesion'].includes(p.t) || !p.uid) {
        return res.status(401).json({ status_code: 1, message: 'Tu sesión terminó. Vuelve a entrar.', data: { codigo: 'SESION_INVALIDA' } });
    }
    const idEmpresa = Number(req.body.idEmpresa);
    try {
        const [cuenta] = await db.global.query(`
            SELECT idUsuario, nombre, correo, bActivo, versionSesion FROM usuarios WHERE idUsuario = :uid`,
        { replacements: { uid: p.uid } });
        if (!cuenta || !cuenta.bActivo || Number(cuenta.versionSesion) !== Number(p.v)) {
            return res.status(401).json({ status_code: 1, message: 'Tu sesión terminó. Vuelve a entrar.', data: { codigo: 'SESION_INVALIDA' } });
        }

        const activas = (await empresasDeUsuario(cuenta.idUsuario)).filter(e => e.estado === 'ACTIVA');
        const empresa = activas.find(e => Number(e.idEmpresa) === idEmpresa);
        if (!empresa) {
            await registrarBitacora({ correo: cuenta.correo, idUsuario: cuenta.idUsuario, ip: req.ip,
                resultado: 'FALLO', motivo: 'Empresa sin acceso' });
            res.locals.intentoFallido = true;
            return res.json({
                status_code: 1,
                message: MSG_SIN_ACCESO,
                data: { codigo: 'SIN_ACCESO', empresas: activas.map(({ idEmpresa, nombre }) => ({ idEmpresa, nombre })) }
            });
        }

        const data = await entrarAEmpresa(cuenta, empresa);
        await registrarBitacora({ correo: cuenta.correo, idUsuario: cuenta.idUsuario, idEmpresa, ip: req.ip, resultado: 'OK',
            motivo: p.t === 'sesion' ? 'Cambio de empresa' : null });
        return res.json({ status_code: 0, message: `Entraste a ${ empresa.nombre }`, data });
    } catch (error) {
        console.error('seleccionarEmpresa', error);
        return res.json({ status_code: 2, message: 'No fue posible entrar a la empresa', data: null });
    }
};

/** GET /api/auth/getSesion (validarJWT) */
const getSesion = async (req, res) => {
    try {
        const data = await datosSesion(req);
        return res.json({ status_code: 0, message: 'Sesión vigente', data });
    } catch (error) {
        console.error('getSesion', error);
        return res.json({ status_code: 2, message: 'No fue posible leer la sesión', data: null });
    }
};

module.exports = { login, seleccionarEmpresa, getSesion };
