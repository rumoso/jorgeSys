#!/usr/bin/env node
// =============================================================================
// Pruebas de horarios y días programados (análisis 006)
//     node scripts/instalar.js --demo --reiniciar   (una vez)
//     npm run dev                                   (en otra terminal)
//     npm run pruebas:horarios
// Crea empleados de prueba en la empresa demo A (números T6-…) y al final
// borra todo lo que creó y deja las plantillas como estaban.
// =============================================================================
const { DateTime } = require('luxon');
const { ID, llamar, entrar, sql, ejecutar, marcador } = require('./lib-pruebas');
const { TABLAS_EMPRESA } = require('../helpers/tablasEmpresa');
const fechas = require('../helpers/fechas');
const { asegurarEmpresa } = require('../helpers/tareaDiasProgramados');

const RUN = Date.now().toString(36).slice(-5);
const sinPermiso = (r) => r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO';
const dow = (f) => DateTime.fromFormat(f, 'yyyy-MM-dd', { zone: 'utc' }).weekday;
/** La primera fecha >= desde que cae en el día de la semana `d`. */
const siguiente = (desde, d) => { let f = desde; while (dow(f) !== d) f = fechas.sumarDias(f, 1); return f; };
const semana = (f) => [1, 2, 3, 4, 5, 6, 7].map(d => ({ diaSemana: d, ...f(d) }));
const lab = (entrada, salida, comidaMinutos = 0, bComidaDentro = false) => ({ estado: 'LABORABLE', entrada, salida, comidaMinutos, bComidaDentro });
const DESC = { estado: 'DESCANSO', entrada: null, salida: null };
const SIN = { estado: 'SIN_HORARIO', entrada: null, salida: null };

const V1 = semana(d => (d <= 5 ? lab('09:00', '18:00', 60) : d === 6 ? lab('09:00', '14:00') : DESC));
const V2 = semana(d => (d <= 5 ? lab('08:00', '16:00', 30, true) : DESC));
const V3 = semana(d => (d <= 5 ? lab('07:00', '15:00') : DESC));
const PROPIO = semana(() => lab('10:00', '19:00', 60));
const NORTE = semana(d => (d <= 5 ? lab('07:00', '16:00', 60) : DESC));
const VACIA = semana(() => SIN);

(async () => {
    const m = marcador();
    const tA = await entrar('admin.a');
    const tC = await entrar('contador', ID.A);
    const tE = await entrar('encargado.a');
    const [matriz] = await sql("SELECT idSucursal, zonaHoraria FROM sucursales WHERE idEmpresa = :a AND nombre = 'Matriz'", { a: ID.A });
    const [norte] = await sql("SELECT idSucursal, zonaHoraria FROM sucursales WHERE idEmpresa = :a AND nombre = 'Norte'", { a: ID.A });
    const [encargado] = await sql("SELECT idUsuario FROM usuarios WHERE correo = 'encargado.a@demo.test'");
    const maximo = async (t, c) => Number((await sql(`SELECT COALESCE(MAX(${ c }), 0) AS n FROM ${ t }`))[0].n);
    const tope = {
        dia: await maximo('dias_programados', 'idDia'), bh: await maximo('bitacora_horarios', 'idBitacora'),
        be: await maximo('bitacora_empleados', 'idBitacora'), bp: await maximo('bitacora_permisos', 'idBitacora')
    };
    const plantillasAntes = await sql('SELECT * FROM sucursales_horario WHERE idEmpresa = :a', { a: ID.A });
    const directosAntes = (await llamar('GET', `/usuariosEmpresa/getPermisosDirectos?idUsuario=${ encargado.idUsuario }`, { token: tA })).data;
    const [cSem] = await sql(`SELECT COALESCE(v.valor, c.valor) AS v FROM cat_constantes c
        LEFT JOIN constantes_valores v ON v.clave = c.clave AND v.idEmpresa = :a WHERE c.clave = 'horarios.semanas_adelante'`, { a: ID.A });
    const semanas = Number(cSem.v);
    const hoy = fechas.hoy(matriz.zonaHoraria);
    const hoyN = fechas.hoy(norte.zonaHoraria);
    const mas = (n) => fechas.sumarDias(hoy, n);

    const dia = async (idEmpleado, fecha) => (await sql('SELECT * FROM dias_programados WHERE idEmpleado = :e AND fecha = :f', { e: idEmpleado, f: fecha }))[0];
    const horario = async (id, token = tA) => (await llamar('GET', `/horarios/getHorarioEmpleado?idEmpleado=${ id }`, { token })).data;
    const alta = async (n, idSucursal, fechaIngreso) => {
        const r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: {
            numeroEmpleado: `T6-${ RUN }-${ n }`, nombre: `Prueba${ n }`, apellidoPaterno: `Horario${ RUN }`,
            idSucursalPrincipal: idSucursal, fechaIngreso } });
        if (r.status_code !== 0) throw new Error(`Alta ${ n }: ${ r.message }`);
        return r.data.id;
    };
    const plantilla = (idSucursal, dias) => llamar('POST', '/horarios/setPlantilla', { token: tA, body: { idSucursal, dias } });
    const setDia = (token, body) => llamar('POST', '/horarios/setDia', { token, body });

    try {
        // ── Plantillas y alta ──
        let r = await plantilla(matriz.idSucursal, V1);
        m.revisar('guardar la plantilla de Matriz', r.status_code === 0 && /No cambió el horario de ningún empleado/.test(r.message), r.message);
        r = await plantilla(norte.idSucursal, VACIA);
        m.revisar('dejar vacía la plantilla de Norte', r.status_code === 0, r.message);

        const E1 = await alta(1, matriz.idSucursal, hoy);
        const E2 = await alta(2, matriz.idSucursal, hoy);
        const E3 = await alta(3, matriz.idSucursal, hoy);
        const E4 = await alta(4, norte.idSucursal, fechas.sumarDias(hoyN, -40));
        const E5 = await alta(5, norte.idSucursal, hoyN);

        let h = await horario(E1);
        m.revisar('empleado nuevo copia la plantilla de su sucursal', h?.bIgualPlantilla === true && h.dias[0].entrada === '09:00'
            && h.dias[6].estado === 'DESCANSO' && h.totalHoras === 45, JSON.stringify(h?.dias?.[0]));
        r = await llamar('GET', `/horarios/getDiasEmpleado?idEmpleado=${ E1 }&desde=${ hoy }&hasta=${ mas(semanas * 7 + 5) }`, { token: tA });
        m.revisar('→ tiene días de hoy al horizonte', r.status_code === 0 && r.data.horizonte === mas(semanas * 7)
            && r.data.dias.length === semanas * 7 + 1 && r.data.dias[0].fecha === hoy && r.data.dias.at(-1).fecha === r.data.horizonte,
        `${ r.data?.dias?.length } días, horizonte ${ r.data?.horizonte }`);
        const lunes = siguiente(mas(1), 1);
        let d = r.data.dias.find(x => x.fecha === lunes);
        m.revisar('→ el lunes: 9:00–18:00, 8 h diurna, en Matriz, sin marca de manual', d?.entrada === '09:00' && d.horas === 8
            && d.tipoJornada === 'DIURNA' && d.idSucursal === matriz.idSucursal && !d.bManual && d.precioHora === null, JSON.stringify(d));
        const [{ n: antesDeIngreso }] = await sql('SELECT COUNT(*) AS n FROM dias_programados WHERE idEmpleado = :e AND fecha < :h', { e: E4, h: hoyN });
        m.revisar('el alta no genera días pasados (ingreso hace 40 días)', Number(antesDeIngreso) === 0);
        h = await horario(E5);
        m.revisar('empleado de una sucursal sin plantilla queda sin horario', h?.bSinHorario === true, JSON.stringify(h?.dias?.[0]));
        r = await llamar('GET', `/horarios/getDiasEmpleado?idEmpleado=${ E5 }&desde=${ hoyN }&hasta=${ hoyN }`, { token: tA });
        m.revisar('→ sus días quedan SIN_HORARIO', r.data?.dias?.[0]?.estado === 'SIN_HORARIO', JSON.stringify(r.data?.dias?.[0]));

        // ── Plantilla: no cambia a nadie; vista previa; aplicar ──
        r = await plantilla(norte.idSucursal, NORTE);
        h = await horario(E5);
        m.revisar('cambiar la plantilla de Norte no cambia a sus empleados', r.status_code === 0 && h.bSinHorario === true, r.message);

        r = await llamar('POST', '/horarios/setHorarioEmpleado', { token: tA, body: { idEmpleado: E2, dias: PROPIO, aPartirDe: hoy } });
        m.revisar('horario propio de 56 h: se guarda con aviso semanal', r.status_code === 0
            && r.data.avisos.some(a => a.tipo === 'SEMANAL' && a.horas === 56 && a.maximo === 48)
            && r.data.avisos.filter(a => a.tipo === 'DIARIO').length === 0, JSON.stringify(r.data?.avisos));

        r = await plantilla(matriz.idSucursal, V2);
        h = await horario(E1);
        m.revisar('cambiar la plantilla de Matriz no cambia a E1', r.status_code === 0 && h.dias[0].entrada === '09:00' && !h.bIgualPlantilla,
            JSON.stringify(h?.dias?.[0]));
        await llamar('POST', '/horarios/setHorarioEmpleado', { token: tA, body: { idEmpleado: E3, dias: V2, aPartirDe: hoy } });
        r = await llamar('GET', `/horarios/previsualizarAplicar?idSucursal=${ matriz.idSucursal }`, { token: tA });
        const grupo = (id) => r.data?.empleados?.find(x => x.idEmpleado === id)?.grupo;
        m.revisar('vista previa: "cambiaría" (plantilla anterior), "propio" e "igual"',
            grupo(E1) === 'CAMBIARIA' && grupo(E2) === 'PROPIO' && grupo(E3) === 'IGUAL' && !grupo(E4), `${ grupo(E1) } ${ grupo(E2) } ${ grupo(E3) }`);
        r = await llamar('POST', '/horarios/aplicarPlantilla', { token: tA, body: { idSucursal: matriz.idSucursal, idEmpleados: [E1], aPartirDe: hoy } });
        m.revisar('aplicar la plantilla a E1', r.status_code === 0 && r.data.aplicados === 1, r.message);
        h = await horario(E1);
        const h2 = await horario(E2);
        d = await dia(E1, lunes);
        m.revisar('→ E1 queda con la plantilla y sus días regenerados', h.bIgualPlantilla && d.entrada === '08:00:00' && Number(d.horas) === 8,
            JSON.stringify(d));
        m.revisar('→ E2 (no escogido) conserva su horario', h2.dias[0].entrada === '10:00' && !h2.bIgualPlantilla);
        r = await llamar('POST', '/horarios/aplicarPlantilla', { token: tA, body: { idSucursal: matriz.idSucursal, idEmpleados: [E4], aPartirDe: hoy } });
        m.revisar('aplicar a un empleado de otra sucursal principal → se rechaza', r.status_code === 1 && /sucursal principal/.test(r.message), r.message);

        // ── Días a mano y regeneración ──
        const M = siguiente(mas(7), 1);
        r = await setDia(tA, { idEmpleado: E1, fecha: M, estado: 'LABORABLE', entrada: '10:00', salida: '15:00', motivo: 'Cita médica' });
        m.revisar('cambiar un día a mano', r.status_code === 0 && r.data.dia.bManual && r.data.dia.horas === 5, r.message);
        r = await setDia(tA, { idEmpleado: E1, fecha: fechas.sumarDias(M, 1), estado: 'DESCANSO' });
        m.revisar('día a mano sin motivo → se rechaza', r.status_code === 1 && /motivo/.test(r.message), r.message);
        const antesP = await dia(E1, mas(1));
        const P = mas(3);
        r = await llamar('POST', '/horarios/setHorarioEmpleado', { token: tA, body: { idEmpleado: E1, dias: V3, aPartirDe: P } });
        m.revisar('cambiar el horario a partir de una fecha', r.status_code === 0 && r.data.aPartirDe === P, r.message);
        m.revisar('→ reporta los días a mano que conservó', r.data?.conservados?.length === 1 && r.data.conservados[0].fecha === M
            && /conservaron 1/.test(r.message), JSON.stringify(r.data?.conservados));
        const despuesP = await dia(E1, mas(1));
        m.revisar('→ no toca los días anteriores a la fecha', JSON.stringify(antesP) === JSON.stringify(despuesP));
        d = await dia(E1, siguiente(P, 2));
        m.revisar('→ regenera desde la fecha', d.entrada === '07:00:00' && !d.bManual, JSON.stringify(d));
        d = await dia(E1, M);
        m.revisar('→ el día a mano se conserva', d.entrada === '10:00:00' && d.bManual === 1 && d.motivo === 'Cita médica', JSON.stringify(d));
        r = await llamar('POST', '/horarios/regresarDia', { token: tA, body: { idEmpleado: E1, fecha: M } });
        m.revisar('regresar un día sin motivo → se rechaza', r.status_code === 1 && /motivo/.test(r.message), r.message);
        r = await llamar('POST', '/horarios/regresarDia', { token: tA, body: { idEmpleado: E1, fecha: M, motivo: 'Se canceló la cita' } });
        d = await dia(E1, M);
        m.revisar('regresar el día lo deja como el horario', r.status_code === 0 && d.entrada === '07:00:00' && d.bManual === 0 && d.motivo === null,
            JSON.stringify(d));

        // ── Cobertura ──
        const C = siguiente(mas(8), 2);
        r = await llamar('GET', `/horarios/getSalidaPlantilla?idSucursal=${ norte.idSucursal }&fecha=${ C }`, { token: tA });
        m.revisar('"Tomar la salida de la plantilla" regresa la de ese día', r.status_code === 0 && r.data.salida === '16:00', r.message);
        r = await llamar('GET', `/horarios/getSalidaPlantilla?idSucursal=${ norte.idSucursal }&fecha=${ siguiente(C, 7) }`, { token: tA });
        m.revisar('→ el domingo (descanso) no tiene salida', r.status_code === 0 && r.data.salida === null, r.message);
        const cobertura = { idEmpleado: E1, fecha: C, estado: 'LABORABLE', entrada: '07:00', salida: '16:00' };
        r = await setDia(tA, { ...cobertura, cobertura: { idSucursalCobertura: norte.idSucursal, horaCobertura: '17:00' } });
        m.revisar('cobertura con hora fuera del turno → se rechaza', r.status_code === 1 && /dentro del turno/.test(r.message), r.message);
        r = await setDia(tA, { ...cobertura, cobertura: { idSucursalCobertura: matriz.idSucursal, horaCobertura: '12:00' } });
        m.revisar('cobertura en la misma sucursal del día → se rechaza', r.status_code === 1 && /otra/.test(r.message), r.message);
        r = await setDia(tA, { ...cobertura, cobertura: { idSucursalCobertura: norte.idSucursal, horaCobertura: '12:00' } });
        d = r.data?.dia;
        m.revisar('marcar una cobertura', r.status_code === 0 && d.idSucursalCobertura === norte.idSucursal && d.horaCobertura === '12:00', r.message);
        m.revisar('→ la sucursal del día no cambia', d?.idSucursal === matriz.idSucursal, JSON.stringify(d));
        m.revisar('→ guarda las horas nuevas y las de su horario', d?.horas === 9 && d.horasHorario === 8, JSON.stringify(d));
        m.revisar('→ motivo por default "Cubre en Norte"', d?.motivo === 'Cubre en Norte', d?.motivo);
        m.revisar('→ aviso de máximo diario', r.data?.avisos?.[0]?.maximo === 8 && r.data.avisos[0].horas === 9, JSON.stringify(r.data?.avisos));
        r = await llamar('GET', `/horarios/getDiasSucursal?idSucursal=${ norte.idSucursal }&fecha=${ C }`, { token: tA });
        m.revisar('→ aparece en el día de la sucursal que cubre', r.data?.empleados?.some(x => x.idEmpleado === E1 && x.bCubre), r.message);

        // ── Turno nocturno ──
        const N = siguiente(mas(8), 3);
        r = await setDia(tA, { idEmpleado: E3, fecha: N, estado: 'LABORABLE', entrada: '22:00', salida: '06:00', motivo: 'Inventario' });
        d = r.data?.dia;
        m.revisar('turno 22:00–6:00: un solo día, nocturna, 8 h', r.status_code === 0 && d.fecha === N && d.tipoJornada === 'NOCTURNA'
            && d.bCruzaMedianoche && d.horas === 8, JSON.stringify(d));
        m.revisar('→ con aviso de máximo 7 h', r.data?.avisos?.[0]?.maximo === 7, JSON.stringify(r.data?.avisos));
        const siguienteDia = await dia(E3, fechas.sumarDias(N, 1));
        const [{ n: filasN }] = await sql('SELECT COUNT(*) AS n FROM dias_programados WHERE idEmpleado = :e AND fecha = :f', { e: E3, f: N });
        m.revisar('→ el día siguiente sigue con su horario', siguienteDia.entrada === '08:00:00' && !siguienteDia.bManual && Number(filasN) === 1,
            JSON.stringify(siguienteDia));

        // ── Precio a media semana ──
        await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: E1, precioHora: 50, aPartirDe: hoy } });
        r = await llamar('POST', '/empleados/setPrecioEmpleado', { token: tA, body: { idEmpleado: E1, precioHora: 60, aPartirDe: mas(4) } });
        const precios = await sql('SELECT fecha, precioHora FROM dias_programados WHERE idEmpleado = :e ORDER BY fecha', { e: E1 });
        const bien = precios.every(p => Number(p.precioHora) === (p.fecha < mas(4) ? 50 : 60));
        m.revisar('cambio de precio a media semana: cada día con el vigente (manuales incluidos)', r.status_code === 0 && bien
            && Number(precios.find(p => p.fecha === C).precioHora) === 60, JSON.stringify(precios.slice(0, 6)));

        // ── Pasado y semana cerrada ──
        r = await setDia(tE, { idEmpleado: E4, fecha: hoyN, estado: 'DESCANSO', motivo: 'x' });
        m.revisar('el encargado (solo el menú) no cambia días', sinPermiso(r), r.message);
        r = await llamar('POST', '/horarios/revisarHorario', { token: tE, body: { dias: V1 } });
        m.revisar('→ ni revisa horarios (exige poder editarlos)', sinPermiso(r), r.message);
        r = await llamar('GET', `/horarios/getHorarioEmpleado?idEmpleado=${ E4 }`, { token: tE });
        m.revisar('→ pero sí ve el horario de los de su sucursal', r.status_code === 0 && r.data.idEmpleado === E4, r.message);
        r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA, body: { idUsuario: encargado.idUsuario,
            menus: [...new Set([...(directosAntes?.menus || []), 'horarios'])],
            acciones: [...new Set([...(directosAntes?.acciones || []), 'horarios_CambiarDia', 'horarios_Editar'])] } });
        m.revisar('(dar al encargado cambiar días y horario, sin retroactivo)', r.status_code === 0, r.message);
        const ayer = fechas.sumarDias(hoyN, -1);
        r = await setDia(tE, { idEmpleado: E4, fecha: ayer, estado: 'DESCANSO', motivo: 'Prueba' });
        m.revisar('fecha pasada sin horarios_Retroactivo → se rechaza', r.status_code === 1 && r.data?.codigo === 'FECHA_PASADA', r.message);
        r = await llamar('POST', '/horarios/setHorarioEmpleado', { token: tE, body: { idEmpleado: E4, dias: NORTE, aPartirDe: ayer } });
        m.revisar('"a partir de" pasado sin horarios_Retroactivo → se rechaza', r.status_code === 1 && r.data?.codigo === 'FECHA_PASADA', r.message);
        r = await setDia(tE, { idEmpleado: E1, fecha: C, estado: 'DESCANSO', motivo: 'Prueba' });
        m.revisar('el encargado no cambia días de otra sucursal → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await setDia(tE, { idEmpleado: E4, fecha: hoyN, estado: 'DESCANSO', motivo: 'Prueba' });
        m.revisar('→ pero sí uno de hoy de su sucursal', r.status_code === 0, r.message);
        r = await setDia(tC, { idEmpleado: E4, fecha: ayer, estado: 'DESCANSO', motivo: 'Prueba' });
        m.revisar('fecha pasada con horarios_Retroactivo (RH) → pasa', r.status_code === 0 && r.data.dia.fecha === ayer, r.message);
        const cerrada = fechas.sumarDias(hoyN, -21);
        r = await setDia(tC, { idEmpleado: E4, fecha: cerrada, estado: 'DESCANSO', motivo: 'Prueba' });
        m.revisar('semana cerrada sin horarios_SemanaCerrada (RH) → se rechaza', r.status_code === 1 && r.data?.codigo === 'SEMANA_CERRADA', r.message);
        r = await setDia(tA, { idEmpleado: E4, fecha: cerrada, estado: 'DESCANSO', motivo: 'Prueba' });
        m.revisar('semana cerrada con el permiso (Administrador) → pasa', r.status_code === 0, r.message);

        // ── Baja y reingreso ──
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tA, body: { idEmpleado: E2, fechaBaja: hoy, motivoBaja: 'Prueba' } });
        const [{ n: posteriores }] = await sql('SELECT COUNT(*) AS n FROM dias_programados WHERE idEmpleado = :e AND fecha > :h', { e: E2, h: hoy });
        m.revisar('la baja elimina los días posteriores', r.status_code === 0 && Number(posteriores) === 0 && !!(await dia(E2, hoy)), r.message);
        r = await llamar('POST', '/empleados/reingresoEmpleado', { token: tA, body: { idEmpleado: E2, fechaIngreso: mas(2) } });
        const [{ n: reingreso }] = await sql('SELECT COUNT(*) AS n FROM dias_programados WHERE idEmpleado = :e AND fecha >= :f', { e: E2, f: mas(2) });
        m.revisar('el reingreso los genera desde la fecha nueva', r.status_code === 0 && !(await dia(E2, mas(1)))
            && Number(reingreso) === semanas * 7 - 1 && (await dia(E2, mas(2))).entrada === '10:00:00', `${ r.message } / ${ reingreso }`);

        // ── Cambio de sucursal ──
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { idEmpleado: E3, idSucursalPrincipal: norte.idSucursal } });
        const [e3] = await sql('SELECT idSucursalPrincipal FROM empleados WHERE idEmpleado = :e', { e: E3 });
        m.revisar('cambiar la sucursal principal pide confirmar el horario', r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_HORARIO'
            && e3.idSucursalPrincipal === matriz.idSucursal, r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA,
            body: { idEmpleado: E3, idSucursalPrincipal: norte.idSucursal, horarioAlCambiarSucursal: 'conservar' } });
        const futuros = await sql('SELECT fecha, idSucursal, bManual FROM dias_programados WHERE idEmpleado = :e AND fecha >= :h', { e: E3, h: hoy });
        h = await horario(E3);
        m.revisar('"conserva su horario": los días futuros no manuales cambian solo de sucursal', r.status_code === 0
            && futuros.every(x => (x.bManual ? x.idSucursal === matriz.idSucursal : x.idSucursal === norte.idSucursal))
            && futuros.some(x => x.bManual) && h.dias[0].entrada === '08:00', r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA,
            body: { idEmpleado: E5, idSucursalPrincipal: matriz.idSucursal, horarioAlCambiarSucursal: 'tomar' } });
        h = await horario(E5);
        m.revisar('"toma el de la nueva": regresa la plantilla para cargarla, sin guardarla', r.status_code === 0
            && r.data.plantillaNueva?.dias?.[0]?.entrada === '08:00' && h.bSinHorario, r.message);
        const diasE1 = JSON.stringify(await sql('SELECT * FROM dias_programados WHERE idEmpleado = :e ORDER BY fecha', { e: E1 }));
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tA, body: { idEmpleado: E1, idSucursalOperativa: norte.idSucursal } });
        m.revisar('cambiar la operativa no pregunta ni toca los días', r.status_code === 0 && !r.data?.codigo
            && diasE1 === JSON.stringify(await sql('SELECT * FROM dias_programados WHERE idEmpleado = :e ORDER BY fecha', { e: E1 })), r.message);

        // ── Red de seguridad ──
        await ejecutar('DELETE FROM dias_programados WHERE idEmpleado = :e AND fecha > :f AND bManual = 0', { e: E1, f: mas(20) });
        const s1 = await asegurarEmpresa(ID.A);
        const [{ n: e1Dias }] = await sql('SELECT COUNT(*) AS n FROM dias_programados WHERE idEmpleado = :e AND fecha >= :h', { e: E1, h: hoy });
        m.revisar('la red de seguridad completa los días que faltan', s1.errores === 0 && s1.creados >= semanas * 7 - 20
            && Number(e1Dias) === semanas * 7 + 1, JSON.stringify(s1));
        const s2 = await asegurarEmpresa(ID.A);
        const [{ n: dobles }] = await sql(`SELECT COUNT(*) AS n FROM (SELECT idEmpleado, fecha FROM dias_programados
            WHERE idEmpresa = :a GROUP BY idEmpleado, fecha HAVING COUNT(*) > 1) x`, { a: ID.A });
        m.revisar('→ correrla dos veces no duplica', s2.creados === 0 && s2.errores === 0 && Number(dobles) === 0, JSON.stringify(s2));

        // ── Por ajustar y revisar ──
        r = await llamar('GET', '/horarios/getHorariosPorAjustar', { token: tA });
        const ajustar = (id) => r.data?.find(x => x.idEmpleado === id);
        m.revisar('horarios por ajustar: los que no tienen horario', ajustar(E5)?.bSinHorario && ajustar(E4)?.diasSinHorario > 0 && !ajustar(E1),
            JSON.stringify(ajustar(E5)));
        r = await llamar('POST', '/horarios/revisarHorario', { token: tC, body: { dias: [{ diaSemana: 1, ...lab('22:00', '06:00') },
            { diaSemana: 2, estado: 'DESCANSO', entrada: '08:00' }] } });
        m.revisar('revisarHorario: calcula sin guardar y lista los errores', r.status_code === 0 && r.data.dias[0].tipoJornada === 'NOCTURNA'
            && r.data.avisos.some(a => a.maximo === 7) && r.data.errores.length === 1 && r.data.dias[1].horas === null, JSON.stringify(r.data?.errores));

        // ── Bitácora ──
        r = await llamar('GET', `/horarios/getBitacoraHorarios?idEmpleado=${ E1 }`, { token: tA });
        const tipos = new Set((r.data || []).map(x => x.tipo));
        m.revisar('bitácora del empleado: horario, aplicar, día, regreso y cobertura',
            ['HORARIO', 'APLICAR', 'DIA', 'DIA_REGRESO', 'COBERTURA'].every(t => tipos.has(t)), [...tipos].join());
        const cob = r.data?.find(x => x.tipo === 'COBERTURA');
        m.revisar('→ con quién, motivo, antes y después legibles', cob?.autor && cob.motivo === 'Cubre en Norte' && cob.fechaDia === C
            && /Norte/.test(cob.despues?.cobertura) && cob.antes?.horario === '07:00–15:00', JSON.stringify(cob));
        r = await llamar('GET', `/horarios/getBitacoraHorarios?idSucursal=${ matriz.idSucursal }&desde=${ hoy }&hasta=${ hoy }`, { token: tA });
        const pl = r.data?.find(x => x.tipo === 'PLANTILLA');
        m.revisar('bitácora de la sucursal: la plantilla con antes y después', pl && pl.despues?.dias?.Lunes && !('semana' in pl.despues),
            JSON.stringify(pl));
        r = await llamar('GET', `/horarios/getBitacoraHorarios?idSucursal=${ matriz.idSucursal }`, { token: tE });
        m.revisar('el encargado no ve la bitácora de otra sucursal → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        const [{ n: bitB }] = await sql('SELECT COUNT(*) AS n FROM bitacora_horarios WHERE idEmpresa = :b AND idBitacora > :t', { b: ID.B, t: tope.bh });
        m.revisar('→ nada en la bitácora de B', Number(bitB) === 0);
    } finally {
        // ── Deja todo como estaba ──
        if (directosAntes) {
            await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
                body: { idUsuario: encargado.idUsuario, menus: directosAntes.menus || [], acciones: directosAntes.acciones || [] } });
        }
        await ejecutar('DELETE FROM bitacora_permisos WHERE idBitacora > :t', { t: tope.bp });
        const nuevos = (await sql("SELECT idEmpleado FROM empleados WHERE numeroEmpleado LIKE 'T6-%'")).map(x => x.idEmpleado);
        if (nuevos.length) {
            const hijas = (await sql(`SELECT DISTINCT TABLE_NAME AS t FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'idEmpleado' AND TABLE_NAME <> 'empleados'`))
                .map(x => x.t).filter(t => TABLAS_EMPRESA.includes(t));
            for (let vuelta = 0; vuelta < 3; vuelta++) {
                for (const t of hijas) await ejecutar(`DELETE FROM ${ t } WHERE idEmpleado IN (:ids)`, { ids: nuevos }).catch(() => {});
            }
            await ejecutar('DELETE FROM empleados WHERE idEmpleado IN (:ids)', { ids: nuevos });
        }
        // Lo que la red de seguridad creó para los empleados de la demo durante la prueba.
        await ejecutar('DELETE FROM dias_programados WHERE idEmpresa = :a AND idDia > :t', { a: ID.A, t: tope.dia });
        await ejecutar('DELETE FROM bitacora_horarios WHERE idBitacora > :t', { t: tope.bh });
        await ejecutar('DELETE FROM bitacora_empleados WHERE idBitacora > :t', { t: tope.be });
        await ejecutar('DELETE FROM sucursales_horario WHERE idEmpresa = :a', { a: ID.A });
        for (const p of plantillasAntes) {
            await ejecutar(`INSERT INTO sucursales_horario (idEmpresa, idSucursal, diaSemana, bDescanso, entrada, salida, comidaMinutos,
                bComidaDentro, idUsuarioCaptura, fechaCaptura) VALUES (:idEmpresa, :idSucursal, :diaSemana, :bDescanso, :entrada, :salida,
                :comidaMinutos, :bComidaDentro, :idUsuarioCaptura, :fechaCaptura)`, p);
        }
        const [{ n: quedan }] = await sql("SELECT COUNT(*) AS n FROM empleados WHERE numeroEmpleado LIKE 'T6-%'");
        m.revisar('limpieza: no quedan empleados de prueba', Number(quedan) === 0);
    }

    await m.terminar('Horarios y días programados');
})().catch(async (e) => {
    console.error('✘', e);
    process.exit(1);
});
