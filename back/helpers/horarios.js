// =============================================================================
// Horario semanal del empleado y plantilla de la sucursal (análisis 006)
// =============================================================================
//   leerHorarioEmpleado(req, id, t)      siempre siete días (los que no existen
//   leerPlantilla(req, idSucursal, t)    salen SIN_HORARIO: "sin definir")
//   guardarHorarioEmpleado(req, id, dias, t)    reemplazan los siete renglones
//   guardarPlantilla(req, idSucursal, dias, t)  (dentro de la transacción t)
//   mismoHorario(a, b)                   ¿dos horarios semanales son iguales?
//   normalizarSemana(entrada)            lo que llega del navegador → { dias, errores }
//   resumen(req, dias)                   horas, tipos, total y avisos de máximos
//   semanaCerrada(req, fecha, idSucursal)
//   revisarFecha(req, fecha, idSucursal) null, o { mensaje, codigo } si falta el permiso
//   textoSemana(dias), textoDia(dia)     legibles, para la bitácora
//
// Un día de la semana: { diaSemana (1 = lunes … 7 = domingo), estado
// ('LABORABLE' | 'DESCANSO' | 'SIN_HORARIO'), entrada, salida ('HH:mm' o
// null), comidaMinutos, bComidaDentro }.
// =============================================================================

const { db, QueryTypes } = require('./db');
const fechas = require('./fechas');
const configuracion = require('./configuracion');
const constantes = require('./constantes');
const jornada = require('./jornada');

const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7];

const sinHorario = (diaSemana) => ({ diaSemana, estado: 'SIN_HORARIO', entrada: null, salida: null, comidaMinutos: 0, bComidaDentro: false });

/** Renglón de la base → día de la semana. */
const deFila = (f) => f.bDescanso
    ? { diaSemana: f.diaSemana, estado: 'DESCANSO', entrada: null, salida: null, comidaMinutos: 0, bComidaDentro: false }
    : { diaSemana: f.diaSemana, estado: 'LABORABLE', entrada: jornada.hora(f.entrada), salida: jornada.hora(f.salida),
        comidaMinutos: Number(f.comidaMinutos) || 0, bComidaDentro: !!f.bComidaDentro };

const siete = (filas) => DIAS_SEMANA.map(d => {
    const f = filas.find(x => Number(x.diaSemana) === d);
    return f ? deFila(f) : sinHorario(d);
});

const COLUMNAS = 'diaSemana, bDescanso, entrada, salida, comidaMinutos, bComidaDentro';

const leerHorarioEmpleado = async (req, idEmpleado, transaction) => siete(await db.empresa(req).query(`
    SELECT ${ COLUMNAS } FROM empleados_horario
     WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`, { replacements: { idEmpleado }, transaction }));

const leerPlantilla = async (req, idSucursal, transaction) => siete(await db.empresa(req).query(`
    SELECT ${ COLUMNAS } FROM sucursales_horario
     WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal`, { replacements: { idSucursal }, transaction }));

/** Los días definidos como replacements de un INSERT. */
const valoresDia = (d) => ({
    diaSemana: d.diaSemana,
    bDescanso: d.estado === 'DESCANSO' ? 1 : 0,
    entrada: d.estado === 'LABORABLE' ? jornada.hora(d.entrada) : null,
    salida: d.estado === 'LABORABLE' ? jornada.hora(d.salida) : null,
    comidaMinutos: d.estado === 'LABORABLE' ? Number(d.comidaMinutos) || 0 : 0,
    bComidaDentro: d.estado === 'LABORABLE' && d.bComidaDentro ? 1 : 0
});

const guardarHorarioEmpleado = async (req, idEmpleado, dias, transaction) => {
    await db.empresa(req).query('DELETE FROM empleados_horario WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado',
        { replacements: { idEmpleado }, type: QueryTypes.DELETE, transaction });
    for (const d of dias.filter(x => x.estado !== 'SIN_HORARIO')) {
        await db.empresa(req).query(`
            INSERT INTO empleados_horario (idEmpresa, idEmpleado, ${ COLUMNAS }, idUsuarioCaptura)
            VALUES (:idEmpresa, :idEmpleado, :diaSemana, :bDescanso, :entrada, :salida, :comidaMinutos, :bComidaDentro, :uid)`,
        { replacements: { idEmpleado, ...valoresDia(d), uid: req.uid ?? null }, type: QueryTypes.INSERT, transaction });
    }
};

const guardarPlantilla = async (req, idSucursal, dias, transaction) => {
    await db.empresa(req).query('DELETE FROM sucursales_horario WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
        { replacements: { idSucursal }, type: QueryTypes.DELETE, transaction });
    for (const d of dias.filter(x => x.estado !== 'SIN_HORARIO')) {
        await db.empresa(req).query(`
            INSERT INTO sucursales_horario (idEmpresa, idSucursal, ${ COLUMNAS }, idUsuarioCaptura)
            VALUES (:idEmpresa, :idSucursal, :diaSemana, :bDescanso, :entrada, :salida, :comidaMinutos, :bComidaDentro, :uid)`,
        { replacements: { idSucursal, ...valoresDia(d), uid: req.uid ?? null }, type: QueryTypes.INSERT, transaction });
    }
};

/** Llave comparable de un día. */
const llaveDia = (d) => {
    const v = valoresDia(d);
    return d.estado === 'SIN_HORARIO' ? 'S' : `${ v.bDescanso }|${ v.entrada }|${ v.salida }|${ v.comidaMinutos }|${ v.bComidaDentro }`;
};

/** ¿Dos horarios semanales (listas de días) son iguales? */
const mismoHorario = (a, b) => DIAS_SEMANA.every(d => {
    const x = (a || []).find(y => Number(y.diaSemana) === d) || sinHorario(d);
    const y = (b || []).find(z => Number(z.diaSemana) === d) || sinHorario(d);
    return llaveDia(x) === llaveDia(y);
});

/** ¿Ningún día definido? */
const vacio = (dias) => dias.every(d => d.estado === 'SIN_HORARIO');

const aBool = (v) => v === true || v === 1 || v === '1' || v === 'true';

/**
 * Lo que llega del navegador → siete días limpios y la lista de errores.
 * Un día que no viene queda SIN_HORARIO.
 */
const normalizarSemana = (entrada) => {
    const errores = [];
    if (!Array.isArray(entrada)) return { dias: DIAS_SEMANA.map(sinHorario), errores: ['Faltan los días del horario'] };
    const vistos = new Set();
    const dias = DIAS_SEMANA.map(sinHorario);
    for (const x of entrada) {
        const d = Number(x?.diaSemana);
        if (!Number.isInteger(d) || d < 1 || d > 7) { errores.push('Cada día lleva su día de la semana (1 = lunes … 7 = domingo)'); continue; }
        if (vistos.has(d)) { errores.push(`${ jornada.nombreDia(d) } viene repetido`); continue; }
        vistos.add(d);
        const dia = {
            diaSemana: d,
            estado: String(x.estado || ''),
            entrada: x.entrada === '' || x.entrada === undefined ? null : x.entrada,
            salida: x.salida === '' || x.salida === undefined ? null : x.salida,
            comidaMinutos: x.comidaMinutos === '' || x.comidaMinutos === null || x.comidaMinutos === undefined ? 0 : Number(x.comidaMinutos),
            bComidaDentro: aBool(x.bComidaDentro)
        };
        const e = jornada.validarDia(dia, jornada.nombreDia(d));
        if (e.length) { errores.push(...e); dia.invalido = true; }
        if (dia.estado === 'LABORABLE' && !dia.invalido) { dia.entrada = jornada.hora(dia.entrada); dia.salida = jornada.hora(dia.salida); }
        dias[d - 1] = dia;
    }
    return { dias, errores };
};

/** Un día con sus horas, tipo de jornada y máximo (los inválidos sin cálculo). */
const conCalculo = (d) => {
    const base = { ...d, nombreDia: jornada.nombreDia(d.diaSemana) };
    delete base.invalido;
    if (d.invalido) return { ...base, horas: null, tipoJornada: null, bCruzaMedianoche: false, maximoDiario: null };
    if (d.estado !== 'LABORABLE') return { ...base, horas: 0, tipoJornada: null, bCruzaMedianoche: false, maximoDiario: null };
    const c = jornada.calcularDia(d);
    return { ...base, horas: c.horas, tipoJornada: c.tipoJornada, bCruzaMedianoche: c.bCruzaMedianoche, maximoDiario: jornada.maximoDiario(c.tipoJornada) };
};

/** { dias (con cálculo), totalHoras, maxSemanal, avisos } con el máximo semanal de la constante. */
const resumen = async (req, dias) => {
    const calculados = dias.map(conCalculo);
    const maxSemanal = await constantes.valor('ley.max_horas_semana', req);
    const totalHoras = Math.round(calculados.reduce((s, d) => s + (d.estado === 'LABORABLE' ? Number(d.horas) || 0 : 0), 0) * 100) / 100;
    return { dias: calculados, totalHoras, maxSemanal, avisos: jornada.avisosSemana(calculados, maxSemanal) };
};

// ── Textos para la bitácora ──────────────────────────────────────────────────

const textoDia = (d) => {
    if (!d || d.estado === 'SIN_HORARIO') return 'Sin horario';
    if (d.estado === 'DESCANSO') return 'Descanso';
    const comida = Number(d.comidaMinutos) > 0
        ? `, comida ${ d.comidaMinutos } min ${ d.bComidaDentro ? '(dentro de la jornada)' : '(se descuenta)' }` : '';
    return `${ jornada.hora(d.entrada) }–${ jornada.hora(d.salida) }${ comida }`;
};

/** { Lunes: '09:00–18:00, comida 60 min (se descuenta)', ..., Domingo: 'Descanso' } */
const textoSemana = (dias) => Object.fromEntries(DIAS_SEMANA.map(n => [jornada.nombreDia(n),
    textoDia((dias || []).find(d => Number(d.diaSemana) === n))]));

// ── Pasado y semana cerrada (LP-3) ───────────────────────────────────────────

const puede = (req, accion) => !!req.permisos?.acciones?.has(accion);

/**
 * La semana de `fecha` en la sucursal: { cerrada, desde, hasta, cierre, hoy }.
 * Se cierra `asistencia.dias_cierre` días después de su último día (con
 * `asistencia.inicio_semana`), contando con "hoy" en la zona de la sucursal.
 */
const semanaCerrada = async (req, fecha, idSucursal) => {
    const zona = await fechas.zonaDeSucursal(req, idSucursal);
    const inicio = Number(await configuracion.valor(req, 'asistencia.inicio_semana', idSucursal)) || 1;
    const diasCierre = Number(await configuracion.valor(req, 'asistencia.dias_cierre', idSucursal)) || 0;
    const { desde, hasta } = fechas.limitesSemana(fecha, zona, inicio);
    const cierre = fechas.sumarDias(hasta, diasCierre);
    const hoy = fechas.hoy(zona);
    return { cerrada: hoy > cierre, desde, hasta, cierre, hoy };
};

/**
 * Una fecha pasada exige horarios_Retroactivo; una semana cerrada,
 * horarios_SemanaCerrada (req.permisos lo deja validarAccion).
 * Regresa null si se puede, o { mensaje, codigo: 'FECHA_PASADA' | 'SEMANA_CERRADA' }.
 */
const revisarFecha = async (req, fecha, idSucursal) => {
    const zona = await fechas.zonaDeSucursal(req, idSucursal);
    const hoy = fechas.hoy(zona);
    if (fecha >= hoy) return null;
    if (!puede(req, 'horarios_Retroactivo')) {
        return { codigo: 'FECHA_PASADA',
            mensaje: `El ${ fecha } ya pasó (hoy es ${ hoy }). Cambiar fechas pasadas exige el permiso "Cambiar horarios y días de fechas pasadas".` };
    }
    const s = await semanaCerrada(req, fecha, idSucursal);
    if (s.cerrada && !puede(req, 'horarios_SemanaCerrada')) {
        return { codigo: 'SEMANA_CERRADA',
            mensaje: `La semana del ${ s.desde } al ${ s.hasta } ya está cerrada (se cerró el ${ s.cierre }). Cambiarla exige el permiso "Cambiar horarios y días de una semana ya cerrada".` };
    }
    return null;
};

module.exports = {
    DIAS_SEMANA, sinHorario, leerHorarioEmpleado, leerPlantilla, guardarHorarioEmpleado, guardarPlantilla,
    mismoHorario, vacio, normalizarSemana, conCalculo, resumen, textoDia, textoSemana, semanaCerrada, revisarFecha
};
