#!/usr/bin/env node
// =============================================================================
// Pruebas del proceso de marcaje y del dispositivo checador (análisis 005)
//     node scripts/instalar.js --demo      (una vez)
//     npm run dev                          (en otra terminal)
//     npm run pruebas:checador
//
// Sin cámara: las capturas de Face ID son sintéticas (lib-faceid-pruebas.js),
// con la misma forma que manda el navegador. Crea sus propios empleados en
// las empresas demo (números T5-…) y al final borra todo lo que creó.
// =============================================================================
const fs = require('fs');
const crypto = require('crypto');
const { API, ID, llamar, entrar, sql, ejecutar, marcador, correo } = require('./lib-pruebas');
const { rostroAleatorio, parecido, secuencia, fotoJpeg } = require('./lib-faceid-pruebas');

const RUN = crypto.randomBytes(3).toString('hex').toUpperCase();
const ORIGEN = `pruebas-checador-${ RUN }`;

/** Petición del dispositivo: JSON o multipart (foto + datos), con su llave en el encabezado. */
const disp = async (metodo, ruta, llave, { body, datos, foto, query = '', origen = ORIGEN } = {}) => {
    const headers = { 'x-origen-prueba': origen };
    if (llave) headers['x-dispositivo'] = llave;
    let cuerpo;
    if (datos !== undefined) {
        cuerpo = new FormData();
        cuerpo.append('datos', JSON.stringify(datos));
        if (foto) cuerpo.append('foto', new Blob([foto], { type: 'image/jpeg' }), 'foto.jpg');
    } else if (body) {
        headers['Content-Type'] = 'application/json';
        cuerpo = JSON.stringify(body);
    }
    const r = await fetch(`${ API }/checador${ ruta }${ query }`, { method: metodo, headers, body: cuerpo });
    return { http: r.status, ...(await r.json().catch(() => ({}))) };
};

/** Pide el reto y checa con la cara `base`. */
const checar = async (llave, base, opciones = {}, extraDatos = {}) => {
    const reto = await disp('GET', '/getReto', llave);
    if (reto.status_code !== 0) return reto;
    return disp('POST', '/checar', llave, { datos: { idReto: reto.data.idReto, frames: secuencia(base, reto.data.pasos, opciones), ...extraDatos }, foto: fotoJpeg() });
};

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

const conNumero = (llave, numeroEmpleado, folio = null) =>
    disp('POST', '/checarConNumero', llave, { datos: { numeroEmpleado, folio }, foto: fotoJpeg() });


/** Borra lo que crean estas pruebas (también lo de una corrida que se cayó a la mitad). */
const limpiar = async () => {
    const e = (await sql("SELECT idEmpleado FROM empleados WHERE numeroEmpleado LIKE 'T5-%'")).map(x => x.idEmpleado);
    const d = (await sql("SELECT idDispositivo FROM dispositivos WHERE nombre LIKE 'Prueba-T5 %'")).map(x => x.idDispositivo);
    if (!e.length) e.push(0);
    if (!d.length) d.push(0);
    const marcajes = (await sql('SELECT idMarcaje FROM marcajes WHERE idEmpleado IN (:e)', { e })).map(x => x.idMarcaje);
    const archivos = marcajes.length ? await sql("SELECT archivo FROM marcajes_evidencias WHERE idMarcaje IN (:m) AND archivo IS NOT NULL", { m: marcajes }) : [];
    for (const a of archivos) await require('../helpers/evidencias').borrarFoto(a.archivo);
    if (marcajes.length) await ejecutar('DELETE FROM marcajes_evidencias WHERE idMarcaje IN (:m)', { m: marcajes });
    if (marcajes.length) await ejecutar('DELETE FROM marcajes WHERE idMarcaje IN (:m)', { m: marcajes });
    await ejecutar('DELETE FROM marcajes_intentos WHERE idEmpleado IN (:e) OR idDispositivo IN (:d)', { e, d });
    await ejecutar('DELETE FROM bitacora_checador WHERE idEmpleado IN (:e) OR idDispositivo IN (:d)', { e, d });
    for (const t of ['empleados_rostros', 'empleados_consentimientos', 'formas_empleado']) {
        await ejecutar(`DELETE FROM ${ t } WHERE idEmpleado IN (:e)`, { e });
    }
    await ejecutar('DELETE FROM dispositivos WHERE idDispositivo IN (:d)', { d });
    await ejecutar('DELETE FROM empleados WHERE idEmpleado IN (:e)', { e });
    await ejecutar("DELETE FROM formas_sucursal WHERE forma = 'prueba'");
    await ejecutar("DELETE FROM cat_formas_checado WHERE forma = 'prueba'");
    await ejecutar("DELETE FROM bitacora_checador WHERE tipo = 'CONSENTIMIENTO_TEXTO' AND descripcion LIKE '%versión%' AND idEmpresa IN (:ids) AND JSON_EXTRACT(despues, '$.version') > 1", { ids: [ID.A, ID.B] });
    await ejecutar("DELETE FROM consentimientos_texto WHERE idEmpresa IN (:ids) AND texto LIKE '%(Revisión de prueba %'", { ids: [ID.A, ID.B] });

};

(async () => {
    const m = marcador();
    await limpiar();
    try {
    const creados = { empleados: [], dispositivos: [] };
    const tA = await entrar('admin.a');
    const tB = await entrar('admin.b');
    const tRH = await entrar('contador', ID.A);
    const tE = await entrar('encargado.a');

    const [matriz] = await sql("SELECT idSucursal, zonaHoraria FROM sucursales WHERE idEmpresa = :a AND nombre = 'Matriz'", { a: ID.A });
    const [norte] = await sql("SELECT idSucursal FROM sucursales WHERE idEmpresa = :a AND nombre = 'Norte'", { a: ID.A });
    const [bMatriz] = await sql("SELECT idSucursal, zonaHoraria FROM sucursales WHERE idEmpresa = :b AND nombre = 'Matriz'", { b: ID.B });
    await ejecutar('CALL sp_preparar_checador(:a)', { a: ID.A });
    await ejecutar('CALL sp_preparar_checador(:b)', { b: ID.B });

    // ── Empleados de prueba (directo en la tabla, con el esquema del 004) ──
    const empleado = async (idEmpresa, idSucursal, n, nombre) => {
        const numero = `T5-${ RUN }-${ n }`;
        const [id] = await ejecutar(`
            INSERT INTO empleados (idEmpresa, numeroEmpleado, nombre, apellidoPaterno, idSucursalPrincipal, idSucursalOperativa, estado, fechaIngreso)
            VALUES (:e, :numero, :nombre, 'Prueba', :s, :s, 'ACTIVO', '2026-01-05')`, { e: idEmpresa, numero, nombre, s: idSucursal });
        creados.empleados.push(id);
        return { id, numero, idEmpresa, cara: rostroAleatorio() };
    };
    const e1 = await empleado(ID.A, matriz.idSucursal, 1, 'Uno');
    const e2 = await empleado(ID.A, matriz.idSucursal, 2, 'Dos');
    const e3 = await empleado(ID.A, matriz.idSucursal, 3, 'Tres (pariente de Dos)');
    e3.cara = parecido(e2.cara, 0.03);
    const e4 = await empleado(ID.A, norte.idSucursal, 4, 'Cuatro (de Norte)');
    const e5 = await empleado(ID.A, matriz.idSucursal, 5, 'Cinco (se da de baja)');
    const e6 = await empleado(ID.A, matriz.idSucursal, 6, 'Seis (sin consentimiento)');
    const e7 = await empleado(ID.A, matriz.idSucursal, 7, 'Siete (forma no permitida)');
    const e8 = await empleado(ID.A, matriz.idSucursal, 8, 'Ocho (sin rostro)');
    const e9 = await empleado(ID.A, matriz.idSucursal, 9, 'Nueve (sin rostro)');
    const eb = await empleado(ID.B, bMatriz.idSucursal, 1, 'Be');

    // ── Consentimiento ──
    let r = await llamar('GET', '/faceid/getConsentimientoTexto', { token: tA });
    const versionInicial = r.data?.version;
    m.revisar('la empresa tiene su texto de consentimiento', r.status_code === 0 && versionInicial >= 1, r.message);
    r = await llamar('POST', '/faceid/insertConsentimientoTexto', { token: tA,
        body: { texto: `${ r.data.texto } (Revisión de prueba ${ RUN }.)` } });
    const [ver] = await sql('SELECT MAX(version) AS v FROM consentimientos_texto WHERE idEmpresa = :a', { a: ID.A });
    m.revisar('cambiar el texto crea una versión nueva', r.status_code === 0 && Number(ver.v) === versionInicial + 1, r.message);
    r = await llamar('POST', '/faceid/insertConsentimientoTexto', { token: tRH, body: { texto: 'x'.repeat(60) } });
    m.revisar('RH sin consentimiento_Editar no cambia el texto', r.data?.codigo === 'SIN_PERMISO', r.message);

    const acepta = (token, e, version = Number(ver.v)) => llamar('POST', '/faceid/aceptarConsentimiento', { token,
        body: { idEmpleado: e.id, version, medio: 'PAPEL_FIRMADO', nota: 'Prueba' } });
    r = await acepta(tRH, e1, versionInicial);
    m.revisar('aceptar una versión que ya no es la vigente se rechaza', r.status_code === 1, r.message);
    for (const e of [e1, e2, e3, e4, e5, e7]) {
        r = await acepta(tRH, e);
        if (r.status_code !== 0) m.revisar(`consentimiento de ${ e.numero }`, false, r.message);
    }
    const [vB] = await sql('SELECT MAX(version) AS v FROM consentimientos_texto WHERE idEmpresa = :b', { b: ID.B });
    r = await acepta(tB, eb, Number(vB.v));
    m.revisar('RH registra los consentimientos (A) y el administrador de B el suyo', r.status_code === 0, r.message);
    r = await acepta(tA, eb, Number(ver.v));
    m.revisar('aceptar el consentimiento de un empleado de B desde A → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);

    // ── Registro del rostro ──
    const registrar = async (token, e, opciones = {}) => {
        const reto = await llamar('GET', '/faceid/getRetoRegistro', { token });
        return llamar('POST', '/faceid/registrarRostro', { token,
            body: { idEmpleado: e.id, idReto: reto.data?.idReto, frames: secuencia(e.cara, reto.data?.pasos || [], opciones) } });
    };
    r = await registrar(tRH, e6);
    m.revisar('sin consentimiento no se registra el rostro', r.status_code === 1 && r.data?.codigo === 'SIN_CONSENTIMIENTO', r.message);
    r = await registrar(tRH, e1, { invertir: true });
    m.revisar('registro sin prueba de vida (gira al lado contrario) → rechazado', r.status_code === 1 && /prueba de vida/.test(r.message), r.message);
    r = await registrar(tRH, e1, { descriptores: 3 });
    m.revisar('registro con menos tomas de las que pide faceid.tomas_registro → rechazado', r.status_code === 1 && /tomas/.test(r.message), r.message);
    r = await registrar(tRH, e1, { score: 0.3 });
    m.revisar('registro sin la calidad mínima → rechazado', r.status_code === 1 && /calidad/.test(r.message), r.message);
    r = await registrar(tRH, e1, { ipd: 30 });
    m.revisar('registro con el rostro muy pequeño → rechazado', r.status_code === 1 && /pequeño/.test(r.message), r.message);
    for (const e of [e1, e2, e4, e5, e7]) {
        r = await registrar(tRH, e);
        if (r.status_code !== 0) m.revisar(`rostro de ${ e.numero }`, false, r.message);
    }
    m.revisar('RH registra rostros con prueba de vida, calidad y tomas', r.status_code === 0, r.message);
    r = await registrar(tRH, e3);
    m.revisar('un rostro parecido al de otro empleado avisa antes de guardar', r.status_code === 1 && r.data?.codigo === 'PARECIDO'
        && r.data.parecidos.some(p => p.numeroEmpleado === e2.numero), r.message);
    const [sinGuardar] = await sql('SELECT COUNT(*) AS n FROM empleados_rostros WHERE idEmpresa = :a AND idEmpleado = :e', { a: ID.A, e: e3.id });
    m.revisar('→ sin confirmar no se guardó', Number(sinGuardar.n) === 0);
    r = await llamar('POST', '/faceid/registrarRostro', { token: tRH,
        body: { idEmpleado: e3.id, tokenConfirmacion: r.data?.tokenConfirmacion, confirmarParecido: true } });
    m.revisar('→ con la confirmación explícita se guarda', r.status_code === 0, r.message);
    r = await registrar(tB, eb);
    m.revisar('el administrador de B registra el rostro de su empleado', r.status_code === 0, r.message);

    r = await llamar('GET', `/faceid/getRostroEmpleado?idEmpleado=${ e1.id }`, { token: tRH });
    const texto = JSON.stringify(r);
    m.revisar('getRostroEmpleado dice "registrado", quién y cuándo, sin descriptores',
        r.data?.estado === 'REGISTRADO' && !!r.data.rostro?.registradoPor && !/descriptor|promedio|tomas"\s*:\s*\[/.test(texto), texto.slice(0, 200));

    // ── Dispositivos: alta, código, vincular ──
    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tA, body: { idSucursal: matriz.idSucursal, nombre: `Prueba-T5 Entrada ${ RUN }` } });
    const d1 = r.data;
    if (d1?.id) creados.dispositivos.push(d1.id);
    m.revisar('agregar dispositivo: pendiente con código de 8 caracteres sin 0/O/1/I',
        r.status_code === 0 && /^[A-HJ-NP-Z2-9]{8}$/.test(d1.codigo || ''), JSON.stringify(r).slice(0, 200));
    const [guardado] = await sql('SELECT codigoHash, estado FROM dispositivos WHERE idDispositivo = :id', { id: d1.id });
    m.revisar('→ se guarda el hash, no el código', guardado.estado === 'PENDIENTE' && guardado.codigoHash !== d1.codigo && guardado.codigoHash.length === 64);
    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tRH, body: { idSucursal: matriz.idSucursal, nombre: 'X' } });
    m.revisar('RH sin dispositivos_CreateUpdate no agrega dispositivos', r.data?.codigo === 'SIN_PERMISO', r.message);

    // Un usuario limitado a Norte con el permiso solo vincula en Norte.
    const [idEnc] = (await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('encargado.a') })).map(x => x.idUsuario);
    const directosEnc = await llamar('GET', `/usuariosEmpresa/getPermisosDirectos?idUsuario=${ idEnc }`, { token: tA });
    await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
        body: { idUsuario: idEnc, menus: directosEnc.data?.menus || [], acciones: [...(directosEnc.data?.acciones || []), 'dispositivos_CreateUpdate'] } });
    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tE, body: { idSucursal: matriz.idSucursal, nombre: 'Fuera de su alcance' } });
    m.revisar('un administrador limitado a Norte no agrega dispositivos en Matriz', r.status_code === 1 && /no existe/.test(r.message), r.message);
    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tE, body: { idSucursal: norte.idSucursal, nombre: `Prueba-T5 Norte ${ RUN }` } });
    if (r.data?.id) creados.dispositivos.push(r.data.id);
    m.revisar('→ en Norte sí', r.status_code === 0, r.message);
    const verEnc = await llamar('GET', '/dispositivos/getDispositivos', { token: tE });
    m.revisar('→ y en Dispositivos solo ve los de Norte', verEnc.status_code === 0 && verEnc.data.length > 0
        && verEnc.data.every(x => x.idSucursal === norte.idSucursal), verEnc.message);
    await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
        body: { idUsuario: idEnc, menus: directosEnc.data?.menus || [], acciones: directosEnc.data?.acciones || [] } });

    r = await disp('POST', '/vincular', null, { body: { codigo: d1.codigo.toLowerCase().replace(/(.{4})/, '$1-') } });
    const llave1 = r.data?.llave;
    m.revisar('vincular con el código válido (aunque lo escriban en minúsculas y con guion) regresa la llave',
        r.status_code === 0 && llave1?.length >= 40 && r.data.dispositivo?.sucursal === 'Matriz', r.message);
    const [vinc] = await sql('SELECT estado, llaveHash FROM dispositivos WHERE idDispositivo = :id', { id: d1.id });
    m.revisar('→ queda VINCULADO y solo con el hash de la llave', vinc.estado === 'VINCULADO' && vinc.llaveHash !== llave1);
    r = await llamar('GET', `/dispositivos/getEstadoVinculacion?idDispositivo=${ d1.id }`, { token: tA });
    m.revisar('la pantalla del administrador ve "Vinculado"', r.data?.estado === 'VINCULADO', r.message);
    r = await disp('POST', '/vincular', null, { body: { codigo: d1.codigo } });
    m.revisar('el mismo código otra vez → "ya se usó"', r.status_code === 1 && r.data?.codigo === 'CODIGO_USADO', r.message);

    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tA, body: { idSucursal: matriz.idSucursal, nombre: `Prueba-T5 Vencido ${ RUN }` } });
    const dv = r.data;
    creados.dispositivos.push(dv.id);
    await ejecutar('UPDATE dispositivos SET codigoVence = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE idDispositivo = :id', { id: dv.id });
    r = await disp('POST', '/vincular', null, { body: { codigo: dv.codigo } });
    m.revisar('un código vencido se rechaza', r.status_code === 1 && r.data?.codigo === 'CODIGO_VENCIDO', r.message);
    r = await llamar('POST', '/dispositivos/regenerarCodigo', { token: tA, body: { idDispositivo: dv.id } });
    const r2 = await disp('POST', '/vincular', null, { body: { codigo: dv.codigo } });
    m.revisar('"Generar otro" deja inservible el anterior', r.status_code === 0 && r.data.codigo !== dv.codigo && r2.data?.codigo === 'CODIGO_INVALIDO', `${ r.message } / ${ r2.message }`);
    r = await llamar('DELETE', '/dispositivos/deleteDispositivoPendiente', { token: tA, body: { idDispositivo: dv.id } });
    m.revisar('eliminar un pendiente', r.status_code === 0, r.message);
    r = await llamar('DELETE', '/dispositivos/deleteDispositivoPendiente', { token: tA, body: { idDispositivo: d1.id } });
    m.revisar('un vinculado no se elimina (se revoca)', r.status_code === 1, r.message);

    let bloqueado = false;
    for (let i = 0; i < 15 && !bloqueado; i++) {
        const x = await disp('POST', '/vincular', null, { body: { codigo: 'ZZZZZZZZ' }, origen: `limite-${ RUN }` });
        bloqueado = x.http === 429;
    }
    m.revisar('muchos códigos inválidos desde un origen → bloqueado', bloqueado);
    r = await disp('POST', '/vincular', null, { body: { codigo: 'ZZZZZZZZ' } });
    m.revisar('→ otro origen no queda bloqueado', r.http === 200, String(r.http));

    // ── Latido y "sin conexión" ──
    r = await disp('POST', '/latido', llave1, { body: { version: 'prueba-1' } });
    m.revisar('latido: regresa lo que necesita la pantalla', r.status_code === 0 && r.data.parametros?.intentosAntesDeNumero >= 1, r.message);
    r = await llamar('GET', `/dispositivos/getDispositivos?idSucursal=${ matriz.idSucursal }`, { token: tA });
    let fila = r.data?.find(x => x.idDispositivo === d1.id);
    m.revisar('Dispositivos muestra la última conexión y no lo marca sin conexión', !!fila?.ultimaConexion && fila.bSinConexion === false && fila.versionFront === 'prueba-1', JSON.stringify(fila));
    await ejecutar('UPDATE dispositivos SET ultimaConexion = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR) WHERE idDispositivo = :id', { id: d1.id });
    r = await llamar('GET', '/dispositivos/getDispositivos', { token: tA });
    fila = r.data?.find(x => x.idDispositivo === d1.id);
    m.revisar('→ el que dejó de avisar se marca sin conexión', fila?.bSinConexion === true, JSON.stringify(fila));
    await disp('POST', '/latido', llave1, { body: {} });

    // ── Checar ──
    r = await checar(llave1, e1.cara, {}, { idSucursal: norte.idSucursal, idEmpresa: ID.B });
    const [mk1] = await sql('SELECT * FROM marcajes WHERE idEmpresa = :a AND idEmpleado = :e ORDER BY idMarcaje DESC LIMIT 1', { a: ID.A, e: e1.id });
    m.revisar('checar: identifica y registra', r.status_code === 0 && r.data?.resultado === 'REGISTRADO' && /Uno/.test(r.data.nombre), r.message);
    m.revisar('→ con la sucursal y la empresa de la llave, aunque el body mande otras', mk1?.idSucursal === matriz.idSucursal && mk1.idEmpresa === ID.A && mk1.idDispositivo === d1.id);
    const evs = await sql('SELECT tipo, archivo, vence, dato FROM marcajes_evidencias WHERE idEmpresa = :a AND idMarcaje = :m', { a: ID.A, m: mk1?.idMarcaje || 0 });
    const tipos = evs.map(e => e.tipo).sort().join(',');
    const foto1 = evs.find(e => e.tipo === 'foto');
    m.revisar('→ guarda forma, aparato, foto (con vencimiento), parecido y verificaciones',
        mk1?.forma === 'dispositivo' && tipos === 'dispositivo,faceid,foto,verificaciones' && !!foto1?.archivo && !!foto1.vence
        && typeof json(evs.find(e => e.tipo === 'faceid').dato).distancia === 'number', tipos);
    const { diaDe } = require('../helpers/fechas');
    m.revisar('→ fecha de negocio con la zona de la sucursal', mk1?.fechaNegocio === diaDe(mk1.instante, matriz.zonaHoraria), `${ mk1?.fechaNegocio } ${ mk1?.instante }`);
    m.revisar('→ el archivo de la foto existe', fs.existsSync(require('../helpers/evidencias').ruta(foto1.archivo)));

    r = await checar(llave1, e1.cara);
    const [rebote] = await sql("SELECT motivo FROM marcajes_intentos WHERE idEmpresa = :a AND idEmpleado = :e ORDER BY idIntento DESC LIMIT 1", { a: ID.A, e: e1.id });
    m.revisar('antirrebote: el mismo empleado otra vez en segundos → rechazo y bitácora',
        r.status_code === 1 && r.data?.motivo === 'VERIFICACION_ANTIRREBOTE' && rebote?.motivo === 'VERIFICACION_ANTIRREBOTE', r.message);

    r = await checar(llave1, e4.cara);
    const [mk4] = await sql('SELECT idSucursal FROM marcajes WHERE idEmpresa = :a AND idEmpleado = :e', { a: ID.A, e: e4.id });
    m.revisar('empleado de otra sucursal de la empresa: checa y queda con la sucursal del dispositivo',
        r.data?.resultado === 'REGISTRADO' && mk4?.idSucursal === matriz.idSucursal, r.message);

    r = await llamar('POST', '/formasChecado/setFormaEmpleado', { token: tA, body: { idEmpleado: e7.id, forma: 'dispositivo', bPermitida: false } });
    m.revisar('excepción por empleado: no permitir el dispositivo', r.status_code === 0, r.message);
    r = await checar(llave1, e7.cara);
    const [noPerm] = await sql("SELECT motivo FROM marcajes_intentos WHERE idEmpresa = :a AND idEmpleado = :e ORDER BY idIntento DESC LIMIT 1", { a: ID.A, e: e7.id });
    const [sinMarcaje7] = await sql('SELECT COUNT(*) AS n FROM marcajes WHERE idEmpresa = :a AND idEmpleado = :e', { a: ID.A, e: e7.id });
    m.revisar('forma no permitida para el empleado: rechazo, sin marcaje y con renglón en marcajes_intentos',
        r.data?.motivo === 'FORMA_NO_PERMITIDA' && noPerm?.motivo === 'FORMA_NO_PERMITIDA' && Number(sinMarcaje7.n) === 0, r.message);
    await llamar('POST', '/formasChecado/setFormaEmpleado', { token: tA, body: { idEmpleado: e7.id, forma: 'dispositivo', bPermitida: null } });
    r = await llamar('POST', '/formasChecado/setFormaSucursal', { token: tA, body: { idSucursal: matriz.idSucursal, forma: 'celular', bActiva: true } });
    m.revisar('una forma "próximamente" no se puede activar', r.status_code === 1 && /próximamente/.test(r.message), r.message);
    r = await llamar('GET', '/formasChecado/getFormasSucursal', { token: tA });
    m.revisar('Formas de checar: catálogo con las próximas marcadas y el dispositivo activo en cada sucursal',
        r.data?.formas.some(f => f.forma === 'celular' && f.estado === 'PROXIMAMENTE')
        && r.data.sucursales.every(s => s.formas.dispositivo?.bActiva === true), JSON.stringify(r.data?.sucursales).slice(0, 200));

    // Duda entre dos: Dos y Tres se parecen.
    r = await checar(llave1, e2.cara);
    const folio = r.data?.folio;
    m.revisar('duda entre dos → pide el número, con folio y sin marcaje', r.status_code === 0 && r.data?.resultado === 'DUDA' && !!folio, r.message);
    r = await conNumero(llave1, e2.numero.toLowerCase(), folio);
    const [mk2] = await sql('SELECT resultado FROM marcajes WHERE idEmpresa = :a AND idEmpleado = :e', { a: ID.A, e: e2.id });
    m.revisar('→ con el número de uno de los dos: aceptado', r.data?.resultado === 'REGISTRADO' && mk2?.resultado === 'ACEPTADO', r.message);
    r = await conNumero(llave1, e2.numero, folio);
    m.revisar('→ el folio no sirve dos veces', r.status_code === 1, r.message);
    r = await checar(llave1, e3.cara);
    r = await conNumero(llave1, e8.numero, r.data?.folio);
    const [mk8] = await sql('SELECT resultado, motivoDuda FROM marcajes WHERE idEmpresa = :a AND idEmpleado = :e', { a: ID.A, e: e8.id });
    m.revisar('→ con el número de otro: por revisar', r.data?.resultado === 'POR_REVISAR' && mk8?.resultado === 'POR_REVISAR' && !!mk8.motivoDuda, r.message);

    // No reconocido, prueba de vida y checar con número tras los fallos.
    r = await conNumero(llave1, e9.numero);
    m.revisar('checar con número sin haber fallado antes → no', r.status_code === 1 && /rostro/.test(r.message), r.message);
    const extrano = rostroAleatorio();
    let noRec = 0;
    for (let i = 0; i < 3; i++) { const x = await checar(llave1, extrano); if (x.data?.resultado === 'NO_RECONOCIDO') noRec++; }
    m.revisar('una cara desconocida → "no te reconocí", sin marcaje', noRec === 3);
    r = await checar(llave1, e9.cara, { invertir: true });
    m.revisar('sin prueba de vida (giro equivocado) → SIN_VIDA', r.data?.resultado === 'SIN_VIDA', r.message);
    r = await conNumero(llave1, e9.numero);
    const [mk9] = await sql('SELECT m.resultado, (SELECT COUNT(*) FROM marcajes_evidencias x WHERE x.idMarcaje = m.idMarcaje AND x.tipo = \'foto\' AND x.archivo IS NOT NULL) AS fotos FROM marcajes m WHERE m.idEmpresa = :a AND m.idEmpleado = :e', { a: ID.A, e: e9.id });
    m.revisar('tras los fallos seguidos, con su número → por revisar, con la foto',
        r.data?.resultado === 'POR_REVISAR' && mk9?.resultado === 'POR_REVISAR' && Number(mk9.fotos) === 1, r.message);
    r = await conNumero(llave1, 'NO-EXISTE-99');
    m.revisar('un número que no existe → rechazo', r.status_code === 1 && /no existe/.test(r.message), r.message);

    // Baja y otra empresa no participan.
    await ejecutar("UPDATE empleados SET estado = 'BAJA', fechaBaja = '2026-11-01' WHERE idEmpleado = :e", { e: e5.id });
    r = await checar(llave1, e5.cara);
    m.revisar('empleado de baja: su rostro no participa → no reconocido', r.data?.resultado === 'NO_RECONOCIDO', r.message);
    r = await checar(llave1, eb.cara);
    m.revisar('el dispositivo de A no identifica al empleado de B', r.data?.resultado === 'NO_RECONOCIDO', r.message);

    // ── Por revisar ──
    r = await llamar('GET', '/marcajes/getPorRevisar', { token: tA });
    const pend = (r.data || []).filter(x => [e8.id, e9.id].includes(x.idEmpleado));
    m.revisar('la bandeja trae los dudosos con foto, parecido, forma, dispositivo y motivo',
        pend.length === 2 && pend.every(x => x.tieneFoto && x.formaNombre && x.dispositivo && x.motivoDuda && x.zonaHoraria)
        && pend.some(x => x.faceid?.candidatos?.length === 2), JSON.stringify(pend).slice(0, 300));
    r = await llamar('GET', '/marcajes/getContadorPorRevisar', { token: tA });
    m.revisar('contador para el menú', r.status_code === 0 && r.data.total >= 2, r.message);
    r = await llamar('GET', '/marcajes/getPorRevisar', { token: tE });
    m.revisar('el Encargado de Norte no ve los de Matriz', r.status_code === 0 && !r.data.some(x => [e8.id, e9.id].includes(x.idEmpleado)), r.message);
    const resp = await fetch(`${ API }/marcajes/getFotoEvidencia?idMarcaje=${ pend[0]?.idMarcaje }`, { headers: { 'x-token': tA } });
    m.revisar('la foto se entrega con sesión', resp.status === 200 && /image\/jpeg/.test(resp.headers.get('content-type') || ''), resp.headers.get('content-type'));
    r = await llamar('GET', `/marcajes/getFotoEvidencia?idMarcaje=${ pend[0]?.idMarcaje }`, { token: tB });
    m.revisar('→ desde otra empresa: no existe', r.status_code === 1 || r.data?.codigo === 'SIN_PERMISO', r.message);

    const id8 = pend.find(x => x.idEmpleado === e8.id)?.idMarcaje;
    const id9 = pend.find(x => x.idEmpleado === e9.id)?.idMarcaje;
    const [total0] = await sql('SELECT COUNT(*) AS n FROM marcajes WHERE idEmpresa = :a', { a: ID.A });
    r = await llamar('PUT', '/marcajes/rechazarMarcaje', { token: tA, body: { idMarcaje: id8 } });
    m.revisar('rechazar sin motivo no se puede', r.status_code === 1, r.message);
    r = await llamar('PUT', '/marcajes/rechazarMarcaje', { token: tA, body: { idMarcaje: id8, motivo: 'No era él' } });
    const [rech] = await sql('SELECT resultado, decisionRevision, motivoRevision, idUsuarioReviso, fechaRevision FROM marcajes WHERE idMarcaje = :id', { id: id8 || 0 });
    m.revisar('rechazar deja el marcaje ANULADO, con quién, cuándo y por qué',
        r.status_code === 0 && rech.resultado === 'ANULADO' && rech.decisionRevision === 'RECHAZADO' && rech.motivoRevision === 'No era él' && !!rech.idUsuarioReviso && !!rech.fechaRevision, r.message);
    r = await llamar('PUT', '/marcajes/aprobarMarcaje', { token: tRH, body: { idMarcaje: id9 } });
    const [apr] = await sql('SELECT resultado, decisionRevision FROM marcajes WHERE idMarcaje = :id', { id: id9 || 0 });
    m.revisar('RH aprueba: queda ACEPTADO', r.status_code === 0 && apr.resultado === 'ACEPTADO' && apr.decisionRevision === 'APROBADO', r.message);
    r = await llamar('PUT', '/marcajes/aprobarMarcaje', { token: tA, body: { idMarcaje: id8 } });
    m.revisar('uno ya revisado no se vuelve a revisar', r.status_code === 1, r.message);
    const [total1] = await sql('SELECT COUNT(*) AS n FROM marcajes WHERE idEmpresa = :a', { a: ID.A });
    r = await llamar('GET', '/marcajes/getPorRevisar?estado=revisados', { token: tA });
    m.revisar('→ ninguno se borró y el rechazado sigue visible', Number(total0.n) === Number(total1.n) && r.data?.some(x => x.idMarcaje === id8 && x.resultado === 'ANULADO'), r.message);

    // ── Retirar el consentimiento ──
    r = await llamar('POST', '/faceid/retirarConsentimiento', { token: tRH, body: { idEmpleado: e1.id, motivo: 'Lo pidió' } });
    const [rostro1] = await sql('SELECT COUNT(*) AS n FROM empleados_rostros WHERE idEmpleado = :e', { e: e1.id });
    m.revisar('retirar el consentimiento elimina el rostro', r.status_code === 0 && Number(rostro1.n) === 0, r.message);

    r = await checar(llave1, e1.cara);
    m.revisar('→ y deja de identificarlo', r.data?.resultado === 'NO_RECONOCIDO', r.message);
    const bit = await sql('SELECT DISTINCT tipo FROM bitacora_checador WHERE idEmpresa = :a AND (idEmpleado IN (:e) OR idDispositivo IN (:d))',
        { a: ID.A, e: creados.empleados, d: creados.dispositivos });
    const tiposBit = new Set(bit.map(b => b.tipo));
    m.revisar('bitácora: vinculación, política, consentimientos, rostros y revisión',
        ['DISPOSITIVO_CREADO', 'DISPOSITIVO_VINCULADO', 'FORMA_EMPLEADO', 'CONSENTIMIENTO_ACEPTADO', 'CONSENTIMIENTO_RETIRADO',
            'ROSTRO_REGISTRADO', 'MARCAJE_APROBADO', 'MARCAJE_RECHAZADO'].every(t => tiposBit.has(t)), [...tiposBit].join(', '));

    // ── Revocar ──
    r = await llamar('PUT', '/dispositivos/revocarDispositivo', { token: tRH, body: { idDispositivo: d1.id } });
    m.revisar('RH sin dispositivos_Revocar no revoca', r.data?.codigo === 'SIN_PERMISO', r.message);
    r = await llamar('PUT', '/dispositivos/revocarDispositivo', { token: tA, body: { idDispositivo: d1.id } });
    const lat = await disp('POST', '/latido', llave1, { body: {} });
    const chk = await checar(llave1, e2.cara);
    m.revisar('la llave revocada deja de servir en el siguiente intento',
        r.status_code === 0 && lat.data?.codigo === 'DISPOSITIVO_REVOCADO' && chk.data?.codigo === 'DISPOSITIVO_REVOCADO', `${ lat.message } / ${ chk.message }`);
    r = await disp('POST', '/latido', 'llave-que-no-existe-0123456789', { body: {} });
    m.revisar('una llave inventada no sirve', r.data?.codigo === 'DISPOSITIVO_DESCONOCIDO', r.message);

    // ── El proceso, directo (sin dispositivo) ──
    const { registrarMarcaje } = require('../helpers/marcaje');
    const reqB = { idEmpresa: ID.B };
    const tijuana = await registrarMarcaje(reqB, {
        idSucursal: bMatriz.idSucursal, idEmpleado: eb.id, forma: 'dispositivo',
        instante: new Date('2026-06-11T06:30:00Z'),        // 23:30 del 10 de junio en Tijuana (UTC-7 en verano)
        evidencias: [{ tipo: 'faceid', dato: { resultado: 'IDENTIFICADO', distancia: 0.1 } }]
    });
    m.revisar('fecha de negocio: 23:30 en Tijuana es del mismo día local, no del siguiente en UTC',
        tijuana.ok && tijuana.fechaNegocio === '2026-06-10' && bMatriz.zonaHoraria === 'America/Tijuana', JSON.stringify(tijuana).slice(0, 200));
    const otraEmpresa = await registrarMarcaje({ idEmpresa: ID.A }, {
        idSucursal: matriz.idSucursal, idEmpleado: eb.id, forma: 'dispositivo',
        evidencias: [{ tipo: 'faceid', dato: { resultado: 'IDENTIFICADO' } }] });
    m.revisar('el proceso no acepta un empleado de otra empresa', !otraEmpresa.ok && otraEmpresa.motivo === 'EMPLEADO_NO_EXISTE', otraEmpresa.motivo);

    // ── T36: forma de prueba (solo catálogo + adaptador) ──
    const esquema = async () => (await sql('SHOW CREATE TABLE marcajes'))[0]['Create Table'].replace(/ AUTO_INCREMENT=\d+/, '');
    const fuenteProceso = crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../helpers/marcaje'))).digest('hex');
    const esquemaAntes = await esquema();
    await ejecutar(`INSERT INTO cat_formas_checado (forma, nombre, estado, evidencias, verificaciones, orden)
                    VALUES ('prueba', 'Forma de prueba', 'DISPONIBLE', '["prueba"]', '["antirrebote"]', 999)
                    ON DUPLICATE KEY UPDATE estado = 'DISPONIBLE'`);
    await ejecutar("INSERT IGNORE INTO formas_sucursal (idEmpresa, idSucursal, forma, bActiva) VALUES (:a, :s, 'prueba', 1)", { a: ID.A, s: matriz.idSucursal });
    require('../helpers/politicaChecado').invalidar();
    // El adaptador de la forma: arma la solicitud y llama al proceso. Nada más.
    const adaptadorPrueba = (req, idEmpleado) => registrarMarcaje(req, {
        idSucursal: matriz.idSucursal, idEmpleado, forma: 'prueba',
        evidencias: [{ tipo: 'prueba', dato: { origen: 'pruebas-checador', run: RUN } }]
    });
    const rp = await adaptadorPrueba({ idEmpresa: ID.A }, e6.id);
    const [mkp] = await sql("SELECT m.forma, m.resultado, (SELECT COUNT(*) FROM marcajes_evidencias x WHERE x.idMarcaje = m.idMarcaje AND x.tipo = 'prueba') AS ev FROM marcajes m WHERE m.idMarcaje = :id", { id: rp.idMarcaje || 0 });
    m.revisar('forma de prueba: con su renglón de catálogo y un adaptador crea marcajes por el mismo proceso',
        rp.ok && rp.resultado === 'ACEPTADO' && mkp?.forma === 'prueba' && Number(mkp.ev) === 1, JSON.stringify(rp).slice(0, 200));
    m.revisar('→ sin tocar el proceso ni la tabla de marcajes', esquemaAntes === await esquema()
        && fuenteProceso === crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../helpers/marcaje'))).digest('hex'));
    const rp2 = await adaptadorPrueba({ idEmpresa: ID.A }, e6.id);
    m.revisar('→ y corre las verificaciones de su política (antirrebote)', !rp2.ok && rp2.motivo === 'VERIFICACION_ANTIRREBOTE', rp2.motivo);

    // ── T24: la foto vencida se elimina; el marcaje se conserva ──
    await ejecutar("UPDATE marcajes_evidencias SET vence = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE idMarcaje = :m AND tipo = 'foto'", { m: mk1.idMarcaje });
    const { limpiarFotosVencidas } = require('../helpers/tareaFotosVencidas');
    const lim = await limpiarFotosVencidas();
    const [ev1] = await sql("SELECT archivo, dato FROM marcajes_evidencias WHERE idMarcaje = :m AND tipo = 'foto'", { m: mk1.idMarcaje });
    const [sigue] = await sql('SELECT resultado FROM marcajes WHERE idMarcaje = :m', { m: mk1.idMarcaje });
    m.revisar('la tarea de fotos vencidas borra el archivo y la referencia, y conserva el marcaje',
        lim.borradas >= 1 && ev1.archivo === null && !fs.existsSync(require('../helpers/evidencias').ruta(foto1.archivo))
        && sigue?.resultado === 'ACEPTADO' && !!json(ev1.dato)?.fotoEliminada, JSON.stringify(lim));

    } catch (e) {
        m.revisar(`la prueba terminó sin errores`, false, e.stack || e.message);
    } finally {
        await limpiar().catch(e => console.error('limpieza', e.message));
    }
    await m.terminar('Pruebas del checador');
})().catch(async (e) => { console.error('✘', e.stack || e.message); process.exit(1); });
