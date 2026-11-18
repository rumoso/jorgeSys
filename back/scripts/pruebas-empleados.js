#!/usr/bin/env node
// =============================================================================
// Pruebas de empleados, puestos y departamentos (análisis 004)
//     node scripts/instalar.js --demo --reiniciar   (deja todo como nuevo)
//     npm run dev                                   (en otra terminal)
//     npm run pruebas:empleados
// Todo lo que crea lo borra al final: se puede correr dos veces seguidas.
// =============================================================================
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { API, ID, llamar, entrar, sql, ejecutar, marcador, correo } = require('./lib-pruebas');
const { hoy, sumarDias } = require('../helpers/fechas');
const { precioVigente } = require('../helpers/empleados');
const { TABLAS_EMPRESA } = require('../helpers/tablasEmpresa');

const sinPermiso = (r) => r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO';

/** POST multipart con un archivo en el campo `archivo`. */
const subir = async (ruta, token, buffer, nombre, campos = {}, tipo = 'application/octet-stream') => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, String(v));
    fd.append('archivo', new Blob([buffer], { type: tipo }), nombre);
    for (let i = 0; i < 10; i++) {
        try {
            const r = await fetch(`${ API }${ ruta }`, { method: 'POST', headers: { 'x-token': token }, body: fd });
            return { http: r.status, ...(await r.json().catch(() => ({}))) };
        } catch (e) {
            if (i === 9) throw e;
            await new Promise(res => setTimeout(res, 1000));
        }
    }
};

/** GET que regresa binario: { http, tipo, buffer, json }. */
const bajar = async (ruta, token) => {
    const r = await fetch(`${ API }${ ruta }`, { headers: { 'x-token': token } });
    const tipo = r.headers.get('content-type') || '';
    const buffer = Buffer.from(await r.arrayBuffer());
    return { http: r.status, tipo, buffer, json: tipo.includes('json') ? JSON.parse(buffer.toString()) : null };
};

// PNG de 1×1 de verdad.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
    const m = marcador();
    const reqA = { idEmpresa: ID.A };
    const suc = async (idEmpresa, nombre) => (await sql(
        'SELECT idSucursal FROM sucursales WHERE idEmpresa = :e AND nombre = :n', { e: idEmpresa, n: nombre }))[0].idSucursal;
    const uid = async (c) => (await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo(c) }))[0].idUsuario;
    const [matriz, norte, bMatriz] = [await suc(ID.A, 'Matriz'), await suc(ID.A, 'Norte'), await suc(ID.B, 'Matriz')];
    const [idEncargado, idSoloB, idContador] = [await uid('encargado.a'), await uid('solo.b'), await uid('contador')];
    const emp = async (id) => (await sql('SELECT * FROM empleados WHERE idEmpleado = :id', { id }))[0];
    const empDemo = async (idEmpresa, numero) => (await sql(
        'SELECT * FROM empleados WHERE idEmpresa = :e AND numeroEmpleado = :n', { e: idEmpresa, n: numero }))[0];
    const juan = await empDemo(ID.A, '1');        // Matriz
    const pedro = await empDemo(ID.A, '3');       // Norte

    // Para dejar todo como estaba: lo nuevo es lo que pase de estos ids.
    const max = async (t, c) => Number((await sql(`SELECT COALESCE(MAX(${ c }), 0) AS n FROM ${ t }`))[0].n);
    const antes = {
        empleado: await max('empleados', 'idEmpleado'), puesto: await max('puestos', 'idPuesto'),
        departamento: await max('departamentos', 'idDepartamento'), bitacora: await max('bitacora_empleados', 'idBitacora'),
        sucursal: await max('sucursales', 'idSucursal')
    };
    const [{ n: empleadosAntes }] = await sql('SELECT COUNT(*) AS n FROM empleados');

    const tA = await entrar('admin.a');
    const tB = await entrar('admin.b');
    const tE = await entrar('encargado.a');          // solo Norte, solo el menú Empleados
    const creados = [];
    const alta = async (token, body) => {
        const r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token, body });
        if (r.status_code === 0) creados.push(r.data.id);
        return r;
    };
    const editar = (token, idEmpleado, cambios) => llamar('POST', '/empleados/insertUpdateEmpleado', { token, body: { idEmpleado, ...cambios } });
    const base = { nombre: 'Prueba', apellidoPaterno: 'Empleados', idSucursalPrincipal: matriz, fechaIngreso: '2025-01-01' };

    try {
        // ── Alta rápida y número ──
        let r = await llamar('GET', '/empleados/getSiguienteNumero', { token: tA });
        const siguiente = r.data?.numeroEmpleado;
        m.revisar('el siguiente número de A es el mayor numérico + 1 (8)', siguiente === '8', JSON.stringify(r.data));
        r = await alta(tA, { ...base, nombre: 'Alta', apellidoPaterno: 'Rápida', numeroEmpleado: '' });
        const idRapida = r.data?.id;
        const rapida = idRapida && await emp(idRapida);
        m.revisar('alta rápida con el número propuesto, operativa = principal y su primer periodo',
            r.status_code === 0 && rapida?.numeroEmpleado === siguiente && rapida.idSucursalOperativa === matriz
            && rapida.estado === 'ACTIVO' && (await sql('SELECT COUNT(*) AS n FROM empleados_periodos WHERE idEmpleado = :id', { id: idRapida }))[0].n === 1,
            r.message);
        r = await alta(tA, { ...base, nombre: 'Repite', numeroEmpleado: '1' });
        m.revisar('número repetido se rechaza', r.status_code === 1 && /ya es de otro empleado/.test(r.message), r.message);
        r = await alta(tA, { ...base, nombre: 'Repite', numeroEmpleado: '6' });
        m.revisar('→ también contra uno dado de baja', r.status_code === 1 && /dado de baja/.test(r.message), r.message);
        r = await alta(tA, { ...base, nombre: 'Mismo', apellidoPaterno: 'Número', numeroEmpleado: 'PRB-1' });
        const idPrbA = r.data?.id;
        const r2 = await alta(tB, { ...base, nombre: 'Mismo', apellidoPaterno: 'Número', numeroEmpleado: 'PRB-1', idSucursalPrincipal: bMatriz });
        m.revisar('el mismo número sí se puede en otra empresa', r.status_code === 0 && r2.status_code === 0, `${ r.message } / ${ r2.message }`);
        r = await alta(tA, { ...base, nombre: '', apellidoPaterno: 'Sin nombre' });
        m.revisar('sin nombre se rechaza', r.status_code === 1, r.message);
        r = await alta(tA, { ...base, fechaIngreso: '2025-02-30', nombre: 'Fecha', apellidoPaterno: 'Mala' });
        m.revisar('fecha de ingreso inválida se rechaza', r.status_code === 1 && /no es válida/.test(r.message), r.message);
        r = await alta(tA, { ...base, nombre: 'Curp', apellidoPaterno: 'Mala', curp: 'NO-ES-CURP' });
        m.revisar('CURP con formato inválido se rechaza', r.status_code === 1 && /CURP/.test(r.message), r.message);

        // ── Sucursal principal y operativa ──
        r = await editar(tA, idRapida, { idSucursalOperativa: norte });
        let e = await emp(idRapida);
        m.revisar('cambiar la operativa no cambia la principal ni regresa aviso',
            r.status_code === 0 && e.idSucursalOperativa === norte && e.idSucursalPrincipal === matriz && !r.data.avisoHorario, r.message);
        // Análisis 006: cambiar la principal pregunta antes qué pasa con el horario.
        r = await editar(tA, idRapida, { idSucursalPrincipal: norte });
        e = await emp(idRapida);
        m.revisar('cambiar la principal sin decir qué pasa con el horario pide confirmarlo',
            r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_HORARIO' && e.idSucursalPrincipal === matriz, r.message);
        r = await editar(tA, idRapida, { idSucursalPrincipal: norte, horarioAlCambiarSucursal: 'conservar' });
        e = await emp(idRapida);
        m.revisar('cambiar la principal sí regresa el aviso del horario',
            r.status_code === 0 && e.idSucursalPrincipal === norte && /horario/i.test(r.data.avisoHorario || ''), JSON.stringify(r.data));
        r = await editar(tA, idRapida, { nombre: 'Alta' });
        m.revisar('→ editar sin cambiar la principal no avisa', r.status_code === 0 && !r.data.avisoHorario, r.message);

        // ── Puesto al vuelo y catálogos ──
        r = await llamar('POST', '/puestos/insertUpdatePuesto', { token: tA, body: { nombre: '  Puesto   de Prueba ' } });
        const idPuesto = r.data?.id;
        m.revisar('puesto creado al vuelo (sin espacios de más)', r.status_code === 0 && r.data.nombre === 'Puesto de Prueba', r.message);
        r = await llamar('POST', '/puestos/insertUpdatePuesto', { token: tA, body: { nombre: 'puesto de prueba' } });
        m.revisar('→ nombre repetido (sin distinguir mayúsculas) se rechaza', r.status_code === 1 && r.data?.codigo === 'REPETIDO', r.message);
        r = await editar(tA, idRapida, { idPuesto });
        m.revisar('→ y se usa en un empleado', r.status_code === 0 && (await emp(idRapida)).idPuesto === idPuesto, r.message);
        r = await llamar('POST', '/departamentos/insertUpdateDepartamento', { token: tA, body: { nombre: 'Depto de Prueba' } });
        const idDepto = r.data?.id;
        r = await editar(tA, idRapida, { idDepartamento: idDepto });
        m.revisar('departamento creado al vuelo y usado', r.status_code === 0 && (await emp(idRapida)).idDepartamento === idDepto, r.message);
        r = await llamar('GET', '/puestos/getPuestos?estado=todos', { token: tA });
        m.revisar('getPuestos cuenta los empleados activos de cada uno',
            r.data?.find(p => p.id === idPuesto)?.empleados === 1, JSON.stringify(r.data?.find(p => p.id === idPuesto)));
        r = await llamar('PUT', '/puestos/disablePuesto', { token: tA, body: { id: idPuesto, bActivo: false } });
        const [pDes] = await sql('SELECT bActivo FROM puestos WHERE idPuesto = :id', { id: idPuesto });
        m.revisar('el puesto con empleados se desactiva, no se borra; el empleado lo conserva',
            r.status_code === 0 && pDes?.bActivo === 0 && (await emp(idRapida)).idPuesto === idPuesto, r.message);
        r = await alta(tA, { ...base, nombre: 'Puesto', apellidoPaterno: 'Inactivo', idPuesto });
        m.revisar('→ un puesto inactivo ya no se puede escoger', r.status_code === 1 && /inactivo/.test(r.message), r.message);
        r = await editar(tA, idRapida, { telefono: '6691234567' });
        m.revisar('→ quien ya lo tenía se edita sin problema', r.status_code === 0, r.message);
        r = await llamar('GET', '/puestos/getPuestos', { token: tE });
        m.revisar('el Encargado (menú Empleados) consulta los puestos', r.status_code === 0, r.message);
        r = await llamar('POST', '/puestos/insertUpdatePuesto', { token: tE, body: { nombre: 'No debe' } });
        m.revisar('→ pero no los crea', sinPermiso(r), r.message);

        // ── Precio por hora ──
        r = await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: idRapida, precioHora: 50, aPartirDe: '2025-01-01' } });
        m.revisar('precio 50 a partir del 2025-01-01', r.status_code === 0, r.message);
        await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: idRapida, precioHora: 60, aPartirDe: '2025-07-01' } });
        r = await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: idRapida, precioHora: '65.5', aPartirDe: '2025-07-01' } });
        r = await llamar('GET', `/empleados/getPreciosEmpleado?idEmpleado=${ idRapida }`, { token: tA });
        m.revisar('historial: con la misma fecha se reemplaza (2 precios, el último 65.50) con quién lo capturó',
            r.status_code === 0 && r.data.historial.length === 2 && r.data.historial[0].precioHora === 65.5
            && r.data.historial[0].capturo === 'Ana Administradora (A)', JSON.stringify(r.data?.historial));
        const pv = async (f) => (await precioVigente(reqA, idRapida, f))?.precioHora ?? null;
        m.revisar('precio vigente: antes de todo nada, en marzo 50, en agosto 65.50',
            (await pv('2024-12-31')) === null && (await pv('2025-03-01')) === 50 && (await pv('2025-08-01')) === 65.5
            && (await pv('2025-07-01')) === 65.5);
        for (const [v, re] of [[0, /mayor a cero/], [-5, /mayor a cero/], [20000, /no puede pasar/], ['abc', /Escribe/]]) {
            r = await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: idRapida, precioHora: v, aPartirDe: '2025-09-01' } });
            m.revisar(`precio ${ JSON.stringify(v) } se rechaza`, r.status_code === 1 && re.test(r.message), r.message);
        }
        r = await llamar('GET', `/empleados/getEmpleado?idEmpleado=${ idRapida }`, { token: tA });
        m.revisar('con el permiso, la ficha trae el precio vigente', r.data?.precioVigente?.precioHora === 65.5, JSON.stringify(r.data?.precioVigente));

        // Encargado con "crear y editar empleados", sin precio ni datos personales.
        r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
            body: { idUsuario: idEncargado, menus: [], acciones: ['empleados_CreateUpdate'] } });
        m.revisar('el administrador da al Encargado "crear y editar empleados"', r.status_code === 0, r.message);
        r = await llamar('GET', `/empleados/getEmpleado?idEmpleado=${ idRapida }`, { token: tE });
        m.revisar('sin empleados_Precio el precio no viaja en la ficha', r.status_code === 0 && !('precioVigente' in r.data), r.message);
        r = await llamar('GET', `/empleados/getPreciosEmpleado?idEmpleado=${ idRapida }`, { token: tE });
        m.revisar('→ ni en el historial', sinPermiso(r), r.message);
        r = await llamar('POST', '/empleados/setPrecioEmpleado', { token: tE, body: { idEmpleado: idRapida, precioHora: 1, aPartirDe: '2025-09-01' } });
        m.revisar('→ y no se puede cambiar', sinPermiso(r) && (await pv('2025-09-30')) === 65.5, r.message);

        // ── Datos personales ──
        r = await editar(tA, idRapida, { curp: 'loam900515mdfprr03', rfc: 'LOAM900515AB1', nss: '12345678901', fechaNacimiento: '1990-05-15' });
        e = await emp(idRapida);
        m.revisar('con el permiso se guardan CURP (en mayúsculas), RFC, NSS y nacimiento',
            r.status_code === 0 && e.curp === 'LOAM900515MDFPRR03' && e.rfc === 'LOAM900515AB1' && e.nss === '12345678901'
            && e.fechaNacimiento === '1990-05-15', r.message);
        r = await llamar('GET', `/empleados/getEmpleado?idEmpleado=${ idRapida }`, { token: tE });
        m.revisar('sin empleados_DatosPersonales el CURP, RFC, NSS y nacimiento no viajan',
            r.status_code === 0 && !['curp', 'rfc', 'nss', 'fechaNacimiento'].some(k => k in r.data), Object.keys(r.data || {}).join());
        r = await editar(tE, idRapida, { curp: 'XEXX010101HNEXXXA4', rfc: null, nss: null, telefono: '6690000000' });
        e = await emp(idRapida);
        m.revisar('→ ni se sobrescriben aunque vengan en el cuerpo (el resto sí se guarda)',
            r.status_code === 0 && e.curp === 'LOAM900515MDFPRR03' && e.rfc === 'LOAM900515AB1' && e.telefono === '6690000000', r.message);

        // ── Alcance: el Encargado (solo Norte) ──
        r = await llamar('GET', '/empleados/getEmpleados?porPagina=100', { token: tE });
        const nums = (r.data?.filas || []).map(f => f.numeroEmpleado);
        m.revisar('el Encargado ve a los de Norte (principal u operativa) y no a los de Matriz',
            r.status_code === 0 && nums.includes('3') && nums.includes('4') && nums.includes('5') && !nums.includes('1') && !nums.includes('2')
            && !nums.includes('7'), nums.join());
        r = await llamar('GET', `/empleados/getEmpleado?idEmpleado=${ juan.idEmpleado }`, { token: tE });
        m.revisar('→ ni llamando directo a getEmpleado de uno de Matriz ("no existe")', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await editar(tE, pedro.idEmpleado, { idSucursalPrincipal: matriz });
        m.revisar('→ ni puede mover a uno de Norte a Matriz', r.status_code === 1 && (await emp(pedro.idEmpleado)).idSucursalPrincipal === norte, r.message);
        r = await alta(tE, { ...base, nombre: 'Encargado', apellidoPaterno: 'EnMatriz' });
        m.revisar('→ ni dar de alta en Matriz', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('GET', '/empleados/getEmpleadosActivosEn?fecha=2026-01-01', { token: tE });
        const r3 = await llamar('GET', '/empleados/getEmpleadosActivosEn?fecha=2026-01-01', { token: tA });
        m.revisar('→ los activos en una fecha también cuentan solo su alcance', r.status_code === 0 && r.data.activos < r3.data.activos,
            `${ r.data?.activos } / ${ r3.data?.activos }`);
        r = await llamar('GET', '/empleados/getCatalogosEmpleado', { token: tE });
        m.revisar('→ en los catálogos solo aparece Norte', JSON.stringify(r.data?.sucursales?.map(s => s.nombre)) === '["Norte"]',
            JSON.stringify(r.data?.sucursales));

        // ── Búsqueda, filtros y paginado ──
        r = await llamar('GET', '/empleados/getEmpleados?q=gomez', { token: tA });
        m.revisar('búsqueda por nombre sin acentos (gomez → Gómez)', r.data?.filas?.some(f => f.numeroEmpleado === '3'), r.message);
        r = await llamar('GET', '/empleados/getEmpleados?q=PRB-1', { token: tA });
        m.revisar('búsqueda por número', r.data?.total === 1 && r.data.filas[0].idEmpleado === idPrbA, r.message);
        r = await llamar('GET', '/empleados/getEmpleados?estado=baja', { token: tA });
        m.revisar('filtro "dados de baja"', r.data?.filas?.length > 0 && r.data.filas.every(f => f.estado === 'BAJA'), r.message);
        r = await llamar('GET', `/empleados/getEmpleados?idPuesto=${ idPuesto }&idDepartamento=${ idDepto }`, { token: tA });
        m.revisar('filtro por puesto y departamento', r.data?.total === 1 && r.data.filas[0].idEmpleado === idRapida, r.message);
        r = await llamar('GET', `/empleados/getEmpleados?idSucursal=${ norte }`, { token: tA });
        m.revisar('filtro por sucursal (principal u operativa)', r.data?.filas?.some(f => f.numeroEmpleado === '5')
            && !r.data.filas.some(f => f.numeroEmpleado === '1'), r.message);
        r = await llamar('GET', '/empleados/getEmpleados?porPagina=5&pagina=2', { token: tA });
        m.revisar('paginado: 5 por página, página 2', r.data?.porPagina === 5 && r.data.pagina === 2 && r.data.filas.length > 0
            && r.data.filas.length <= 5 && r.data.total > 5, JSON.stringify({ ...r.data, filas: r.data?.filas?.length }));

        // ── Baja y reingreso ──
        r = await alta(tA, { ...base, nombre: 'Baja', apellidoPaterno: 'Reingreso', fechaIngreso: '2025-01-01', idSucursalPrincipal: norte });
        const idBaja = r.data?.id;
        const activos = async (f) => (await llamar('GET', `/empleados/getEmpleadosActivosEn?fecha=${ f }`, { token: tA })).data?.activos;
        const otros = async (f) => Number((await sql(`
            SELECT COUNT(DISTINCT idEmpleado) AS n FROM empleados_periodos
             WHERE idEmpresa = :a AND idEmpleado <> :id AND fechaIngreso <= :f AND (fechaBaja IS NULL OR fechaBaja >= :f)`,
        { a: ID.A, id: idBaja, f }))[0].n);
        const hoyNorte = hoy('America/Mazatlan');
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaBaja: '2024-12-31', motivoBaja: 'x' } });
        m.revisar('baja anterior al ingreso se rechaza', r.status_code === 1 && /anterior a su ingreso/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaBaja: sumarDias(hoyNorte, 1), motivoBaja: 'x' } });
        m.revisar('baja posterior a hoy (en la zona de su sucursal) se rechaza', r.status_code === 1 && /posterior a hoy/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaBaja: '2025-06-15', motivoBaja: '' } });
        m.revisar('baja sin motivo se rechaza', r.status_code === 1 && /motivo/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tE, body: { idEmpleado: idBaja, fechaBaja: '2025-06-15', motivoBaja: 'x' } });
        m.revisar('sin empleados_Baja no se da de baja', sinPermiso(r), r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaBaja: '2025-06-15', motivoBaja: 'Renuncia voluntaria' } });
        e = await emp(idBaja);
        m.revisar('baja con motivo: queda en BAJA y nunca se borra',
            r.status_code === 0 && e?.estado === 'BAJA' && e.fechaBaja === '2025-06-15' && e.motivoBaja === 'Renuncia voluntaria', r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaBaja: '2025-06-15', motivoBaja: 'x' } });
        m.revisar('→ dos veces de baja no se puede', r.status_code === 1 && /ya está dado de baja/.test(r.message), r.message);
        r = await llamar('GET', '/empleados/getEmpleados', { token: tA });
        m.revisar('→ deja de aparecer en la lista de activos', !r.data.filas.some(f => f.idEmpleado === idBaja));
        r = await llamar('POST', '/empleados/reingresoEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaIngreso: '2025-06-15' } });
        m.revisar('reingreso no posterior a la baja se rechaza', r.status_code === 1 && /posterior a su última baja/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/reingresoEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaIngreso: '2025-09-01' } });
        e = await emp(idBaja);
        const periodos = await sql('SELECT fechaIngreso, fechaBaja, motivoBaja FROM empleados_periodos WHERE idEmpleado = :id ORDER BY fechaIngreso', { id: idBaja });
        m.revisar('reingreso: el mismo empleado (mismo número), activo y con los dos periodos conservados',
            r.status_code === 0 && e.estado === 'ACTIVO' && e.fechaIngreso === '2025-09-01' && e.fechaBaja === null
            && periodos.length === 2 && periodos[0].fechaBaja === '2025-06-15' && periodos[0].motivoBaja === 'Renuncia voluntaria'
            && periodos[1].fechaBaja === null, JSON.stringify(periodos));
        r = await llamar('POST', '/empleados/reingresoEmpleado', { token: tA, body: { idEmpleado: idBaja, fechaIngreso: '2025-10-01' } });
        m.revisar('→ reingresar a uno activo no se puede', r.status_code === 1, r.message);
        const casos = [['2024-12-31', 0], ['2025-03-01', 1], ['2025-06-15', 1], ['2025-07-01', 0], ['2025-10-01', 1]];
        const vistos = [];
        for (const [f, suyo] of casos) vistos.push([f, await activos(f), (await otros(f)) + suyo]);
        m.revisar('getEmpleadosActivosEn antes, durante, el día de la baja, después y tras el reingreso',
            vistos.every(([, api, esperado]) => api === esperado), JSON.stringify(vistos));
        r = await llamar('GET', '/empleados/getEmpleadosActivosEn?fecha=2025-13-01', { token: tA });
        m.revisar('→ con una fecha inválida responde regla, no error', r.status_code === 1, r.message);

        // ── Duplicados ──
        r = await alta(tA, { ...base, nombre: 'juan', apellidoPaterno: 'PEREZ', apellidoMaterno: 'garcía' });
        m.revisar('duplicado por nombre (sin mayúsculas ni acentos): avisa con quién',
            r.status_code === 1 && r.data?.codigo === 'POSIBLE_DUPLICADO' && r.data.parecidos.some(p => p.numeroEmpleado === '1'), r.message);
        r = await alta(tA, { ...base, nombre: 'juan', apellidoPaterno: 'PEREZ', apellidoMaterno: 'garcía', confirmarDuplicado: true });
        m.revisar('→ y guarda al confirmar', r.status_code === 0, r.message);
        r = await alta(tA, { ...base, nombre: 'Otro', apellidoPaterno: 'Nombre', curp: 'PEGJ900101HDFRRN09' });
        m.revisar('duplicado por CURP: avisa', r.status_code === 1 && r.data?.codigo === 'POSIBLE_DUPLICADO'
            && r.data.parecidos.some(p => p.motivo === 'misma CURP'), r.message);
        r = await alta(tA, { ...base, nombre: 'Otro', apellidoPaterno: 'Nombre', curp: 'PEGJ900101HDFRRN09', confirmarDuplicado: true });
        m.revisar('→ y guarda al confirmar', r.status_code === 0, r.message);
        r = await alta(tA, { ...base, nombre: 'Ana', apellidoPaterno: 'Torres', apellidoMaterno: 'Vega' });
        m.revisar('→ el duplicado dice si el otro está de baja', r.data?.parecidos?.some(p => p.estado === 'BAJA'), JSON.stringify(r.data));

        // ── Usuario ligado ──
        r = await editar(tA, idRapida, { idUsuario: idContador });
        m.revisar('ligar un usuario de la empresa', r.status_code === 0 && (await emp(idRapida)).idUsuario === idContador, r.message);
        r = await editar(tA, idPrbA, { idUsuario: idContador });
        m.revisar('→ no se liga a dos empleados', r.status_code === 1 && /ya está ligado/.test(r.message), r.message);
        r = await editar(tA, idPrbA, { idUsuario: idSoloB });
        m.revisar('→ ni uno de otra empresa', r.status_code === 1 && /no existe en esta empresa/.test(r.message), r.message);
        r = await llamar('GET', '/empleados/getCatalogosEmpleado', { token: tA });
        m.revisar('→ y ya no aparece entre los usuarios por ligar', !r.data.usuarios.some(u => u.idUsuario === idContador), r.message);

        // ── Sucursal inactiva ──
        await ejecutar(`INSERT INTO sucursales (idEmpresa, nombre, zonaHoraria) VALUES (:a, 'Temporal Pruebas', 'America/Mexico_City')`, { a: ID.A });
        const temporal = await suc(ID.A, 'Temporal Pruebas');
        r = await alta(tA, { ...base, nombre: 'En', apellidoPaterno: 'Temporal', idSucursalPrincipal: temporal });
        const idTemporal = r.data?.id;
        await ejecutar('UPDATE sucursales SET bActivo = 0 WHERE idSucursal = :s', { s: temporal });
        r = await alta(tA, { ...base, nombre: 'Nuevo', apellidoPaterno: 'Temporal', idSucursalPrincipal: temporal });
        m.revisar('una sucursal inactiva no se puede escoger', r.status_code === 1 && /inactiva/.test(r.message), r.message);
        r = await editar(tA, idTemporal, { telefono: '5511112222' });
        m.revisar('→ quien ya la tenía la conserva al editarlo', r.status_code === 0 && (await emp(idTemporal)).idSucursalPrincipal === temporal, r.message);
        r = await llamar('GET', '/empleados/getEmpleados?q=Temporal', { token: tA });
        m.revisar('→ y la lista lo marca "por reubicar"', r.data?.filas?.find(f => f.idEmpleado === idTemporal)?.porReubicar === true, r.message);
        r = await editar(tA, idRapida, { idSucursalOperativa: temporal });
        m.revisar('→ tampoco se puede poner como operativa', r.status_code === 1 && /inactiva/.test(r.message), r.message);

        // ── Foto ──
        r = await subir('/empleados/setFotoEmpleado', tA, Buffer.from('esto no es una imagen'), 'foto.jpg', { idEmpleado: idRapida }, 'image/jpeg');
        m.revisar('foto: rechaza un archivo que no es imagen (aunque diga .jpg)', r.status_code === 1 && /no es una imagen/.test(r.message), r.message);
        const grande = Buffer.alloc(6 * 1024 * 1024, 0);
        grande[0] = 0xFF; grande[1] = 0xD8; grande[2] = 0xFF;
        r = await subir('/empleados/setFotoEmpleado', tA, grande, 'grande.jpg', { idEmpleado: idRapida }, 'image/jpeg');
        m.revisar('foto: rechaza una demasiado grande', r.status_code === 1 && /pesa más de/.test(r.message), r.message);
        r = await subir('/empleados/setFotoEmpleado', tA, PNG, 'foto.png', { idEmpleado: idRapida }, 'image/png');
        e = await emp(idRapida);
        const archivoFoto = e?.foto && path.join(__dirname, '..', 'almacen', 'empresas', String(ID.A), 'empleados', e.foto);
        m.revisar('foto: guarda un PNG fuera de public/, con nombre aleatorio',
            r.status_code === 0 && /^[a-f0-9]{32}\.png$/.test(e.foto || '') && fs.existsSync(archivoFoto), r.message);
        let b = await bajar(`/empleados/getFotoEmpleado?idEmpleado=${ idRapida }`, tA);
        m.revisar('→ se entrega con sesión (image/png, los mismos bytes)', b.tipo.startsWith('image/png') && b.buffer.equals(PNG), b.tipo);
        b = await bajar(`/empleados/getFotoEmpleado?idEmpleado=${ idRapida }`, null);
        m.revisar('→ sin sesión, no', b.http === 401 && !b.tipo.startsWith('image/'), `${ b.http } ${ b.tipo }`);
        const viejo = e.foto;
        r = await subir('/empleados/setFotoEmpleado', tA, PNG, 'otra.png', { idEmpleado: idRapida }, 'image/png');
        m.revisar('→ cambiarla borra el archivo anterior', r.status_code === 0 && !fs.existsSync(archivoFoto), r.message);
        r = await llamar('DELETE', `/empleados/deleteFotoEmpleado?idEmpleado=${ idRapida }`, { token: tA });
        m.revisar('→ quitarla deja al empleado sin foto', r.status_code === 0 && (await emp(idRapida)).foto === null, r.message);
        r = await subir('/empleados/setFotoEmpleado', tA, PNG, 'juan.png', { idEmpleado: juan.idEmpleado }, 'image/png');
        b = await bajar(`/empleados/getFotoEmpleado?idEmpleado=${ juan.idEmpleado }`, tE);
        m.revisar('→ el Encargado no ve la foto de uno de Matriz', b.json?.status_code === 1 && !b.tipo.startsWith('image/'), b.tipo);
        r = await subir('/empleados/setFotoEmpleado', tE, PNG, 'x.png', { idEmpleado: juan.idEmpleado }, 'image/png');
        m.revisar('→ ni se la cambia', r.status_code === 1 && /no existe/.test(r.message), r.message);
        await llamar('DELETE', `/empleados/deleteFotoEmpleado?idEmpleado=${ juan.idEmpleado }`, { token: tA });
        void viejo;

        // ── Alta masiva ──
        b = await bajar('/empleados/getPlantillaImportacion', tA);
        const plantilla = new ExcelJS.Workbook();
        await plantilla.xlsx.load(b.buffer);
        const hojaCat = plantilla.getWorksheet('Catálogos');
        const textoCat = [];
        hojaCat?.eachRow(row => row.eachCell(c => textoCat.push(String(c.value))));
        m.revisar('plantilla: encabezados, renglón de ejemplo y hoja con sucursales, puestos y departamentos',
            /spreadsheetml/.test(b.tipo) && plantilla.getWorksheet('Empleados')?.getRow(1).getCell(2).value === 'Nombre(s)'
            && plantilla.getWorksheet('Empleados').getRow(2).getCell(1).value === 'EJEMPLO'
            && ['Matriz', 'Norte', 'Operador', 'Producción'].every(x => textoCat.includes(x)) && !textoCat.includes('Temporal Pruebas'),
            textoCat.join());
        r = await llamar('GET', '/empleados/getPlantillaImportacion', { token: tE });
        m.revisar('→ sin empleados_Importar no hay plantilla', sinPermiso(r), r.message);

        const wb = new ExcelJS.Workbook();
        const hoja = wb.addWorksheet('Empleados');
        hoja.addRow(['Número de empleado', 'Nombre(s)', 'Apellido paterno', 'Apellido materno', 'Sucursal', 'Fecha de ingreso',
            'Puesto', 'Departamento', 'Teléfono', 'Correo', 'CURP', 'RFC', 'NSS', 'Fecha de nacimiento', 'Precio por hora']);
        const filas = [
            /* 2 */ ['EJEMPLO', 'No', 'Se carga', '', 'Matriz', '2026-01-15'],
            /* 3 */ ['IMP-1', 'Importado', 'Uno', '', 'Matriz', '2025-03-01', 'Montacarguista', 'Logística', '', '', '', '', '', '', 70],
            /* 4 */ ['IMP-2', 'Importado', 'Dos', '', 'norte', '15/03/2025', 'Operador', 'Producción'],
            /* 5 */ ['', 'Importado', 'Sin número', '', 'Matriz', new Date(Date.UTC(2025, 3, 1))],
            /* 6 */ ['IMP-R', 'Repetido', 'Uno', '', 'Matriz', '2025-03-01'],
            /* 7 */ ['IMP-R', 'Repetido', 'Dos', '', 'Matriz', '2025-03-01'],
            /* 8 */ ['1', 'Ya', 'Existe', '', 'Matriz', '2025-03-01'],
            /* 9 */ ['IMP-3', '', 'Sin nombre', '', 'Matriz', '2025-03-01'],
            /* 10 */ ['IMP-4', 'Sin', 'Sucursal', '', '', '2025-03-01'],
            /* 11 */ ['IMP-5', 'Sin', 'Fecha', '', 'Matriz', ''],
            /* 12 */ ['IMP-6', 'Sucursal', 'Inexistente', '', 'Plutón', '2025-03-01'],
            /* 13 */ ['IMP-7', 'Sucursal', 'Inactiva', '', 'Temporal Pruebas', '2025-03-01'],
            /* 14 */ ['IMP-8', 'Fecha', 'Inválida', '', 'Matriz', '2025-02-30'],
            /* 15 */ ['IMP-9', 'Datos', 'Malos', '', 'Matriz', '2025-03-01', '', '', '', '', 'CURPMALA', 'RFC-MALO', '123'],
            /* 16 */ ['IMP-10', 'Juan', 'Pérez', 'García', 'Matriz', '2025-03-01']
        ];
        for (const f of filas) hoja.addRow(f);
        const excel = Buffer.from(await wb.xlsx.writeBuffer());
        const [{ n: empleadosPrevios }] = await sql('SELECT COUNT(*) AS n FROM empleados WHERE idEmpresa = :a', { a: ID.A });
        r = await subir('/empleados/previsualizarImportacion', tA, Buffer.from('no es excel'), 'x.xlsx');
        m.revisar('importación: un archivo que no es Excel se rechaza', r.status_code === 1 && /Excel/.test(r.message), r.message);
        r = await subir('/empleados/previsualizarImportacion', tA, excel, 'empleados.xlsx');
        const v = r.data;
        const ren = (n) => v?.renglones?.find(x => x.renglon === n);
        const err = (n, re) => ren(n)?.errores?.some(x => re.test(x));
        m.revisar('vista previa: 14 renglones (el EJEMPLO no cuenta), 4 correctos y 10 con error',
            r.status_code === 0 && v.total === 14 && v.correctos === 4 && v.conError === 10, `${ r.message } ${ JSON.stringify(v?.renglones?.map(x => [x.renglon, x.errores])) }`);
        m.revisar('→ no guarda nada', (await sql('SELECT COUNT(*) AS n FROM empleados WHERE idEmpresa = :a', { a: ID.A }))[0].n === empleadosPrevios
            && !(await sql(`SELECT 1 FROM puestos WHERE idEmpresa = :a AND nombre = 'Montacarguista'`, { a: ID.A })).length);
        m.revisar('→ número repetido en el archivo (los dos renglones)', err(6, /repetido en el archivo/) && err(7, /repetido en el archivo/));
        m.revisar('→ número que ya existe en la empresa', err(8, /ya es de otro empleado/));
        m.revisar('→ nombre, sucursal y fecha faltantes', err(9, /Falta el nombre/) && err(10, /Falta la sucursal/) && err(11, /Falta la fecha/),
            JSON.stringify([ren(9)?.errores, ren(10)?.errores, ren(11)?.errores]));
        m.revisar('→ sucursal que no existe e inactiva', err(12, /"Plutón" no existe/) && err(13, /inactiva/),
            JSON.stringify([ren(12)?.errores, ren(13)?.errores]));
        m.revisar('→ fecha inválida', err(14, /no es válida/), JSON.stringify(ren(14)?.errores));
        m.revisar('→ CURP, RFC y NSS con formato inválido', err(15, /CURP/) && err(15, /RFC/) && err(15, /NSS/), JSON.stringify(ren(15)?.errores));
        m.revisar('→ puestos y departamentos que no existen: "se crearán"',
            JSON.stringify(v?.seCrearan) === JSON.stringify({ puestos: ['Montacarguista'], departamentos: ['Logística'] })
            && ren(3)?.ok && ren(3).avisos.some(a => /se creará/.test(a)), JSON.stringify(v?.seCrearan));
        m.revisar('→ posible duplicado: aviso, no error', ren(16)?.ok === true && ren(16).avisos.some(a => /Posible duplicado/.test(a)),
            JSON.stringify(ren(16)));
        m.revisar('→ fechas DD/MM/AAAA y de Excel; sucursal sin distinguir mayúsculas; número asignado',
            ren(4)?.ok && ren(4).fechaIngreso === '2025-03-15' && ren(5)?.ok && ren(5).fechaIngreso === '2025-04-01'
            && /^\d+$/.test(ren(5).numeroEmpleado), JSON.stringify([ren(4), ren(5)]));

        // Carga: los correctos + uno alterado a mano (debe volver a validarse y rechazarse).
        const correctos = v.renglones.filter(x => x.ok).map(x => ({ renglon: x.renglon, datos: x.datos }));
        const alterado = { renglon: 99, datos: { ...ren(3).datos, numeroEmpleado: '2', nombre: 'Alterado' } };
        r = await llamar('POST', '/empleados/importarEmpleados', { token: tA, body: { renglones: [...correctos, alterado], crearCatalogos: true } });
        const importados = await sql(`SELECT e.idEmpleado, e.numeroEmpleado, p.nombre AS puesto, d.nombre AS depto
            FROM empleados e LEFT JOIN puestos p ON p.idPuesto = e.idPuesto LEFT JOIN departamentos d ON d.idDepartamento = e.idDepartamento
            WHERE e.idEmpresa = :a AND e.idEmpleado > :max AND e.idEmpleado NOT IN (:creados)`, { a: ID.A, max: antes.empleado, creados: [0, ...creados] });
        creados.push(...importados.map(x => x.idEmpleado));
        const imp1 = importados.find(x => x.numeroEmpleado === 'IMP-1');
        m.revisar('carga: solo los correctos (4); el alterado se vuelve a validar y se rechaza',
            r.status_code === 0 && r.data.cargados === 4 && importados.length === 4
            && r.data.rechazados.length === 1 && r.data.rechazados[0].renglon === 99, `${ r.message } ${ JSON.stringify(r.data?.rechazados) }`);
        m.revisar('→ crea los catálogos que faltaban y los usa', imp1?.puesto === 'Montacarguista' && imp1.depto === 'Logística'
            && JSON.stringify(r.data.creados) === JSON.stringify({ puestos: ['Montacarguista'], departamentos: ['Logística'] }), JSON.stringify(imp1));
        m.revisar('→ con su periodo y su precio (a partir del ingreso)',
            (await sql('SELECT COUNT(*) AS n FROM empleados_periodos WHERE idEmpleado = :id', { id: imp1?.idEmpleado || 0 }))[0].n === 1
            && (await precioVigente(reqA, imp1?.idEmpleado || 0, '2025-03-01'))?.precioHora === 70);
        r = await llamar('POST', '/empleados/importarEmpleados', { token: tA, body: { renglones: correctos, crearCatalogos: true } });
        m.revisar('→ cargar dos veces el mismo archivo: todo se rechaza por número repetido',
            r.status_code === 0 && r.data.cargados === 0 && r.data.rechazados.length === 4, r.message);
        r = await llamar('POST', '/empleados/importarEmpleados', { token: tE, body: { renglones: correctos, crearCatalogos: true } });
        m.revisar('→ sin empleados_Importar no se carga', sinPermiso(r), r.message);

        // ── Bitácora ──
        const bit = await sql(`SELECT tipo, COUNT(*) AS n FROM bitacora_empleados
                                WHERE idEmpresa = :a AND idBitacora > :max GROUP BY tipo`, { a: ID.A, max: antes.bitacora });
        const n = (t) => Number(bit.find(x => x.tipo === t)?.n || 0);
        m.revisar('bitácora: alta, edición, baja, reingreso, sucursal principal y operativa, precio e importación',
            ['ALTA', 'EDICION', 'BAJA', 'REINGRESO', 'SUCURSAL_PRINCIPAL', 'SUCURSAL_OPERATIVA', 'PRECIO', 'IMPORTACION'].every(t => n(t) >= 1)
            && n('IMPORTACION') === 4, JSON.stringify(bit));
        const [cambioPrecio] = await sql(`SELECT antes, despues FROM bitacora_empleados
            WHERE idEmpleado = :id AND tipo = 'PRECIO' ORDER BY idBitacora DESC LIMIT 1`, { id: idRapida });
        const json = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
        m.revisar('→ el precio guarda el anterior y el nuevo', json(cambioPrecio?.antes)?.precioHora === '60.00'
            && json(cambioPrecio?.despues)?.precioHora === '65.50', JSON.stringify(cambioPrecio));
        const [edicion] = await sql(`SELECT antes, despues FROM bitacora_empleados
            WHERE idEmpleado = :id AND tipo = 'EDICION' AND JSON_UNQUOTE(JSON_EXTRACT(despues, '$.telefono')) = '6691234567'`, { id: idRapida });
        m.revisar('→ una edición guarda solo lo que cambió', edicion && Object.keys(json(edicion.despues)).join() === 'telefono',
            JSON.stringify(edicion));
        const [suc1] = await sql(`SELECT antes, despues FROM bitacora_empleados WHERE idEmpleado = :id AND tipo = 'SUCURSAL_PRINCIPAL'`, { id: idRapida });
        m.revisar('→ el cambio de principal guarda de dónde a dónde', json(suc1?.antes)?.sucursal === 'Matriz' && json(suc1?.despues)?.sucursal === 'Norte',
            JSON.stringify(suc1));
        const [bitB] = await sql('SELECT COUNT(*) AS n FROM bitacora_empleados WHERE idEmpresa = :b AND idBitacora > :max', { b: ID.B, max: antes.bitacora });
        m.revisar('→ en B solo el alta que hizo B', Number(bitB.n) === 1, JSON.stringify(bitB));
    } finally {
        // ── Deja todo como estaba ──
        await ejecutar('DELETE FROM usuarios_empresa_acciones WHERE idEmpresa = :a AND idUsuario = :u', { a: ID.A, u: idEncargado });
        const nuevos = (await sql('SELECT idEmpleado, idEmpresa, foto FROM empleados WHERE idEmpleado > :max', { max: antes.empleado }));
        for (const x of nuevos.filter(y => y.foto)) {
            fs.rmSync(path.join(__dirname, '..', 'almacen', 'empresas', String(x.idEmpresa), 'empleados', x.foto), { force: true });
        }
        // Cualquier tabla de empresa que cuelgue del empleado (004 y las de análisis posteriores).
        const hijas = (await sql(`SELECT DISTINCT TABLE_NAME AS t FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'idEmpleado' AND TABLE_NAME <> 'empleados'`))
            .map(x => x.t).filter(t => TABLAS_EMPRESA.includes(t));
        if (nuevos.length) {
            const ids = nuevos.map(x => x.idEmpleado);
            for (let vuelta = 0; vuelta < 3; vuelta++) {
                for (const t of hijas) await ejecutar(`DELETE FROM ${ t } WHERE idEmpleado IN (:ids)`, { ids }).catch(() => {});
            }
            await ejecutar('DELETE FROM empleados WHERE idEmpleado IN (:ids)', { ids });
        }
        await ejecutar('DELETE FROM bitacora_empleados WHERE idBitacora > :max', { max: antes.bitacora });
        await ejecutar('UPDATE empleados SET foto = NULL WHERE idEmpleado = :id', { id: juan.idEmpleado });
        fs.rmSync(path.join(__dirname, '..', 'almacen', 'empresas', String(ID.A), 'empleados'), { recursive: true, force: true });
        await ejecutar('DELETE FROM puestos WHERE idPuesto > :max', { max: antes.puesto });
        await ejecutar('DELETE FROM departamentos WHERE idDepartamento > :max', { max: antes.departamento });
        const sucNuevas = (await sql('SELECT idSucursal FROM sucursales WHERE idSucursal > :max', { max: antes.sucursal })).map(x => x.idSucursal);
        if (sucNuevas.length) {
            const deSucursal = (await sql(`SELECT DISTINCT TABLE_NAME AS t FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'idSucursal' AND TABLE_NAME <> 'sucursales'`))
                .map(x => x.t).filter(t => TABLAS_EMPRESA.includes(t));
            for (const t of deSucursal) await ejecutar(`DELETE FROM ${ t } WHERE idSucursal IN (:ids)`, { ids: sucNuevas }).catch(() => {});
            await ejecutar('DELETE FROM sucursales WHERE idSucursal IN (:ids)', { ids: sucNuevas });
        }
        const [{ n: empleadosDespues }] = await sql('SELECT COUNT(*) AS n FROM empleados');
        m.revisar('limpieza: quedan los mismos empleados que al empezar', empleadosDespues === empleadosAntes, `${ empleadosAntes } → ${ empleadosDespues }`);
    }

    await m.terminar('Empleados, puestos y departamentos');
})().catch(async (e) => {
    console.error('✘', e);
    process.exit(1);
});
