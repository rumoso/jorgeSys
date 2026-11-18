#!/usr/bin/env node
// =============================================================================
// Pruebas de fuga entre empresas (análisis 001, LP-1)
// También (009, T48): nada de /api/panel responde a una sesión de empresa ni
// a un token de soporte, el token del panel no sirve en las rutas de empresa y
// un token de soporte de A no alcanza nada de B.
// =============================================================================
// Con la sesión del administrador de la empresa A, intenta leer y modificar
// datos de la empresa B por cada endpoint. Todo debe responder "no existe" o
// ignorar el idEmpresa enviado, y las filas de B no deben cambiar.
//
//     node scripts/instalar.js --demo --reiniciar   (una vez)
//     npm run dev                                   (en otra terminal)
//     npm run fuga
// =============================================================================
const fs = require('fs');
const path = require('path');
const { API, ID, llamar, entrar, entrarPanel, sql, ejecutar, marcador, correo } = require('./lib-pruebas');
const { TABLAS_EMPRESA } = require('../helpers/tablasEmpresa');

// ── 005: proceso de marcaje y dispositivo checador ───────────────────────────
const { rostroAleatorio, secuencia, fotoJpeg } = require('./lib-faceid-pruebas');
const RUN5 = require('crypto').randomBytes(3).toString('hex').toUpperCase();

/** Petición del dispositivo (sin sesión, con su llave). */
const disp = async (metodo, ruta, llave, { body, datos } = {}) => {
    const headers = { 'x-origen-prueba': `fuga-${ RUN5 }` };
    if (llave) headers['x-dispositivo'] = llave;
    let cuerpo;
    if (datos) {
        cuerpo = new FormData();
        cuerpo.append('datos', JSON.stringify(datos));
        cuerpo.append('foto', new Blob([fotoJpeg()], { type: 'image/jpeg' }), 'foto.jpg');
    } else if (body) { headers['Content-Type'] = 'application/json'; cuerpo = JSON.stringify(body); }
    const r = await fetch(`${ API }/checador${ ruta }`, { method: metodo, headers, body: cuerpo });
    return { http: r.status, ...(await r.json().catch(() => ({}))) };
};
const checarCon = async (llave, cara) => {
    const reto = await disp('GET', '/getReto', llave);
    return disp('POST', '/checar', llave, { datos: { idReto: reto.data?.idReto, frames: secuencia(cara, reto.data?.pasos || []) } });
};

/** En B: empleado con rostro, dispositivo vinculado y pendiente, marcaje por revisar. */
const prepararChecadorB = async () => {
    const tB = await entrar('admin.b');
    const [suc] = await sql("SELECT idSucursal FROM sucursales WHERE idEmpresa = :b ORDER BY idSucursal LIMIT 1", { b: ID.B });
    const numero = `FUGA-B-${ RUN5 }`;
    const [idEmpleado] = await ejecutar(`
        INSERT INTO empleados (idEmpresa, numeroEmpleado, nombre, apellidoPaterno, idSucursalPrincipal, idSucursalOperativa, estado, fechaIngreso)
        VALUES (:b, :numero, 'Fuga', 'B', :s, :s, 'ACTIVO', '2026-01-05')`, { b: ID.B, numero, s: suc.idSucursal });
    const cara = rostroAleatorio();
    const [ver] = await sql('SELECT MAX(version) AS v FROM consentimientos_texto WHERE idEmpresa = :b', { b: ID.B });
    await llamar('POST', '/faceid/aceptarConsentimiento', { token: tB, body: { idEmpleado, version: Number(ver.v), medio: 'PAPEL_FIRMADO' } });
    const reto = await llamar('GET', '/faceid/getRetoRegistro', { token: tB });
    const reg = await llamar('POST', '/faceid/registrarRostro', { token: tB, body: { idEmpleado, idReto: reto.data.idReto, frames: secuencia(cara, reto.data.pasos) } });
    if (reg.status_code !== 0) throw new Error(`No se preparó el rostro de B: ${ reg.message }`);
    const d1 = (await llamar('POST', '/dispositivos/insertDispositivo', { token: tB, body: { idSucursal: suc.idSucursal, nombre: `Fuga B ${ RUN5 }` } })).data;
    const llaveB = (await disp('POST', '/vincular', null, { body: { codigo: d1.codigo } })).data?.llave;
    const d2 = (await llamar('POST', '/dispositivos/insertDispositivo', { token: tB, body: { idSucursal: suc.idSucursal, nombre: `Fuga B pendiente ${ RUN5 }` } })).data;
    const { registrarMarcaje } = require('../helpers/marcaje');
    const mk = await registrarMarcaje({ idEmpresa: ID.B }, { idSucursal: suc.idSucursal, idEmpleado, forma: 'dispositivo', idDispositivo: d1.id,
        evidencias: [{ tipo: 'faceid', dato: { resultado: 'SOLO_NUMERO', intentos: 3 } }] });
    if (mk.resultado !== 'POR_REVISAR') throw new Error(`No se preparó el marcaje de B: ${ mk.mensaje }`);
    return { idEmpleado, numero, cara, idSucursal: suc.idSucursal, idDispositivo: d1.id, idPendiente: d2.id, codigoPendiente: d2.codigo,
        llaveB, idMarcaje: mk.idMarcaje, creadosA: { dispositivos: [] } };
};

const fugaChecador = async (m, tA, b, idSucB) => {
    const noExiste = (r) => r.status_code === 1 && /no existe/i.test(r.message);
    const [sucA] = await sql("SELECT idSucursal FROM sucursales WHERE idEmpresa = :a ORDER BY idSucursal LIMIT 1", { a: ID.A });

    // Dispositivos
    let r = await llamar('GET', `/dispositivos/getDispositivos?idSucursal=${ b.idSucursal }&idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getDispositivos con sucursal e idEmpresa de B → vacío', r.status_code === 0 && r.data.length === 0, r.message);
    r = await llamar('GET', '/dispositivos/getDispositivos', { token: tA });
    m.revisar('getDispositivos solo trae los de A', r.status_code === 0 && !r.data.some(d => [b.idDispositivo, b.idPendiente].includes(d.idDispositivo)), r.message);
    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tA, body: { idSucursal: b.idSucursal, nombre: 'Fuga' } });
    m.revisar('agregar un dispositivo en una sucursal de B → no existe', noExiste(r), r.message);
    r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tA, body: { idSucursal: sucA.idSucursal, nombre: `Fuga A ${ RUN5 }`, idEmpresa: ID.B } });
    const codigoA = r.data?.codigo;
    if (r.data?.id) b.creadosA.dispositivos.push(r.data.id);
    const [dA] = await sql('SELECT idEmpresa FROM dispositivos WHERE idDispositivo = :id', { id: r.data?.id || 0 });
    m.revisar('agregar con idEmpresa=B en el body lo crea en A', dA?.idEmpresa === ID.A, r.message);
    r = await llamar('POST', '/dispositivos/regenerarCodigo', { token: tA, body: { idDispositivo: b.idPendiente } });
    m.revisar('regenerar el código de un dispositivo de B → no existe', noExiste(r), r.message);
    r = await llamar('DELETE', '/dispositivos/deleteDispositivoPendiente', { token: tA, body: { idDispositivo: b.idPendiente } });
    m.revisar('eliminar un dispositivo pendiente de B → no existe', noExiste(r), r.message);
    r = await llamar('PUT', '/dispositivos/revocarDispositivo', { token: tA, body: { idDispositivo: b.idDispositivo } });
    m.revisar('revocar un dispositivo de B → no existe', noExiste(r), r.message);
    r = await llamar('GET', `/dispositivos/getEstadoVinculacion?idDispositivo=${ b.idPendiente }`, { token: tA });
    m.revisar('consultar la vinculación de un dispositivo de B → no existe', noExiste(r), r.message);

    // Un código de A vincula en A, aunque el dispositivo mande B.
    r = await disp('POST', '/vincular', null, { body: { codigo: codigoA, idEmpresa: ID.B, idSucursal: idSucB } });
    const llaveA = r.data?.llave;
    const [vA] = await sql('SELECT idEmpresa, idSucursal, estado FROM dispositivos WHERE idDispositivo = :id', { id: b.creadosA.dispositivos[0] || 0 });
    m.revisar('un código de A vincula el dispositivo en A (no en B, aunque lo pida)', !!llaveA && vA?.idEmpresa === ID.A && vA.idSucursal === sucA.idSucursal && vA.estado === 'VINCULADO', r.message);

    // El dispositivo de A no identifica empleados de B, ni checa con su número.
    r = await checarCon(llaveA, b.cara);
    m.revisar('el dispositivo de A no identifica al empleado de B', r.data?.resultado === 'NO_RECONOCIDO', r.message);
    for (let i = 0; i < 3; i++) await checarCon(llaveA, rostroAleatorio());
    r = await disp('POST', '/checarConNumero', llaveA, { datos: { numeroEmpleado: b.numero } });
    m.revisar('el dispositivo de A no checa con el número de un empleado de B', r.status_code === 1 && /no existe/.test(r.message), r.message);
    r = await disp('POST', '/latido', llaveA, { body: { idEmpresa: ID.B, idSucursal: idSucB } });
    const [nomA] = await sql('SELECT nombreComercial FROM empresas WHERE idEmpresa = :a', { a: ID.A });
    m.revisar('el latido de A con idEmpresa=B en el body sigue siendo de A', r.status_code === 0 && r.data.dispositivo?.empresa === nomA.nombreComercial, r.message);

    // Política
    r = await llamar('GET', `/formasChecado/getFormasSucursal?idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getFormasSucursal con idEmpresa=B solo trae sucursales de A', r.status_code === 0 && !r.data.sucursales.some(s => s.idSucursal === b.idSucursal), r.message);
    r = await llamar('POST', '/formasChecado/setFormaSucursal', { token: tA, body: { idSucursal: b.idSucursal, forma: 'dispositivo', bActiva: false } });
    m.revisar('apagar la forma de una sucursal de B → no existe', noExiste(r), r.message);
    r = await llamar('GET', `/formasChecado/getFormasEmpleado?idEmpleado=${ b.idEmpleado }`, { token: tA });
    m.revisar('formas de un empleado de B → no existe', noExiste(r), r.message);
    r = await llamar('POST', '/formasChecado/setFormaEmpleado', { token: tA, body: { idEmpleado: b.idEmpleado, forma: 'dispositivo', bPermitida: false } });
    m.revisar('excepción para un empleado de B → no existe', noExiste(r), r.message);

    // Consentimiento y rostro
    r = await llamar('GET', `/faceid/getRostroEmpleado?idEmpleado=${ b.idEmpleado }`, { token: tA });
    m.revisar('Face ID de un empleado de B → no existe', noExiste(r), r.message);
    r = await llamar('POST', '/faceid/aceptarConsentimiento', { token: tA, body: { idEmpleado: b.idEmpleado, version: 1, medio: 'PAPEL_FIRMADO' } });
    m.revisar('aceptar el consentimiento de un empleado de B → no existe', noExiste(r), r.message);
    r = await llamar('POST', '/faceid/retirarConsentimiento', { token: tA, body: { idEmpleado: b.idEmpleado } });
    m.revisar('retirar el consentimiento (y el rostro) de un empleado de B → no existe', noExiste(r), r.message);
    const reto = await llamar('GET', '/faceid/getRetoRegistro', { token: tA });
    r = await llamar('POST', '/faceid/registrarRostro', { token: tA, body: { idEmpleado: b.idEmpleado, idReto: reto.data?.idReto, frames: secuencia(b.cara, reto.data?.pasos || []) } });
    m.revisar('registrar el rostro de un empleado de B → no existe', noExiste(r), r.message);
    const [vB] = await sql('SELECT MAX(version) AS v FROM consentimientos_texto WHERE idEmpresa = :b', { b: ID.B });
    r = await llamar('POST', '/faceid/insertConsentimientoTexto', { token: tA, body: { texto: `Texto de fuga ${ RUN5 } `.repeat(5), idEmpresa: ID.B } });
    const [vB2] = await sql('SELECT MAX(version) AS v FROM consentimientos_texto WHERE idEmpresa = :b', { b: ID.B });
    const [enA] = await sql('SELECT COUNT(*) AS n FROM consentimientos_texto WHERE idEmpresa = :a AND texto LIKE :t', { a: ID.A, t: `%fuga ${ RUN5 }%` });
    m.revisar('cambiar el consentimiento con idEmpresa=B lo cambia en A', r.status_code === 0 && Number(vB.v) === Number(vB2.v) && Number(enA.n) === 1, r.message);

    // Por revisar
    r = await llamar('GET', `/marcajes/getPorRevisar?idSucursal=${ b.idSucursal }`, { token: tA });
    m.revisar('getPorRevisar con una sucursal de B → vacío', r.status_code === 0 && r.data.length === 0, r.message);
    r = await llamar('GET', '/marcajes/getPorRevisar', { token: tA });
    m.revisar('getPorRevisar solo trae los de A', r.status_code === 0 && !r.data.some(x => x.idMarcaje === b.idMarcaje), r.message);
    r = await llamar('GET', `/marcajes/getFotoEvidencia?idMarcaje=${ b.idMarcaje }`, { token: tA });
    m.revisar('la foto de un marcaje de B → no existe', noExiste(r), r.message);
    r = await llamar('PUT', '/marcajes/aprobarMarcaje', { token: tA, body: { idMarcaje: b.idMarcaje } });
    m.revisar('aprobar un marcaje de B → no existe', noExiste(r), r.message);
    r = await llamar('PUT', '/marcajes/rechazarMarcaje', { token: tA, body: { idMarcaje: b.idMarcaje, motivo: 'Fuga' } });
    m.revisar('rechazar un marcaje de B → no existe', noExiste(r), r.message);
};

/** Borra lo que se creó para las pruebas del 005 (en A y en B), después de comparar B. */
const limpiarChecador = async (b) => {
    const disps = [b.idDispositivo, b.idPendiente, ...b.creadosA.dispositivos];
    const marcajes = (await sql('SELECT idMarcaje FROM marcajes WHERE idEmpleado = :e OR idDispositivo IN (:d)', { e: b.idEmpleado, d: disps })).map(x => x.idMarcaje);
    if (marcajes.length) {
        for (const a of await sql('SELECT archivo FROM marcajes_evidencias WHERE idMarcaje IN (:m) AND archivo IS NOT NULL', { m: marcajes })) {
            await require('../helpers/evidencias').borrarFoto(a.archivo);
        }
        await ejecutar('DELETE FROM marcajes_evidencias WHERE idMarcaje IN (:m)', { m: marcajes });
        await ejecutar('DELETE FROM marcajes WHERE idMarcaje IN (:m)', { m: marcajes });
    }
    await ejecutar('DELETE FROM marcajes_intentos WHERE idEmpleado = :e OR idDispositivo IN (:d)', { e: b.idEmpleado, d: disps });
    await ejecutar('DELETE FROM bitacora_checador WHERE idEmpleado = :e OR idDispositivo IN (:d)', { e: b.idEmpleado, d: disps });
    await ejecutar("DELETE FROM bitacora_checador WHERE idEmpresa = :a AND tipo = 'CONSENTIMIENTO_TEXTO' AND descripcion LIKE '%versión%' AND idUsuarioAutor IS NOT NULL AND fecha > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) AND JSON_EXTRACT(despues, '$.version') = (SELECT MAX(version) FROM consentimientos_texto WHERE idEmpresa = :a AND texto LIKE :t)", { a: ID.A, t: `%fuga ${ RUN5 }%` });
    await ejecutar('DELETE FROM consentimientos_texto WHERE idEmpresa = :a AND texto LIKE :t', { a: ID.A, t: `%fuga ${ RUN5 }%` });
    for (const t of ['empleados_rostros', 'empleados_consentimientos', 'formas_empleado']) await ejecutar(`DELETE FROM ${ t } WHERE idEmpleado = :e`, { e: b.idEmpleado });
    await ejecutar('DELETE FROM dispositivos WHERE idDispositivo IN (:d)', { d: disps });
    await ejecutar('DELETE FROM empleados WHERE idEmpleado = :e', { e: b.idEmpleado });
};

// ── 006: horarios y días programados ────────────────────────────────────────

const FECHA_B6 = '2030-01-07';

/** En B: plantilla, horario, un día programado y un renglón de bitácora (solo lo que no existía). */
const prepararHorariosB = async (idSucB) => {
    const [emp] = await sql(`SELECT idEmpleado, idSucursalPrincipal FROM empleados
        WHERE idEmpresa = :b AND estado = 'ACTIVO' AND numeroEmpleado NOT LIKE 'FUGA%' ORDER BY idEmpleado LIMIT 1`, { b: ID.B });
    const b = { idEmpleado: emp.idEmpleado, fecha: FECHA_B6, plantilla: false, horario: false, idDia: null, idBitacora: null };
    const [{ n: pl }] = await sql('SELECT COUNT(*) AS n FROM sucursales_horario WHERE idEmpresa = :b AND idSucursal = :s', { b: ID.B, s: idSucB });
    if (!Number(pl)) {
        await ejecutar(`INSERT INTO sucursales_horario (idEmpresa, idSucursal, diaSemana, bDescanso, entrada, salida)
                        VALUES (:b, :s, 1, 0, '09:00', '18:00')`, { b: ID.B, s: idSucB });
        b.plantilla = idSucB;
    }
    const [{ n: ho }] = await sql('SELECT COUNT(*) AS n FROM empleados_horario WHERE idEmpresa = :b AND idEmpleado = :e', { b: ID.B, e: emp.idEmpleado });
    if (!Number(ho)) {
        await ejecutar(`INSERT INTO empleados_horario (idEmpresa, idEmpleado, diaSemana, bDescanso, entrada, salida)
                        VALUES (:b, :e, 1, 0, '09:00', '18:00')`, { b: ID.B, e: emp.idEmpleado });
        b.horario = true;
    }
    const [ya] = await sql('SELECT idDia FROM dias_programados WHERE idEmpresa = :b AND idEmpleado = :e AND fecha = :f',
        { b: ID.B, e: emp.idEmpleado, f: FECHA_B6 });
    if (!ya) {
        [b.idDia] = await ejecutar(`INSERT INTO dias_programados (idEmpresa, idEmpleado, fecha, estado, entrada, salida, horas, tipoJornada, idSucursal, bManual, motivo)
            VALUES (:b, :e, :f, 'LABORABLE', '09:00', '18:00', 9, 'DIURNA', :s, 1, 'Fuga')`, { b: ID.B, e: emp.idEmpleado, f: FECHA_B6, s: emp.idSucursalPrincipal });
    }
    [b.idBitacora] = await ejecutar(`INSERT INTO bitacora_horarios (idEmpresa, idEmpleado, idSucursal, tipo, motivo)
        VALUES (:b, :e, :s, 'HORARIO', :m)`, { b: ID.B, e: emp.idEmpleado, s: idSucB, m: `Fuga ${ RUN5 }` });
    return b;
};

const fugaHorarios = async (m, tA, b, idSucB) => {
    const fechas = require('../helpers/fechas');
    const noExiste = (r) => r.status_code === 1 && /no existe/.test(r.message);
    const [matrizA] = await sql("SELECT idSucursal, zonaHoraria FROM sucursales WHERE idEmpresa = :a AND nombre = 'Matriz'", { a: ID.A });
    const [empA] = await sql(`SELECT idEmpleado FROM empleados WHERE idEmpresa = :a AND estado = 'ACTIVO' AND idSucursalPrincipal = :s
        ORDER BY idEmpleado LIMIT 1`, { a: ID.A, s: matrizA.idSucursal });
    const futura = fechas.sumarDias(fechas.hoy(matrizA.zonaHoraria), 10);
    const maximo = async (t, c) => Number((await sql(`SELECT COALESCE(MAX(${ c }), 0) AS n FROM ${ t }`))[0].n);
    const tope = { bh: await maximo('bitacora_horarios', 'idBitacora'), dia: await maximo('dias_programados', 'idDia') };
    const plantillaA = await sql('SELECT * FROM sucursales_horario WHERE idEmpresa = :a AND idSucursal = :s', { a: ID.A, s: matrizA.idSucursal });
    const dias = [{ diaSemana: 1, estado: 'LABORABLE', entrada: '09:00', salida: '18:00' }];
    const q = (ruta) => llamar('GET', `/horarios/${ ruta }`, { token: tA });
    const p = (ruta, body) => llamar('POST', `/horarios/${ ruta }`, { token: tA, body });
    const idsB = new Set((await sql('SELECT idEmpleado FROM empleados WHERE idEmpresa = :b', { b: ID.B })).map(x => x.idEmpleado));

    let r = await q(`getHorarioEmpleado?idEmpleado=${ b.idEmpleado }`);
    m.revisar('leer el horario de un empleado de B → no existe', noExiste(r), r.message);
    r = await p('setHorarioEmpleado', { idEmpleado: b.idEmpleado, dias, aPartirDe: futura });
    m.revisar('cambiar el horario de un empleado de B → no existe', noExiste(r), r.message);
    r = await q(`getPlantilla?idSucursal=${ idSucB }`);
    m.revisar('leer la plantilla de una sucursal de B → no existe', noExiste(r), r.message);
    r = await p('setPlantilla', { idSucursal: idSucB, dias });
    m.revisar('cambiar la plantilla de una sucursal de B → no existe', noExiste(r), r.message);
    r = await q(`previsualizarAplicar?idSucursal=${ idSucB }`);
    m.revisar('vista previa de aplicar la plantilla de B → no existe', noExiste(r), r.message);
    r = await p('aplicarPlantilla', { idSucursal: idSucB, idEmpleados: [empA.idEmpleado], aPartirDe: futura });
    m.revisar('aplicar la plantilla de una sucursal de B → no existe', noExiste(r), r.message);
    await p('setPlantilla', { idSucursal: matrizA.idSucursal, dias });
    r = await p('aplicarPlantilla', { idSucursal: matrizA.idSucursal, idEmpleados: [b.idEmpleado], aPartirDe: futura });
    m.revisar('aplicar la plantilla de A a un empleado de B → no existe', noExiste(r), r.message);
    r = await q(`getDiasEmpleado?idEmpleado=${ b.idEmpleado }&desde=2030-01-01&hasta=2030-01-31`);
    m.revisar('leer los días de un empleado de B → no existe', noExiste(r), r.message);
    r = await q(`getDiasSucursal?idSucursal=${ idSucB }&fecha=${ b.fecha }`);
    m.revisar('leer los días de una sucursal de B → no existe', noExiste(r), r.message);
    r = await p('setDia', { idEmpleado: b.idEmpleado, fecha: b.fecha, estado: 'DESCANSO', motivo: 'Fuga' });
    m.revisar('cambiar un día de un empleado de B → no existe', noExiste(r), r.message);
    r = await p('regresarDia', { idEmpleado: b.idEmpleado, fecha: b.fecha, motivo: 'Fuga' });
    m.revisar('regresar un día de un empleado de B → no existe', noExiste(r), r.message);
    r = await p('setDiaVarios', { idSucursal: idSucB, fecha: futura, idEmpleados: [empA.idEmpleado], estado: 'DESCANSO', motivo: 'Fuga' });
    m.revisar('cambiar un día en una sucursal de B → no existe', noExiste(r), r.message);
    r = await p('setDiaVarios', { idSucursal: matrizA.idSucursal, fecha: b.fecha, idEmpleados: [b.idEmpleado], estado: 'DESCANSO', motivo: 'Fuga' });
    m.revisar('cambiar un día a varios con un empleado de B → no existe', noExiste(r), r.message);
    r = await p('setDia', { idEmpleado: empA.idEmpleado, fecha: futura, estado: 'LABORABLE', entrada: '09:00', salida: '18:00',
        cobertura: { idSucursalCobertura: idSucB, horaCobertura: '12:00' } });
    m.revisar('cobertura en una sucursal de B → no existe', r.status_code === 1 && /sucursal que cubre no existe/.test(r.message), r.message);
    r = await p('setDia', { idEmpleado: empA.idEmpleado, fecha: futura, estado: 'DESCANSO', motivo: 'Fuga', idSucursal: idSucB });
    m.revisar('mover el día a una sucursal de B → no existe', r.status_code === 1 && /sucursal del día no existe/.test(r.message), r.message);
    r = await q(`getSalidaPlantilla?idSucursal=${ idSucB }&fecha=${ b.fecha }`);
    m.revisar('salida de la plantilla de una sucursal de B → no existe', noExiste(r), r.message);
    r = await q(`getBitacoraHorarios?idEmpleado=${ b.idEmpleado }`);
    m.revisar('bitácora de horarios de un empleado de B → no existe', noExiste(r), r.message);
    r = await q(`getBitacoraHorarios?idSucursal=${ idSucB }&idEmpresa=${ ID.B }`);
    m.revisar('bitácora de horarios de una sucursal de B → no existe', noExiste(r), r.message);
    r = await q(`getHorariosPorAjustar?idEmpresa=${ ID.B }`);
    m.revisar('horarios por ajustar con idEmpresa=B solo trae los de A', r.status_code === 0 && !r.data.some(x => idsB.has(x.idEmpleado)), r.message);
    r = await q(`getHorariosPorAjustar?idSucursal=${ idSucB }`);
    m.revisar('horarios por ajustar de una sucursal de B → no existe', noExiste(r), r.message);
    r = await q(`getSucursalesHorarios?idEmpresa=${ ID.B }`);
    m.revisar('getSucursalesHorarios con idEmpresa=B solo trae las de A', r.status_code === 0 && r.data.length > 0
        && !r.data.some(x => x.idSucursal === idSucB), r.message);

    // Deja A como estaba.
    await ejecutar('DELETE FROM sucursales_horario WHERE idEmpresa = :a AND idSucursal = :s', { a: ID.A, s: matrizA.idSucursal });
    for (const x of plantillaA) {
        await ejecutar(`INSERT INTO sucursales_horario (idEmpresa, idSucursal, diaSemana, bDescanso, entrada, salida, comidaMinutos,
            bComidaDentro, idUsuarioCaptura, fechaCaptura) VALUES (:idEmpresa, :idSucursal, :diaSemana, :bDescanso, :entrada, :salida,
            :comidaMinutos, :bComidaDentro, :idUsuarioCaptura, :fechaCaptura)`, x);
    }
    await ejecutar('DELETE FROM bitacora_horarios WHERE idEmpresa = :a AND idBitacora > :t', { a: ID.A, t: tope.bh });
    await ejecutar('DELETE FROM dias_programados WHERE idEmpresa = :a AND idDia > :t', { a: ID.A, t: tope.dia });
};

/** Borra lo que se preparó en B para el 006, después de comparar B. */
const limpiarHorarios = async (b) => {
    await ejecutar('DELETE FROM bitacora_horarios WHERE idBitacora = :id', { id: b.idBitacora });
    if (b.idDia) await ejecutar('DELETE FROM dias_programados WHERE idDia = :id', { id: b.idDia });
    if (b.horario) await ejecutar('DELETE FROM empleados_horario WHERE idEmpresa = :b AND idEmpleado = :e', { b: ID.B, e: b.idEmpleado });
    if (b.plantilla) await ejecutar('DELETE FROM sucursales_horario WHERE idEmpresa = :b AND idSucursal = :s', { b: ID.B, s: b.plantilla });
};

// ── 009: panel del superadministrador (LP-1, su única excepción) ─────────────
// Las rutas salen de los routers reales montados en models/server.js, no de
// una lista escrita a mano: una ruta nueva entra sola a la prueba.
const { validarJWT } = require('../middlewares/validar-jwt');

const rutasMontadas = () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'models', 'server.js'), 'utf8');
    const bases = Object.fromEntries([...fuente.matchAll(/^\s*(\w+):\s*'(\/api\/[^']*)'/gm)].map(x => [x[1], x[2]]));
    const montadas = [...fuente.matchAll(/this\.app\.use\(\s*this\.paths\.(\w+)\s*,\s*require\('\.\.\/routes\/([\w/]+)'\)\s*\)/g)];
    const rutas = [];
    for (const [, clave, archivo] of montadas) {
        if (!bases[clave]) throw new Error(`models/server.js: this.paths.${ clave } sin ruta`);
        for (const capa of require(`../routes/${ archivo }`).stack) {
            if (!capa.route) throw new Error(`routes/${ archivo }.js: router.use o subrouter no previsto por la prueba de fuga`);
            for (const metodo of Object.keys(capa.route.methods)) {
                rutas.push({ archivo, metodo: metodo.toUpperCase(), ruta: `${ bases[clave] }${ capa.route.path }`.replace(/^\/api/, '').replace(/\/$/, ''),
                    conSesion: capa.route.stack.some(s => s.handle === validarJWT) });
            }
        }
    }
    const sinMontar = fs.readdirSync(path.join(__dirname, '..', 'routes', 'panel')).filter(f => f.endsWith('.js'))
        .filter(f => !montadas.some(x => x[2] === `panel/${ f.replace(/\.js$/, '') }`));
    return { rutas, sinMontar };
};

/** Antes de la foto de B: el token del panel y una sesión de soporte en B, ya cerrada (para getAccesosSoporte). */
const prepararPanel = async () => {
    const tp = await entrarPanel();
    const h = { 'x-token-panel': tp };
    const sB = await llamar('POST', '/panel/soporte/entrarEmpresa', { headers: h, body: { idEmpresa: ID.B, motivo: `Prueba de fuga ${ RUN5 }` } });
    if (sB.status_code !== 0) throw new Error(`No se abrió la sesión de soporte en B: ${ sB.message }`);
    await llamar('POST', '/panel/soporte/salirEmpresa', { headers: h, body: { idSesionSoporte: sB.data.idSesionSoporte } });
    return { tp, ssB: sB.data.idSesionSoporte, ssA: null };
};

const fugaPanel = async (m, tA, pn, b5, idSucB, rolRhB) => {
    // Origen de prueba propio por variante: verificar2fa cuenta los fallos y no debe bloquear la IP de quien corre la prueba.
    let variante = 0;
    const origen = () => ({ 'x-origen-prueba': `fuga-${ RUN5 }-${ variante }` });
    const { rutas, sinMontar } = rutasMontadas();
    const delPanel = rutas.filter(x => x.ruta.startsWith('/panel/'));
    const deEmpresa = rutas.filter(x => !x.ruta.startsWith('/panel/') && x.conSesion);
    const LOGIN = 'POST /panel/auth/login';
    m.revisar(`las rutas de /api/panel salen de los routers montados (${ delPanel.length }) y todo routes/panel/ está montado`,
        !sinMontar.length && fs.readdirSync(path.join(__dirname, '..', 'routes', 'panel')).every(f => delPanel.some(x => `${ x.archivo }.js` === `panel/${ f }`))
        && delPanel.some(x => x.ruta === '/panel/empresas/getCatalogosAlta')
        && delPanel.filter(x => `${ x.metodo } ${ x.ruta }` !== LOGIN).every(x => !x.conSesion), `sin montar: ${ sinMontar.join(', ') }`);

    /** Llama cada ruta con esas cabeceras; regresa las que NO respondieron 401 SESION_PANEL_INVALIDA. */
    const noRechazadas = async (lista, headers, esperado = (r) => r.http === 401 && r.data?.codigo === 'SESION_PANEL_INVALIDA') => {
        const malas = [];
        variante++;
        for (const x of lista) {
            // Con `codigo`, verificar2fa pasa la validación del body y llega a revisar el token.
            const r = await llamar(x.metodo, x.ruta, { headers: { ...origen(), ...headers }, body: x.metodo === 'GET' ? undefined : { idEmpresa: ID.B, codigo: '123456' } });
            if (!esperado(r)) malas.push(`${ x.metodo } ${ x.ruta } → ${ r.http } ${ r.message }`);
        }
        return malas;
    };
    const panelSinLogin = delPanel.filter(x => `${ x.metodo } ${ x.ruta }` !== LOGIN);
    const tSoloB = await entrar('solo.b');
    const sA = await llamar('POST', '/panel/soporte/entrarEmpresa', { headers: { 'x-token-panel': pn.tp }, body: { idEmpresa: ID.A, motivo: `Prueba de fuga ${ RUN5 }` } });
    const tS = sA.data?.token;
    pn.ssA = sA.data?.idSesionSoporte;
    if (!tS) throw new Error(`No se abrió la sesión de soporte en A: ${ sA.message }`);

    // (a) Ninguna sesión de empresa abre el panel, en ninguna de las dos cabeceras.
    for (const [nombre, headers] of [
        ['sin token', {}],
        ['con la sesión del Administrador de A en x-token', { 'x-token': tA }],
        ['con la sesión del Administrador de A en x-token-panel', { 'x-token-panel': tA }],
        ['con la sesión de un usuario (no administrador) de B en las dos cabeceras', { 'x-token': tSoloB, 'x-token-panel': tSoloB }],
        ['con el token de soporte de A en x-token', { 'x-token': tS }],
        ['con el token de soporte de A en x-token-panel', { 'x-token-panel': tS }]
    ]) {
        const malas = await noRechazadas(panelSinLogin, headers);
        m.revisar(`${ nombre }: las ${ panelSinLogin.length } rutas de /api/panel → 401`, !malas.length, malas.slice(0, 5).join(' | '));
    }
    let r = await llamar('POST', '/panel/auth/login', { token: tA, headers: { ...origen(), 'x-token-panel': tA }, body: { idEmpresa: ID.A } });
    m.revisar('el login del panel (la única ruta sin sesión) no da nada con una sesión de empresa', r.status_code === 1 && !r.data?.token && !r.data?.token2fa,
        r.message);

    // (b) El token del panel no sirve en las rutas de empresa.
    for (const [nombre, headers] of [['en x-token', { 'x-token': pn.tp }], ['en x-token-panel', { 'x-token-panel': pn.tp }]]) {
        const malas = await noRechazadas(deEmpresa, headers, (x) => x.http === 401);
        m.revisar(`el token del panel ${ nombre }: las ${ deEmpresa.length } rutas de empresa con validarJWT → 401`, !malas.length, malas.slice(0, 5).join(' | '));
    }
    r = await llamar('POST', '/auth/seleccionarEmpresa', { token: pn.tp, body: { idEmpresa: ID.A } });
    m.revisar('→ ni para escoger empresa', !r.data?.token, `${ r.http } ${ r.message }`);

    // (c) Un token de soporte de A no lee ni escribe nada de B.
    const noExiste = (x) => x.status_code === 1 && /no existe/i.test(x.message);
    for (const [nombre, metodo, ruta, body] of [
        ['leer un empleado de B', 'GET', `/empleados/getEmpleado?idEmpleado=${ b5.idEmpleado }`],
        ['editar una sucursal de B', 'POST', '/sucursales/insertUpdateSucursal', { idSucursal: idSucB, nombre: 'Soporte', zonaHoraria: 'America/Mexico_City', latitud: 19.43, longitud: -99.13 }],
        ['desactivar una sucursal de B', 'PUT', '/sucursales/disableSucursal', { idSucursal: idSucB, bActivo: false }],
        ['leer los permisos de un rol de B', 'GET', `/roles/getPermisosRol?idRol=${ rolRhB.idRol }`],
        ['cambiar los permisos de un rol de B', 'POST', '/roles/setPermisosRol', { idRol: rolRhB.idRol, menus: ['usuarios'], acciones: [] }],
        ['leer la configuración de una sucursal de B', 'GET', `/configuracion/getConfiguracionSucursal?idSucursal=${ idSucB }`],
        ['revocar un dispositivo de B', 'PUT', '/dispositivos/revocarDispositivo', { idDispositivo: b5.idDispositivo }],
        ['aprobar un marcaje de B', 'PUT', '/marcajes/aprobarMarcaje', { idMarcaje: b5.idMarcaje }],
        ['leer el Face ID de un empleado de B', 'GET', `/faceid/getRostroEmpleado?idEmpleado=${ b5.idEmpleado }`],
        ['leer el horario de un empleado de B', 'GET', `/horarios/getHorarioEmpleado?idEmpleado=${ b5.idEmpleado }`]
    ]) {
        r = await llamar(metodo, ruta, { token: tS, body });
        m.revisar(`soporte de A: ${ nombre } → no existe`, noExiste(r), `${ r.http } ${ r.message }`);
    }
    r = await llamar('GET', `/sucursales/getSucursales?estado=todas&idEmpresa=${ ID.B }`, { token: tS });
    m.revisar('soporte de A: getSucursales con idEmpresa=B solo trae las de A', r.status_code === 0 && r.data.length > 0 && !r.data.some(s => s.idSucursal === idSucB), r.message);
    r = await llamar('GET', `/auth/getSesion?idEmpresa=${ ID.B }`, { token: tS });
    m.revisar('soporte de A: getSesion con idEmpresa=B sigue en A', r.data?.empresa?.idEmpresa === ID.A && r.data?.soporte?.idSesionSoporte === pn.ssA,
        JSON.stringify(r.data?.empresa));
    const [h, p, s] = tS.split('.');
    const pl = JSON.parse(Buffer.from(p, 'base64url').toString());
    r = await llamar('GET', '/auth/getSesion', { token: [h, Buffer.from(JSON.stringify({ ...pl, e: ID.B })).toString('base64url'), s].join('.') });
    m.revisar('soporte de A con la empresa alterada en el token → 401', r.http === 401, `${ r.http } ${ r.message }`);

    // (d) Las rutas de empresa del 009 solo regresan lo de la empresa de la sesión.
    const accesosB = (await sql('SELECT idSesionSoporte FROM soporte_sesiones WHERE idEmpresa = :b', { b: ID.B })).map(x => x.idSesionSoporte);
    for (const [quien, token] of [['Administrador de A', tA], ['soporte de A', tS]]) {
        r = await llamar('GET', `/configuracion/getAccesosSoporte?idEmpresa=${ ID.B }`, { token });
        m.revisar(`getAccesosSoporte (${ quien }) con idEmpresa=B: solo los accesos de A`, r.status_code === 0 && accesosB.includes(pn.ssB)
            && r.data.some(a => a.idSesionSoporte === pn.ssA) && !r.data.some(a => accesosB.includes(a.idSesionSoporte)), r.message);
    }
    const [activosA] = await sql("SELECT COUNT(*) AS n FROM empleados WHERE idEmpresa = :a AND estado = 'ACTIVO'", { a: ID.A });
    const [planA] = await sql('SELECT p.nombre FROM empresas_planes ep JOIN cat_planes p ON p.idPlan = ep.idPlan WHERE ep.idEmpresa = :a AND ep.vigente = 1', { a: ID.A });
    r = await llamar('GET', `/global/getAvisoPlan?idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getAvisoPlan con idEmpresa=B: el plan y los activos de A', r.status_code === 0 && r.data.activos === Number(activosA.n) && r.data.plan === planA?.nombre,
        JSON.stringify(r.data));

    await llamar('POST', '/panel/soporte/salirEmpresa', { headers: { 'x-token-panel': pn.tp }, body: { idSesionSoporte: pn.ssA } });
};

/** Quita las sesiones de soporte de la prueba (la bitácora del producto conserva su entrada y salida). */
const limpiarPanel = async (pn) => {
    if (pn.ssA) await ejecutar('DELETE FROM soporte_sesiones WHERE idEmpresa = :a AND idSesionSoporte = :id', { a: ID.A, id: pn.ssA });
    if (pn.ssB) await ejecutar('DELETE FROM soporte_sesiones WHERE idEmpresa = :b AND idSesionSoporte = :id', { b: ID.B, id: pn.ssB });
};

const foto = async () => {
    const f = {};
    for (const t of TABLAS_EMPRESA) {
        f[t] = JSON.stringify(await sql(`SELECT * FROM ${ t } WHERE idEmpresa = :b ORDER BY 1, 2`, { b: ID.B }));
    }
    f.usuarios = JSON.stringify(await sql(`
        SELECT u.* FROM usuarios u
         WHERE EXISTS (SELECT 1 FROM usuarios_empresa ue WHERE ue.idUsuario = u.idUsuario AND ue.idEmpresa = :b)
         ORDER BY u.idUsuario`, { b: ID.B }));
    return f;
};

(async () => {
    const m = marcador();
    const tA = await entrar('admin.a');

    const sucB = (await sql('SELECT idSucursal, nombre FROM sucursales WHERE idEmpresa = :b', { b: ID.B }));
    const [soloB] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('solo.b') });
    const [contador] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('contador') });
    const [zonaA] = await sql('SELECT zona FROM cat_zonas_horarias LIMIT 1');
    const idSucB = sucB[0].idSucursal;
    const rolesB = await sql('SELECT idRol, nombre, plantilla FROM roles WHERE idEmpresa = :b', { b: ID.B });
    const rolAdminB = rolesB.find(r => r.plantilla === 'ADMINISTRADOR');
    const rolRhB = rolesB.find(r => r.plantilla === 'RH');
    const [rolRhA] = await sql("SELECT idRol FROM roles WHERE idEmpresa = :a AND plantilla = 'RH'", { a: ID.A });
    // 005: en B, un empleado con consentimiento y rostro, un dispositivo vinculado
    // y uno pendiente, y un marcaje por revisar (antes de la foto de B).
    const b5 = await prepararChecadorB();
    // 006: en B, plantilla, horario, un día programado y su bitácora.
    const b6 = await prepararHorariosB(idSucB);
    // 009: token del panel y una sesión de soporte (cerrada) en B.
    const pn = await prepararPanel();
    const antes = await foto();
    const creadasEnA = [];

    const noExiste = (r) => r.status_code === 1;
    const sinB = (lista, campo) => Array.isArray(lista) && !lista.some(x => sucB.some(s => s[campo] === x[campo]));

    // ── Sucursales ──
    let r = await llamar('GET', `/sucursales/getSucursales?estado=todas&idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getSucursales con idEmpresa=B en el query solo trae las de A',
        r.status_code === 0 && sinB(r.data, 'idSucursal') && r.data.length > 0, JSON.stringify(r).slice(0, 200));

    r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA,
        body: { idSucursal: idSucB, nombre: 'Hackeada', zonaHoraria: zonaA.zona, latitud: 19.4326, longitud: -99.1332 } });
    m.revisar('editar una sucursal de B → no existe', noExiste(r), r.message);

    r = await llamar('PUT', '/sucursales/disableSucursal', { token: tA, body: { idSucursal: idSucB, bActivo: false } });
    m.revisar('desactivar una sucursal de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA,
        body: { nombre: `Fuga ${ Date.now() }`, zonaHoraria: zonaA.zona, idEmpresa: ID.B } });
    if (r.status_code === 0) creadasEnA.push(r.data.id);
    const [nueva] = r.status_code === 0 ? await sql('SELECT idEmpresa FROM sucursales WHERE idSucursal = :id', { id: r.data.id }) : [];
    m.revisar('alta con idEmpresa=B en el body se crea en A', nueva?.idEmpresa === ID.A, JSON.stringify(nueva || r));

    // ── Usuarios de la empresa ──
    r = await llamar('GET', `/usuariosEmpresa/getUsuariosEmpresa?idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getUsuariosEmpresa con idEmpresa=B solo trae los de A',
        r.status_code === 0 && !r.data.some(u => u.idUsuario === soloB.idUsuario), r.message);

    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tA,
        body: { idUsuario: soloB.idUsuario, roles: [], bTodasSucursales: true } });
    m.revisar('editar el acceso de un usuario solo de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tA,
        body: { idUsuario: contador.idUsuario, roles: [rolRhA.idRol], bTodasSucursales: false, sucursales: [idSucB] } });
    m.revisar('ligar a un usuario de A una sucursal de B → no existe', noExiste(r), r.message);

    r = await llamar('PUT', '/usuariosEmpresa/quitarAcceso', { token: tA, body: { idUsuario: soloB.idUsuario, idEmpresa: ID.B } });
    m.revisar('quitar el acceso a un usuario de B (con idEmpresa=B) → no existe', noExiste(r), r.message);

    r = await llamar('PUT', '/usuariosEmpresa/restablecerPassword', { token: tA,
        body: { idUsuario: soloB.idUsuario, password: 'Fuga12345', idEmpresa: ID.B } });
    m.revisar('restablecer la contraseña de un usuario de B → no existe', noExiste(r), r.message);

    r = await llamar('PUT', '/usuariosEmpresa/restablecerPassword', { token: tA,
        body: { idUsuario: contador.idUsuario, password: 'Fuga12345' } });
    m.revisar('restablecer la contraseña de una cuenta que también está en B → se rechaza', noExiste(r), r.message);

    const correoFuga = `fuga.${ Date.now() }@demo.test`;
    r = await llamar('POST', '/usuariosEmpresa/darAcceso', { token: tA,
        body: { correo: correoFuga, nombre: 'Fuga', password: 'Fuga12345', bTodasSucursales: false, sucursales: [idSucB] } });
    m.revisar('dar acceso con una sucursal de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/usuariosEmpresa/darAcceso', { token: tA,
        body: { correo: correoFuga, nombre: 'Fuga', password: 'Fuga12345', idEmpresa: ID.B } });
    const [accFuga] = await sql(`SELECT ue.idEmpresa FROM usuarios_empresa ue JOIN usuarios u ON u.idUsuario = ue.idUsuario
                                  WHERE u.correo = :c`, { c: correoFuga });
    m.revisar('dar acceso con idEmpresa=B en el body lo da en A', accFuga?.idEmpresa === ID.A, JSON.stringify(accFuga || r));

    // ── Roles y permisos (002) ──
    r = await llamar('GET', `/roles/getRoles?estado=todos&idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getRoles con idEmpresa=B solo trae los de A',
        r.status_code === 0 && r.data.length > 0 && !r.data.some(x => rolesB.some(b => b.idRol === x.idRol)), r.message);

    r = await llamar('GET', `/roles/getPermisosRol?idRol=${ rolRhB.idRol }`, { token: tA });
    m.revisar('leer los permisos de un rol de B → no existe', noExiste(r), r.message);

    r = await llamar('GET', `/roles/getMenuDeRol?idRol=${ rolAdminB.idRol }`, { token: tA });
    m.revisar('"Ver como" con un rol de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/roles/insertUpdateRol', { token: tA, body: { idRol: rolRhB.idRol, nombre: 'Hackeado' } });
    m.revisar('editar un rol de B → no existe', noExiste(r), r.message);

    r = await llamar('PUT', '/roles/disableRol', { token: tA, body: { idRol: rolRhB.idRol, bActivo: false } });
    m.revisar('desactivar un rol de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/roles/setPermisosRol', { token: tA, body: { idRol: rolRhB.idRol, menus: ['usuarios'], acciones: [] } });
    m.revisar('cambiar permisos de un rol de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/roles/insertUpdateRol', { token: tA, body: { nombre: `Copia ${ Date.now() }`, copiarDe: rolAdminB.idRol } });
    m.revisar('crear un rol copiando uno de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/usuariosEmpresa/updateUsuarioEmpresa', { token: tA,
        body: { idUsuario: contador.idUsuario, roles: [rolAdminB.idRol], bTodasSucursales: true } });
    m.revisar('asignar a un usuario de A un rol de B → no existe', noExiste(r), r.message);

    r = await llamar('GET', `/usuariosEmpresa/getPermisosDirectos?idUsuario=${ soloB.idUsuario }`, { token: tA });
    m.revisar('leer permisos directos de un usuario de B → no existe', noExiste(r), r.message);

    r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
        body: { idUsuario: soloB.idUsuario, menus: ['usuarios'], acciones: ['usuarios_Editar'] } });
    m.revisar('dar permisos directos a un usuario de B → no existe', noExiste(r), r.message);

    r = await llamar('GET', `/roles/getBitacoraPermisos?idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('la bitácora de permisos con idEmpresa=B solo trae la de A',
        r.status_code === 0 && !r.data.some(x => rolesB.some(b => b.idRol === x.idRol)), r.message);

    // ── Preferencias (003a) ──
    await ejecutar(`INSERT INTO usuarios_preferencias (idEmpresa, idUsuario, ambito, clave, valor)
                    VALUES (:b, :u, 'apariencia', 'paleta', '"oceano"')
                    ON DUPLICATE KEY UPDATE valor = '"oceano"'`, { b: ID.B, u: contador.idUsuario });
    const fotoPrefB = JSON.stringify(await sql('SELECT * FROM usuarios_preferencias WHERE idEmpresa = :b ORDER BY 1, 2, 3, 4', { b: ID.B }));
    const tCA = await entrar('contador', ID.A);
    r = await llamar('POST', '/global/setPreferencia', { token: tCA,
        body: { ambito: 'apariencia', clave: 'paleta', valor: 'terracota', idEmpresa: ID.B, idUsuario: soloB.idUsuario } });
    const [prefA] = await sql(`SELECT valor FROM usuarios_preferencias
                                WHERE idEmpresa = :a AND idUsuario = :u AND ambito = 'apariencia' AND clave = 'paleta'`,
    { a: ID.A, u: contador.idUsuario });
    m.revisar('setPreferencia con idEmpresa=B guarda en A y para el usuario de la sesión',
        r.status_code === 0 && prefA?.valor === '"terracota"'
        && fotoPrefB === JSON.stringify(await sql('SELECT * FROM usuarios_preferencias WHERE idEmpresa = :b ORDER BY 1, 2, 3, 4', { b: ID.B })),
        JSON.stringify(prefA));
    r = await llamar('GET', `/global/getPreferencias?idEmpresa=${ ID.B }`, { token: tCA });
    m.revisar('getPreferencias con idEmpresa=B trae las de A', r.data?.apariencia?.paleta === 'terracota', JSON.stringify(r.data));
    // Viajan con la cuenta: otra sesión (otro equipo) lee lo mismo.
    const tCA2 = await entrar('contador', ID.A);
    r = await llamar('GET', '/global/getPreferencias', { token: tCA2 });
    m.revisar('las preferencias se leen igual desde otra sesión', r.data?.apariencia?.paleta === 'terracota', JSON.stringify(r.data));
    // Una sucursal desactivada guardada como preferencia: se ignora sin error.
    const [sucA] = await sql('SELECT idSucursal FROM sucursales WHERE idEmpresa = :a ORDER BY idSucursal LIMIT 1', { a: ID.A });
    await llamar('POST', '/global/setPreferencia', { token: tCA, body: { ambito: 'sesion', clave: 'sucursal', valor: sucA.idSucursal } });
    await ejecutar('UPDATE sucursales SET bActivo = 0 WHERE idSucursal = :s', { s: sucA.idSucursal });
    r = await llamar('GET', '/global/getPreferencias', { token: tCA2 });
    const ses = await llamar('GET', '/auth/getSesion', { token: tCA2 });
    m.revisar('una preferencia que apunta a una sucursal desactivada no rompe la sesión',
        r.status_code === 0 && ses.status_code === 0 && !ses.data.sucursales.some(s => s.idSucursal === sucA.idSucursal),
        `${ r.message } / ${ ses.message }`);
    await ejecutar('UPDATE sucursales SET bActivo = 1 WHERE idSucursal = :s', { s: sucA.idSucursal });
    await ejecutar('DELETE FROM usuarios_preferencias WHERE idUsuario = :u', { u: contador.idUsuario });

    // ── Configuración de la empresa (003) ──
    r = await llamar('GET', `/configuracion/getConfiguracion?idEmpresa=${ ID.B }`, { token: tA });
    const excepcionesVistas = (r.data?.grupos || []).flatMap(g => g.ajustes).flatMap(a => a.excepciones);
    m.revisar('getConfiguracion con idEmpresa=B trae la de A', r.status_code === 0
        && !excepcionesVistas.some(e => sucB.some(s => s.idSucursal === e.idSucursal)), r.message);
    r = await llamar('GET', `/configuracion/getConfiguracionSucursal?idSucursal=${ idSucB }`, { token: tA });
    m.revisar('getConfiguracionSucursal con una sucursal de B → no existe', noExiste(r), r.message);
    r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tA,
        body: { idSucursal: idSucB, clave: 'asistencia.tolerancia_retardo', valor: 30 } });
    m.revisar('poner una excepción en una sucursal de B → no existe', noExiste(r), r.message);
    r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA,
        body: { idEmpresa: ID.B, valores: [{ clave: 'asistencia.dias_cierre', valor: 9 }] } });
    const [cierreA] = await sql(`SELECT valor FROM configuracion_valores
        WHERE idEmpresa = :a AND idSucursal IS NULL AND clave = 'asistencia.dias_cierre'`, { a: ID.A });
    m.revisar('setConfiguracion con idEmpresa=B guarda en A', r.status_code === 0 && cierreA?.valor === '9', r.message);
    r = await llamar('GET', `/configuracion/getBitacoraConfiguracion?idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('la bitácora de configuración con idEmpresa=B solo trae la de A',
        r.status_code === 0 && !r.data.some(x => sucB.some(s => s.idSucursal === x.idSucursal)), r.message);
    await ejecutar('DELETE FROM configuracion_valores WHERE idEmpresa = :a', { a: ID.A });
    await ejecutar('DELETE FROM bitacora_configuracion WHERE idEmpresa = :a', { a: ID.A });
    await ejecutar('CALL sp_preparar_configuracion(:a)', { a: ID.A });

    // ── Empleados, puestos y departamentos (004) ──
    {
        const empB = await sql('SELECT idEmpleado, estado FROM empleados WHERE idEmpresa = :b ORDER BY idEmpleado', { b: ID.B });
        const activoB = empB.find(e => e.estado === 'ACTIVO');
        const bajaB = empB.find(e => e.estado === 'BAJA');
        const [puestoB] = await sql('SELECT idPuesto AS id FROM puestos WHERE idEmpresa = :b LIMIT 1', { b: ID.B });
        const [deptoB] = await sql('SELECT idDepartamento AS id FROM departamentos WHERE idEmpresa = :b LIMIT 1', { b: ID.B });
        const [empA] = await sql(`SELECT idEmpleado FROM empleados WHERE idEmpresa = :a AND estado = 'ACTIVO' ORDER BY idEmpleado LIMIT 1`, { a: ID.A });
        const [sucMatrizA] = await sql(`SELECT idSucursal FROM sucursales WHERE idEmpresa = :a AND nombre = 'Matriz'`, { a: ID.A });
        const maximo = async (t, c) => Number((await sql(`SELECT COALESCE(MAX(${ c }), 0) AS n FROM ${ t }`))[0].n);
        const tope = { e: await maximo('empleados', 'idEmpleado'), p: await maximo('puestos', 'idPuesto'),
            d: await maximo('departamentos', 'idDepartamento'), b: await maximo('bitacora_empleados', 'idBitacora') };
        const multipart = async (ruta, campos, buffer) => {
            const fd = new FormData();
            for (const [k, v] of Object.entries(campos)) fd.append(k, String(v));
            fd.append('archivo', new Blob([buffer], { type: 'image/png' }), 'foto.png');
            const res = await fetch(`${ API }${ ruta }`, { method: 'POST', headers: { 'x-token': tA }, body: fd });
            return res.json().catch(() => ({}));
        };
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const idsB = new Set(empB.map(e => e.idEmpleado));
        const noExisteEmp = (x) => x.status_code === 1 && /no existe/.test(x.message);

        r = await llamar('GET', `/empleados/getEmpleados?estado=todos&porPagina=100&idEmpresa=${ ID.B }`, { token: tA });
        m.revisar('getEmpleados con idEmpresa=B solo trae los de A',
            r.status_code === 0 && r.data.filas.length > 0 && !r.data.filas.some(e => idsB.has(e.idEmpleado)), r.message);
        r = await llamar('GET', `/empleados/getEmpleado?idEmpleado=${ activoB.idEmpleado }`, { token: tA });
        m.revisar('leer un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { idEmpleado: activoB.idEmpleado, nombre: 'Hackeado' } });
        m.revisar('editar un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: activoB.idEmpleado, fechaBaja: '2025-01-01', motivoBaja: 'Fuga' } });
        m.revisar('dar de baja a un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('POST', '/empleados/reingresoEmpleado', { token: tA, body: { idEmpleado: bajaB.idEmpleado, fechaIngreso: '2025-12-01' } });
        m.revisar('reingresar a un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: activoB.idEmpleado, precioHora: 1, aPartirDe: '2025-01-01' } });
        m.revisar('cambiar el precio de un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('GET', `/empleados/getPreciosEmpleado?idEmpleado=${ activoB.idEmpleado }`, { token: tA });
        m.revisar('leer el precio de un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('GET', `/empleados/getFotoEmpleado?idEmpleado=${ activoB.idEmpleado }`, { token: tA });
        m.revisar('ver la foto de un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await multipart('/empleados/setFotoEmpleado', { idEmpleado: activoB.idEmpleado }, PNG);
        m.revisar('subir la foto de un empleado de B → no existe', noExisteEmp(r), r.message);
        r = await llamar('DELETE', `/empleados/deleteFotoEmpleado?idEmpleado=${ activoB.idEmpleado }`, { token: tA });
        m.revisar('quitar la foto de un empleado de B → no existe', noExisteEmp(r), r.message);

        const alta = { nombre: 'Fuga', apellidoPaterno: 'Empleado', idSucursalPrincipal: sucMatrizA.idSucursal, fechaIngreso: '2025-01-01' };
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { ...alta, idSucursalPrincipal: idSucB } });
        m.revisar('alta en A con una sucursal de B → no existe', r.status_code === 1 && /sucursal principal no existe/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { ...alta, idPuesto: puestoB.id } });
        m.revisar('alta en A con un puesto de B → no existe', r.status_code === 1 && /puesto no existe/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { ...alta, idDepartamento: deptoB.id } });
        m.revisar('alta en A con un departamento de B → no existe', r.status_code === 1 && /departamento no existe/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { ...alta, idUsuario: soloB.idUsuario } });
        m.revisar('alta en A ligada a un usuario solo de B → no existe', r.status_code === 1 && /no existe en esta empresa/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { idEmpleado: empA.idEmpleado, idSucursalOperativa: idSucB } });
        m.revisar('mover a un empleado de A a una sucursal de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { ...alta, numeroEmpleado: 'FUGA-1', idEmpresa: ID.B } });
        const [altaFuga] = r.status_code === 0 ? await sql('SELECT idEmpresa FROM empleados WHERE idEmpleado = :id', { id: r.data.id }) : [];
        m.revisar('alta de empleado con idEmpresa=B en el body se crea en A', altaFuga?.idEmpresa === ID.A, JSON.stringify(altaFuga || r));

        r = await llamar('GET', `/puestos/getPuestos?estado=todos&idEmpresa=${ ID.B }`, { token: tA });
        m.revisar('getPuestos con idEmpresa=B solo trae los de A', r.status_code === 0 && !r.data.some(p => p.id === puestoB.id), r.message);
        r = await llamar('POST', '/puestos/insertUpdatePuesto', { token: tA, body: { id: puestoB.id, nombre: 'Hackeado' } });
        m.revisar('editar un puesto de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('PUT', '/puestos/disablePuesto', { token: tA, body: { id: puestoB.id, bActivo: false } });
        m.revisar('desactivar un puesto de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('POST', '/departamentos/insertUpdateDepartamento', { token: tA, body: { id: deptoB.id, nombre: 'Hackeado' } });
        m.revisar('editar un departamento de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('PUT', '/departamentos/disableDepartamento', { token: tA, body: { id: deptoB.id, bActivo: false } });
        m.revisar('desactivar un departamento de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('GET', `/empleados/getCatalogosEmpleado?idEmpresa=${ ID.B }`, { token: tA });
        m.revisar('getCatalogosEmpleado con idEmpresa=B trae los de A', r.status_code === 0
            && !r.data.sucursales.some(s => s.idSucursal === idSucB) && !r.data.puestos.some(p => p.id === puestoB.id)
            && !r.data.usuarios.some(u => u.idUsuario === soloB.idUsuario), r.message);
        const [{ n: activosA }] = await sql(`SELECT COUNT(DISTINCT idEmpleado) AS n FROM empleados_periodos
            WHERE idEmpresa = :a AND fechaIngreso <= '2026-01-01' AND (fechaBaja IS NULL OR fechaBaja >= '2026-01-01')`, { a: ID.A });
        r = await llamar('GET', `/empleados/getEmpleadosActivosEn?fecha=2026-01-01&idEmpresa=${ ID.B }`, { token: tA });
        m.revisar('getEmpleadosActivosEn con idEmpresa=B cuenta los de A', r.data?.activos === Number(activosA), `${ r.data?.activos } / ${ activosA }`);
        r = await llamar('POST', '/empleados/importarEmpleados', { token: tA, body: { crearCatalogos: false, renglones: [
            { renglon: 2, datos: { numeroEmpleado: 'FUGA-2', nombre: 'Fuga', apellidoPaterno: 'Importada', sucursal: 'Centro', fechaIngreso: '2025-01-01', puesto: 'Cajero' } }] } });
        m.revisar('importar en A con la sucursal y el puesto de B → se rechaza', r.status_code === 0 && r.data.cargados === 0
            && r.data.rechazados[0]?.errores.some(x => /"Centro" no existe/.test(x)) && r.data.rechazados[0].errores.some(x => /"Cajero" no existe/.test(x)),
        JSON.stringify(r.data));

        // Limpieza de lo creado en A.
        const nuevos = (await sql('SELECT idEmpleado FROM empleados WHERE idEmpleado > :n', { n: tope.e })).map(x => x.idEmpleado);
        await ejecutar('DELETE FROM bitacora_empleados WHERE idBitacora > :n', { n: tope.b });
        if (nuevos.length) {
            // 006: el alta copia la plantilla y genera sus días.
            for (const t of ['dias_programados', 'empleados_horario', 'bitacora_horarios']) {
                await ejecutar(`DELETE FROM ${ t } WHERE idEmpleado IN (:ids)`, { ids: nuevos });
            }
            await ejecutar('DELETE FROM empleados_precios WHERE idEmpleado IN (:ids)', { ids: nuevos });
            await ejecutar('DELETE FROM empleados_periodos WHERE idEmpleado IN (:ids)', { ids: nuevos });
            await ejecutar('DELETE FROM empleados WHERE idEmpleado IN (:ids)', { ids: nuevos });
        }
        await ejecutar('DELETE FROM puestos WHERE idPuesto > :n', { n: tope.p });
        await ejecutar('DELETE FROM departamentos WHERE idDepartamento > :n', { n: tope.d });
    }

    // ── Proceso de marcaje y dispositivo checador (005) ──
    await fugaChecador(m, tA, b5, idSucB);

    // ── Horarios y días programados (006) ──
    await fugaHorarios(m, tA, b6, idSucB);

    // ── Panel del superadministrador y sesión de soporte (009) ──
    await fugaPanel(m, tA, pn, b5, idSucB, rolRhB);

    // ── Sesión ──
    r = await llamar('POST', '/auth/seleccionarEmpresa', { token: tA, body: { idEmpresa: ID.B } });
    m.revisar('cambiar a la empresa B sin acceso → se rechaza', r.status_code === 1 && !r.data?.token, r.message);

    r = await llamar('GET', `/auth/getSesion?idEmpresa=${ ID.B }`, { token: tA });
    m.revisar('getSesion con idEmpresa=B sigue en A', r.data?.empresa?.idEmpresa === ID.A, JSON.stringify(r.data?.empresa));

    // Token con la empresa cambiada a mano (firma inválida).
    const [h, p, s] = tA.split('.');
    const pl = JSON.parse(Buffer.from(p, 'base64url').toString());
    const falso = [h, Buffer.from(JSON.stringify({ ...pl, e: ID.B })).toString('base64url'), s].join('.');
    r = await llamar('GET', '/sucursales/getSucursales', { token: falso });
    m.revisar('token con la empresa alterada → sesión inválida', r.http === 401, `${ r.http } ${ r.message }`);

    r = await llamar('POST', '/cuenta/updateMiCuenta', { token: tA, body: { nombre: 'Ana Administradora (A)', idEmpresa: ID.B, idUsuario: soloB.idUsuario } });
    const [nombreSoloB] = await sql('SELECT nombre FROM usuarios WHERE idUsuario = :id', { id: soloB.idUsuario });
    m.revisar('Mi cuenta con idUsuario de B solo cambia la propia', r.status_code === 0 && nombreSoloB.nombre === 'Sofía Solo B', nombreSoloB.nombre);

    // ── Las filas de B no cambiaron ──
    const despues = await foto();
    for (const t of Object.keys(antes)) {
        m.revisar(`filas de B sin cambios: ${ t }`, antes[t] === despues[t]);
    }

    // Limpieza de lo que se creó en A durante la prueba.
    if (creadasEnA.length) {
        await ejecutar('DELETE FROM formas_sucursal WHERE idSucursal IN (:ids)', { ids: creadasEnA });
        await ejecutar('DELETE FROM sucursales WHERE idSucursal IN (:ids)', { ids: creadasEnA });
    }
    await ejecutar(`DELETE ue FROM usuarios_empresa ue JOIN usuarios u ON u.idUsuario = ue.idUsuario WHERE u.correo = :c`, { c: correoFuga });
    await ejecutar('DELETE FROM usuarios WHERE correo = :c', { c: correoFuga });
    await limpiarChecador(b5);
    await limpiarHorarios(b6);
    await limpiarPanel(pn);

    await m.terminar('Pruebas de fuga A→B');
})().catch(async (e) => { console.error('✘', e.message); process.exit(1); });
