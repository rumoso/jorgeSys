#!/usr/bin/env node
// =============================================================================
// Pruebas de sesión (análisis 001): login, selector, invalidación, límites.
//     node scripts/instalar.js --demo --reiniciar   (deja todo como nuevo)
//     npm run dev                                   (en otra terminal)
//     npm run pruebas:sesion
// =============================================================================
const { ID, PASSWORD, llamar, correo, entrar, sql, ejecutar, marcador } = require('./lib-pruebas');

const MSG = 'Correo o contraseña incorrectos';
const login = (c, password = PASSWORD) => llamar('POST', '/auth/login', { body: { correo: c, password } });

(async () => {
    const m = marcador();
    const [contador] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('contador') });
    const [adminA] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('admin.a') });
    const [encargado] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('encargado.a') });

    // ── Credenciales ──
    let r = await login(`no.existe.${ Date.now() }@demo.test`);
    m.revisar('correo inexistente → mensaje único', r.status_code === 1 && r.message === MSG, r.message);
    r = await login(correo('encargado.a'), 'equivocada');
    m.revisar('contraseña equivocada → el mismo mensaje', r.status_code === 1 && r.message === MSG, r.message);
    r = await login('  ENCARGADO.A@Demo.Test ');
    m.revisar('el correo se compara en minúsculas y sin espacios', r.status_code === 0, r.message);

    // ── Una, varias o ninguna empresa ──
    r = await login(correo('admin.a'));
    m.revisar('una empresa → entra directo con token', r.status_code === 0 && !r.data.seleccion && !!r.data.token
        && r.data.empresa?.idEmpresa === ID.A, r.message);
    r = await login(correo('contador'));
    m.revisar('varias empresas → pide escoger', r.status_code === 0 && r.data.seleccion && r.data.empresas.length === 2 && !r.data.token, r.message);
    const tSel = r.data.tokenSeleccion;
    r = await llamar('GET', '/sucursales/getSucursales', { token: tSel });
    m.revisar('el token de selección no sirve para consultar', r.http === 401, String(r.http));
    r = await llamar('POST', '/auth/seleccionarEmpresa', { token: tSel, body: { idEmpresa: ID.C } });
    m.revisar('escoger una empresa sin acceso → se rechaza', r.status_code === 1 && r.data?.codigo === 'SIN_ACCESO', r.message);
    r = await llamar('POST', '/auth/seleccionarEmpresa', { token: tSel, body: { idEmpresa: ID.B } });
    m.revisar('escoger la empresa B → token de B', r.status_code === 0 && r.data.empresa.idEmpresa === ID.B, r.message);
    r = await login(correo('sinempresa'));
    m.revisar('sin empresa activa → lo dice', r.status_code === 1 && /ninguna empresa activa/.test(r.message), r.message);
    r = await login(correo('suspendida'));
    m.revisar('empresa suspendida → lo dice', r.status_code === 1 && /suspendida/.test(r.message), r.message);

    // ── Cambio de empresa ──
    const tContA = await entrar('contador', ID.A);
    r = await llamar('POST', '/auth/seleccionarEmpresa', { token: tContA, body: { idEmpresa: ID.B } });
    m.revisar('cambiar de empresa con token de sesión → token nuevo', r.status_code === 0 && r.data.empresa.idEmpresa === ID.B, r.message);
    const tContB = r.data.token;

    // ── Sucursales permitidas ──
    const tEnc = await entrar('encargado.a');
    r = await llamar('GET', '/auth/getSesion', { token: tEnc });
    m.revisar('usuario con una sucursal: la sesión solo trae esa', r.data?.sucursales?.length === 1 && r.data.sucursales[0].nombre === 'Norte',
        JSON.stringify(r.data?.sucursales));
    r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tEnc, body: { nombre: 'X', zonaHoraria: 'America/Mexico_City' } });
    m.revisar('quien no es administrador no da de alta sucursales', r.status_code === 1, r.message);

    // ── Invalidación ──
    const tAdminB = await entrar('admin.b');
    r = await llamar('PUT', '/usuariosEmpresa/quitarAcceso', { token: tAdminB, body: { idUsuario: contador.idUsuario } });
    m.revisar('admin B quita el acceso al contador', r.status_code === 0, r.message);
    r = await llamar('GET', '/auth/getSesion', { token: tContB });
    m.revisar('→ la sesión del contador en B deja de servir', r.http === 401, String(r.http));
    r = await llamar('GET', '/auth/getSesion', { token: tContA });
    m.revisar('→ su sesión en A sigue viva', r.status_code === 0, r.message);
    const [rolAdminB] = await sql("SELECT idRol FROM roles WHERE idEmpresa = :b AND plantilla = 'ADMINISTRADOR'", { b: ID.B });
    r = await llamar('POST', '/usuariosEmpresa/darAcceso', { token: tAdminB, body: { correo: correo('contador'), roles: [rolAdminB.idRol] } });
    m.revisar('admin B le devuelve el acceso (cuenta existente)', r.status_code === 0 && r.data.creada === false, r.message);

    await ejecutar('UPDATE usuarios SET bActivo = 0, versionSesion = versionSesion + 1 WHERE idUsuario = :id', { id: encargado.idUsuario });
    r = await llamar('GET', '/auth/getSesion', { token: tEnc });
    m.revisar('desactivar la cuenta invalida su sesión', r.http === 401, String(r.http));
    r = await login(correo('encargado.a'));
    m.revisar('cuenta desactivada no entra', r.status_code === 1, r.message);
    await ejecutar('UPDATE usuarios SET bActivo = 1 WHERE idUsuario = :id', { id: encargado.idUsuario });

    // ── El administrador no se quita a sí mismo ──
    const tAdminA = await entrar('admin.a');
    r = await llamar('PUT', '/usuariosEmpresa/quitarAcceso', { token: tAdminA, body: { idUsuario: adminA.idUsuario } });
    m.revisar('el administrador no se quita el acceso', r.status_code === 1, r.message);
    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tAdminA,
        body: { idUsuario: adminA.idUsuario, roles: [], bTodasSucursales: true } });
    m.revisar('el único administrador no se quita el rol Administrador', r.status_code === 1, r.message);

    // ── Mi cuenta ──
    const tmp = 'Temporal-' + Date.now();
    r = await llamar('POST', '/cuenta/cambiarPassword', { token: tAdminA, body: { actual: 'equivocada', nueva: tmp } });
    m.revisar('cambiar contraseña con la actual equivocada → se rechaza', r.status_code === 1, r.message);
    r = await llamar('POST', '/cuenta/cambiarPassword', { token: tAdminA, body: { actual: PASSWORD, nueva: tmp } });
    const tNuevo = r.data?.token;
    m.revisar('cambiar contraseña → token nuevo', r.status_code === 0 && !!tNuevo, r.message);
    r = await llamar('GET', '/auth/getSesion', { token: tAdminA });
    m.revisar('→ el token anterior deja de servir', r.http === 401, String(r.http));
    r = await llamar('POST', '/cuenta/cambiarPassword', { token: tNuevo, body: { actual: tmp, nueva: PASSWORD } });
    m.revisar('→ con el token nuevo se regresa la contraseña original', r.status_code === 0, r.message);

    // ── Límite de intentos por correo ──
    const victima = `bloqueo.${ Date.now() }@demo.test`;
    let bloqueado = false;
    for (let i = 0; i < 12 && !bloqueado; i++) {
        r = await login(victima, 'equivocada');
        bloqueado = r.http === 429;
    }
    m.revisar('después de varios fallos con el mismo correo → bloqueado', bloqueado, `${ r.http } ${ r.message }`);

    // ── Bitácora ──
    const [b] = await sql(`SELECT SUM(resultado = 'OK') AS ok, SUM(resultado = 'FALLO') AS fallo, SUM(resultado = 'BLOQUEADO') AS bloq
                             FROM bitacora_sesiones WHERE fecha >= NOW() - INTERVAL 5 MINUTE`);
    m.revisar('bitácora con entradas correctas, fallidas y bloqueadas', b.ok > 0 && b.fallo > 0 && b.bloq > 0, JSON.stringify(b));

    await m.terminar('Pruebas de sesión');
})().catch(async (e) => { console.error('✘', e.message); process.exit(1); });
