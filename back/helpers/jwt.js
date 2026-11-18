const jwt = require('jsonwebtoken');

// Tipos de token:
//   'sesion'    { uid, e, v, ve }  12 h. e = idEmpresa, v = versión de la
//               cuenta, ve = versión del acceso a la empresa.
//   'seleccion' { uid, v }         5 min. Solo sirve para escoger empresa.
// Panel del superadministrador (009). Viajan en `x-token-panel`, salvo el de
// soporte, que es una sesión de empresa y viaja en `x-token`:
//   'panel2fa'  { sa, v }          5 min. Solo sirve para mandar el código.
//               sa = idSuperadmin, v = versión de la cuenta.
//   'panel'     { sa, v }          `panel.sesion_minutos` (lo pasa quien lo emite).
//   'soporte'   { sa, e, ss }      `soporte.sesion_minutos`. e = idEmpresa,
//               ss = idSesionSoporte.
const DURACION = { sesion: '12h', seleccion: '5m', panel2fa: '5m' };

/** `duracion`: minutos (número) o texto de jsonwebtoken ('12h'); sin ella, la del tipo. */
const generarToken = (tipo, datos, duracion = DURACION[tipo]) => {
    if (!duracion) throw new Error(`[jwt] El token "${ tipo }" necesita su duración`);
    return jwt.sign({ ...datos, t: tipo }, process.env.SECRETPRIVATEKEY, {
        expiresIn: typeof duracion === 'number' ? `${ duracion }m` : duracion
    });
};

/** Regresa el payload o null si la firma o la vigencia no son válidas. */
const leerToken = (token) => {
    try {
        return jwt.verify(token, process.env.SECRETPRIVATEKEY);
    } catch {
        return null;
    }
};

const tokenSesion = ({ idUsuario, idEmpresa, versionCuenta, versionAcceso }) =>
    generarToken('sesion', { uid: idUsuario, e: idEmpresa, v: versionCuenta, ve: versionAcceso });

const tokenPanel2fa = ({ idSuperadmin, versionSesion }) =>
    generarToken('panel2fa', { sa: idSuperadmin, v: versionSesion });

const tokenPanel = ({ idSuperadmin, versionSesion }, minutos) =>
    generarToken('panel', { sa: idSuperadmin, v: versionSesion }, minutos);

const tokenSoporte = ({ idSuperadmin, idEmpresa, idSesionSoporte }, minutos) =>
    generarToken('soporte', { sa: idSuperadmin, e: idEmpresa, ss: idSesionSoporte }, minutos);

module.exports = { generarToken, leerToken, tokenSesion, tokenPanel2fa, tokenPanel, tokenSoporte };
