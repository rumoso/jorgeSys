#!/usr/bin/env node
// =============================================================================
// Pruebas de roles y permisos (análisis 002)
//     node scripts/instalar.js --demo --reiniciar   (deja todo como nuevo)
//     npm run dev                                   (en otra terminal)
//     npm run pruebas:permisos
// Deja los datos como los encontró.
// =============================================================================
const { ID, llamar, correo, entrar, sql, ejecutar, marcador } = require('./lib-pruebas');

const sinPermiso = (r) => r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO';

(async () => {
    const m = marcador();
    const id = async (c) => (await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo(c) }))[0].idUsuario;
    const rolA = async (plantilla) => (await sql('SELECT idRol FROM roles WHERE idEmpresa = :a AND plantilla = :p',
        { a: ID.A, p: plantilla }))[0].idRol;
    const [idAdminA, idContador, idEncargado] = [await id('admin.a'), await id('contador'), await id('encargado.a')];
    const [rAdmin, rRh, rEnc] = [await rolA('ADMINISTRADOR'), await rolA('RH'), await rolA('ENCARGADO')];

    const tA = await entrar('admin.a');
    const tC = await entrar('contador', ID.A);      // Recursos Humanos en A
    const tE = await entrar('encargado.a');         // Encargado en A
    const tS = await entrar('solo.b');              // Empleado en B
    // Lo que tiene el Encargado al empezar (005 le agrega marcajes_Revisar): se le regresa igual.
    const encOriginal = (await llamar('GET', `/roles/getPermisosRol?idRol=${ rEnc }`, { token: tA })).data;

    // ── Sin la acción, el API dice que no ──
    let r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tC, body: { nombre: 'X', zonaHoraria: 'America/Mexico_City' } });
    m.revisar('RH sin la acción no da de alta sucursales', sinPermiso(r), r.message);
    r = await llamar('GET', '/usuariosEmpresa/getUsuariosEmpresa', { token: tC });
    m.revisar('RH sin el menú Usuarios no los consulta', sinPermiso(r), r.message);
    r = await llamar('GET', '/roles/getRoles', { token: tE });
    m.revisar('el Encargado no consulta roles', sinPermiso(r), r.message);
    r = await llamar('GET', '/global/getMenu', { token: tS });
    m.revisar('el Empleado solo ve Hoy (más lo próximamente)',
        r.status_code === 0 && r.data.filter(g => !g.bloqueado).flatMap(g => g.items).map(i => i.menu).join() === 'hoy',
        JSON.stringify(r.data?.map(g => g.items.map(i => i.menu))));

    // ── Permisos directos: aplican en la siguiente petición, sin volver a entrar ──
    r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
        body: { idUsuario: idContador, menus: [], acciones: ['roles_Permisos', 'roles_CreateUpdate'] } });
    m.revisar('el administrador da permisos directos a RH', r.status_code === 0, r.message);
    r = await llamar('GET', '/roles/getRoles', { token: tC });
    m.revisar('→ RH ya consulta roles con la misma sesión (marcar la acción dio el menú)', r.status_code === 0, r.message);

    // ── Sin escalada ──
    r = await llamar('POST', '/roles/setPermisosRol', { token: tC,
        body: { idRol: rEnc, menus: ['asistencia', 'ausencias', 'horarios', 'empleados'], acciones: ['sucursales_Disable'] } });
    m.revisar('RH no puede dar una acción que no tiene', r.status_code === 1 && /no tienes/.test(r.message), r.message);
    // El administrador le da al Encargado el menú Usuarios, que RH no tiene.
    r = await llamar('POST', '/roles/setPermisosRol', { token: tA,
        body: { idRol: rEnc, menus: ['asistencia', 'ausencias', 'horarios', 'empleados', 'usuarios'], acciones: [] } });
    r = await llamar('POST', '/roles/setPermisosRol', { token: tC,
        body: { idRol: rEnc, menus: ['asistencia', 'ausencias', 'horarios', 'empleados'], acciones: [] } });
    m.revisar('RH no puede quitar un menú que él no tiene (Usuarios)', r.status_code === 1 && /no tienes/.test(r.message), r.message);
    r = await llamar('POST', '/roles/setPermisosRol', { token: tC,
        body: { idRol: rEnc, menus: ['asistencia', 'horarios', 'empleados', 'usuarios'], acciones: [] } });
    m.revisar('RH sí puede quitar uno que tiene (Ausencias) sin tocar el que no tiene', r.status_code === 0, r.message);
    r = await llamar('POST', '/roles/setPermisosRol', { token: tA,
        body: { idRol: rEnc, menus: encOriginal?.menus ?? ['asistencia', 'ausencias', 'horarios', 'empleados'], acciones: encOriginal?.acciones ?? [] } });
    m.revisar('el administrador deja al Encargado como estaba', r.status_code === 0, r.message);
    r = await llamar('POST', '/roles/insertUpdateRol', { token: tC, body: { nombre: `Copia admin ${ Date.now() }`, copiarDe: rAdmin } });
    m.revisar('RH no puede crear un rol copiando al Administrador', r.status_code === 1 && /no tienes/.test(r.message), r.message);
    r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tC,
        body: { idUsuario: idEncargado, menus: [], acciones: ['roles_Permisos'] } });
    m.revisar('RH sin "editar usuarios" no da permisos directos', sinPermiso(r), r.message);

    // ── El rol Administrador está protegido ──
    r = await llamar('PUT', '/roles/disableRol', { token: tA, body: { idRol: rAdmin, bActivo: false } });
    m.revisar('el Administrador no se desactiva', r.status_code === 1, r.message);
    r = await llamar('POST', '/roles/setPermisosRol', { token: tA, body: { idRol: rAdmin, menus: [], acciones: [] } });
    m.revisar('al Administrador no se le editan permisos', r.status_code === 1, r.message);
    r = await llamar('POST', '/roles/insertUpdateRol', { token: tA, body: { idRol: rAdmin, nombre: 'Jefe' } });
    m.revisar('el Administrador no se renombra', r.status_code === 1, r.message);

    // ── La empresa conserva al menos un administrador ──
    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tA,
        body: { idUsuario: idEncargado, roles: [rEnc, rAdmin], bTodasSucursales: true } });
    m.revisar('el administrador nombra otro administrador', r.status_code === 0, r.message);
    const tE2 = tE; // misma sesión: aplica en la siguiente petición
    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tE2,
        body: { idUsuario: idAdminA, roles: [], bTodasSucursales: true } });
    m.revisar('con dos administradores, uno puede quitarle el rol al otro', r.status_code === 0, r.message);
    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tE2,
        body: { idUsuario: idEncargado, roles: [rEnc], bTodasSucursales: true } });
    m.revisar('el último administrador no se puede quitar el rol', r.status_code === 1, r.message);
    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tE2,
        body: { idUsuario: idAdminA, roles: [rAdmin], bTodasSucursales: true } });
    m.revisar('se regresa el rol al administrador original', r.status_code === 0, r.message);
    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tA,
        body: { idUsuario: idEncargado, roles: [rEnc], bTodasSucursales: false, sucursales: (await sql(
            "SELECT idSucursal FROM sucursales WHERE idEmpresa = :a AND nombre = 'Norte'", { a: ID.A })).map(x => x.idSucursal) } });
    m.revisar('el Encargado vuelve a su rol y su sucursal', r.status_code === 0, r.message);

    // ── Acción nueva del producto ──
    await ejecutar("INSERT IGNORE INTO cat_acciones (accion, menu, etiqueta, orden) VALUES ('prueba_Nueva', 'roles', 'Acción de prueba', 99)");
    const pAdmin = await llamar('GET', `/roles/getPermisosRol?idRol=${ rAdmin }`, { token: tA });
    const pRh = await llamar('GET', `/roles/getPermisosRol?idRol=${ rRh }`, { token: tA });
    m.revisar('una acción nueva la tiene el Administrador y nadie más',
        pAdmin.data?.acciones.includes('prueba_Nueva') && !pRh.data?.acciones.includes('prueba_Nueva'), '');
    await ejecutar("DELETE FROM cat_acciones WHERE accion = 'prueba_Nueva'");

    // ── Módulo que se deja de contratar ──
    const tieneEmpresa = async () => (await llamar('GET', `/roles/getMenuDeRol?idRol=${ rRh }`, { token: tA }))
        .data.some(g => g.modulo === 'EMPRESA');
    const antes = await tieneEmpresa();
    await ejecutar("DELETE FROM empresas_modulos WHERE idEmpresa = :a AND modulo = 'EMPRESA'", { a: ID.A });
    const sin = await tieneEmpresa();
    const [guardados] = await sql('SELECT COUNT(*) AS n FROM roles_menus WHERE idEmpresa = :a AND idRol = :r AND menu = :m',
        { a: ID.A, r: rRh, m: 'sucursales' });
    await ejecutar("INSERT INTO empresas_modulos (idEmpresa, modulo) VALUES (:a, 'EMPRESA')", { a: ID.A });
    const despues = await tieneEmpresa();
    m.revisar('módulo no contratado: sus menús desaparecen y regresan al contratarlo', antes && !sin && despues, `${ antes } ${ sin } ${ despues }`);
    m.revisar('→ los permisos se conservan guardados mientras tanto', Number(guardados.n) === 1, String(guardados.n));

    // ── Quitar el permiso también aplica en la siguiente petición ──
    r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA, body: { idUsuario: idContador, menus: [], acciones: [] } });
    m.revisar('el administrador quita los permisos directos', r.status_code === 0, r.message);
    r = await llamar('GET', '/roles/getRoles', { token: tC });
    m.revisar('→ RH deja de consultar roles con la misma sesión', sinPermiso(r), r.message);

    // ── Bitácora ──
    r = await llamar('GET', '/roles/getBitacoraPermisos', { token: tA });
    const tipos = new Set((r.data || []).map(x => x.tipo));
    m.revisar('bitácora con permisos de rol, permisos directos y roles de usuario',
        ['ROL_PERMISOS', 'USUARIO_PERMISOS', 'USUARIO_ROLES'].every(t => tipos.has(t)), [...tipos].join(', '));

    await m.terminar('Pruebas de permisos');
})().catch(async (e) => { console.error('✘', e.message); process.exit(1); });
