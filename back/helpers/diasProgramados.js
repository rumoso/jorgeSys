// =============================================================================
// Días programados (análisis 006 §3)
// =============================================================================
// Cada día de un empleado guarda su "encabezado": horario, comida, horas,
// tipo de jornada, sucursal del día y precio por hora vigente ese día. Se
// generan por adelantado hasta el HORIZONTE: `horarios.semanas_adelante`
// semanas desde hoy, en la zona de la sucursal principal.
//
//   generar(req, id, desde, hasta, t, opciones)  crea o actualiza el rango
//   regenerarDesde(req, id, aPartirDe, t)        de esa fecha al horizonte
//   asegurar(req, id, t)                         solo los que faltan
//   eliminarPosteriores(req, id, fecha, t)       baja
//   actualizarPrecio(req, id, desde, t)          cambio de precio
//   cambiarSucursal(req, id, idSucursal, desde, t)  cambio de principal (conservar)
//
// Reglas:
// - un día con bManual = 1 NUNCA se toca al generar (se reporta en `conservados`);
// - no se genera fuera de los periodos laborales (antes del ingreso ni
//   después de la baja);
// - a lo más un día por empleado y fecha (UNIQUE + ON DUPLICATE KEY UPDATE).
// Todo dentro de la transacción `t` de quien llama.
// =============================================================================

const { DateTime } = require('luxon');
const { db, QueryTypes } = require('./db');
const fechas = require('./fechas');
const constantes = require('./constantes');
const jornada = require('./jornada');
const { leerHorarioEmpleado } = require('./horarios');

/** 1 = lunes … 7 = domingo de una fecha de negocio (sin pasar por instantes). */
const diaSemanaDe = (fecha) => DateTime.fromFormat(String(fecha), 'yyyy-MM-dd', { zone: 'utc' }).weekday;

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** Renglón de la base → lo que viaja al navegador. */
const publico = (f, { conPrecio = true } = {}) => {
    const out = {
        idDia: f.idDia, idEmpleado: f.idEmpleado, fecha: f.fecha, diaSemana: diaSemanaDe(f.fecha),
        nombreDia: jornada.nombreDia(diaSemanaDe(f.fecha)),
        estado: f.estado, entrada: jornada.hora(f.entrada), salida: jornada.hora(f.salida),
        bCruzaMedianoche: !!f.bCruzaMedianoche, comidaMinutos: Number(f.comidaMinutos) || 0, bComidaDentro: !!f.bComidaDentro,
        horas: num(f.horas), tipoJornada: f.tipoJornada || null,
        maximoDiario: f.estado === 'LABORABLE' && f.tipoJornada ? jornada.maximoDiario(f.tipoJornada) : null,
        idSucursal: f.idSucursal, sucursal: f.sucursal ?? null,
        bManual: !!f.bManual, motivo: f.motivo ?? null,
        idSucursalCobertura: f.idSucursalCobertura ?? null, sucursalCobertura: f.sucursalCobertura ?? null,
        horaCobertura: jornada.hora(f.horaCobertura), horasHorario: num(f.horasHorario)
    };
    out.bExcede = out.maximoDiario !== null && out.horas > out.maximoDiario;
    if (conPrecio) out.precioHora = num(f.precioHora);
    return out;
};

/** Lo que el horario semanal marca para un día: { estado, entrada, …, horas, tipoJornada }. */
const deHorario = (diaH) => {
    if (!diaH || diaH.estado !== 'LABORABLE') {
        return { estado: diaH?.estado === 'DESCANSO' ? 'DESCANSO' : 'SIN_HORARIO', entrada: null, salida: null,
            bCruzaMedianoche: 0, comidaMinutos: 0, bComidaDentro: 0, horas: 0, tipoJornada: null };
    }
    const c = jornada.calcularDia(diaH);
    return { estado: 'LABORABLE', entrada: diaH.entrada, salida: diaH.salida, bCruzaMedianoche: c.bCruzaMedianoche ? 1 : 0,
        comidaMinutos: Number(diaH.comidaMinutos) || 0, bComidaDentro: diaH.bComidaDentro ? 1 : 0,
        horas: c.horas, tipoJornada: c.tipoJornada };
};

/** El precio con el mayor aPartirDe que no pase de `fecha` (misma regla que precioVigente del 004). */
const precioEn = (precios, fecha) => {
    let p = null;
    for (const x of precios) if (x.aPartirDe <= fecha) p = x;
    return p ? Number(p.precioHora) : null;
};

const enPeriodo = (periodos, fecha) => periodos.some(p => p.fechaIngreso <= fecha && (!p.fechaBaja || p.fechaBaja >= fecha));

/** El horizonte del empleado: { hoy, hasta, zona } con "hoy" en la zona de su sucursal principal. */
const horizonte = async (req, idEmpleado, transaction) => {
    const [e] = await db.empresa(req).query(`
        SELECT s.zonaHoraria FROM empleados e
          JOIN sucursales s ON s.idEmpresa = e.idEmpresa AND s.idSucursal = e.idSucursalPrincipal
         WHERE e.idEmpresa = :idEmpresa AND e.idEmpleado = :idEmpleado`, { replacements: { idEmpleado }, transaction });
    if (!e) throw new Error(`[diasProgramados] El empleado ${ idEmpleado } no es de la empresa ${ req.idEmpresa }`);
    const semanas = await constantes.valor('horarios.semanas_adelante', req);
    const hoy = fechas.hoy(e.zonaHoraria);
    return { hoy, hasta: fechas.sumarDias(hoy, semanas * 7), zona: e.zonaHoraria };
};

/** Un día generado (no manual): si ya existía, lo deja como marca el horario. */
const insertar = async (req, idEmpleado, filas, transaction) => {
    for (const f of filas) {
        await db.empresa(req).query(`
            INSERT INTO dias_programados (idEmpresa, idEmpleado, fecha, estado, entrada, salida, bCruzaMedianoche, comidaMinutos,
                                          bComidaDentro, horas, tipoJornada, idSucursal, precioHora, bManual)
            VALUES (:idEmpresa, :idEmpleado, :fecha, :estado, :entrada, :salida, :bCruzaMedianoche, :comidaMinutos,
                    :bComidaDentro, :horas, :tipoJornada, :idSucursal, :precioHora, 0)
            ON DUPLICATE KEY UPDATE estado = VALUES(estado), entrada = VALUES(entrada), salida = VALUES(salida),
                bCruzaMedianoche = VALUES(bCruzaMedianoche), comidaMinutos = VALUES(comidaMinutos),
                bComidaDentro = VALUES(bComidaDentro), horas = VALUES(horas), tipoJornada = VALUES(tipoJornada),
                idSucursal = VALUES(idSucursal), precioHora = VALUES(precioHora), bManual = 0, motivo = NULL,
                idSucursalCobertura = NULL, horaCobertura = NULL, horasHorario = NULL, idUsuarioCambio = NULL`,
        { replacements: { idEmpleado, ...f }, type: QueryTypes.INSERT, transaction });
    }
};

/**
 * Crea o actualiza los días de [desde, hasta] a partir del horario semanal.
 * opciones:
 *   soloFaltantes   no toca los días que ya existen (asegurar)
 *   incluirManuales también regenera los días a mano (regresar un día)
 * Regresa { generados, conservados: [{ fecha, estado, entrada, salida, motivo }] }.
 */
const generar = async (req, idEmpleado, desde, hasta, transaction, { soloFaltantes = false, incluirManuales = false } = {}) => {
    const salida = { generados: 0, conservados: [] };
    if (!desde || !hasta || desde > hasta) return salida;
    const [emp] = await db.empresa(req).query(`
        SELECT idSucursalPrincipal FROM empleados WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`,
    { replacements: { idEmpleado }, transaction });
    if (!emp) throw new Error(`[diasProgramados] El empleado ${ idEmpleado } no es de la empresa ${ req.idEmpresa }`);
    const periodos = await db.empresa(req).query(`
        SELECT fechaIngreso, fechaBaja FROM empleados_periodos
         WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`, { replacements: { idEmpleado }, transaction });
    const precios = await db.empresa(req).query(`
        SELECT precioHora, aPartirDe FROM empleados_precios
         WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND aPartirDe <= :hasta
         ORDER BY aPartirDe`, { replacements: { idEmpleado, hasta }, transaction });
    const existentes = new Map((await db.empresa(req).query(`
        SELECT fecha, bManual, estado, entrada, salida, motivo FROM dias_programados
         WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND fecha BETWEEN :desde AND :hasta
         FOR UPDATE`, { replacements: { idEmpleado, desde, hasta }, transaction })).map(d => [d.fecha, d]));
    const horario = await leerHorarioEmpleado(req, idEmpleado, transaction);

    const filas = [];
    for (let fecha = desde; fecha <= hasta; fecha = fechas.sumarDias(fecha, 1)) {
        if (!enPeriodo(periodos, fecha)) continue;
        const ya = existentes.get(fecha);
        if (ya && soloFaltantes) continue;
        if (ya?.bManual && !incluirManuales) {
            salida.conservados.push({ fecha, estado: ya.estado, entrada: jornada.hora(ya.entrada), salida: jornada.hora(ya.salida), motivo: ya.motivo });
            continue;
        }
        filas.push({ fecha, ...deHorario(horario[diaSemanaDe(fecha) - 1]), idSucursal: emp.idSucursalPrincipal, precioHora: precioEn(precios, fecha) });
    }
    await insertar(req, idEmpleado, filas, transaction);
    salida.generados = filas.length;
    return salida;
};

/**
 * De `aPartirDe` al horizonte (o al último día ya generado, si va más
 * lejos), respetando los días a mano.
 */
const regenerarDesde = async (req, idEmpleado, aPartirDe, transaction) => {
    const { hasta } = await horizonte(req, idEmpleado, transaction);
    const [ultimo] = await db.empresa(req).query(`
        SELECT MAX(fecha) AS fecha FROM dias_programados WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`,
    { replacements: { idEmpleado }, transaction });
    const fin = ultimo?.fecha && ultimo.fecha > hasta ? ultimo.fecha : hasta;
    return generar(req, idEmpleado, aPartirDe, fin, transaction);
};

/** Solo crea los días que faltan, de hoy al horizonte. Regresa cuántos creó. */
const asegurar = async (req, idEmpleado, transaction) => {
    const { hoy, hasta } = await horizonte(req, idEmpleado, transaction);
    return (await generar(req, idEmpleado, hoy, hasta, transaction, { soloFaltantes: true })).generados;
};

/** Regenera un día desde el horario semanal aunque esté cambiado a mano. */
const regenerarDia = (req, idEmpleado, fecha, transaction) =>
    generar(req, idEmpleado, fecha, fecha, transaction, { incluirManuales: true });

/** Baja: borra los días posteriores a `fecha` (también los manuales). */
const eliminarPosteriores = (req, idEmpleado, fecha, transaction) => db.empresa(req).query(`
    DELETE FROM dias_programados WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND fecha > :fecha`,
{ replacements: { idEmpleado, fecha }, type: QueryTypes.DELETE, transaction });

/** Pone el precio vigente en los días de `desde` en adelante, manuales incluidos (el precio no es un cambio a mano). */
const actualizarPrecio = (req, idEmpleado, desde, transaction) => db.empresa(req).query(`
    UPDATE dias_programados d
       SET d.precioHora = (SELECT p.precioHora FROM empleados_precios p
                            WHERE p.idEmpresa = d.idEmpresa AND p.idEmpleado = d.idEmpleado AND p.aPartirDe <= d.fecha
                            ORDER BY p.aPartirDe DESC LIMIT 1)
     WHERE d.idEmpresa = :idEmpresa AND d.idEmpleado = :idEmpleado AND d.fecha >= :desde`,
{ replacements: { idEmpleado, desde }, type: QueryTypes.UPDATE, transaction });

/** Cambio de sucursal principal conservando el horario: los días no manuales desde `desde` cambian solo de sucursal. */
const cambiarSucursal = (req, idEmpleado, idSucursal, desde, transaction) => db.empresa(req).query(`
    UPDATE dias_programados SET idSucursal = :idSucursal
     WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND fecha >= :desde AND bManual = 0`,
{ replacements: { idEmpleado, idSucursal, desde }, type: QueryTypes.UPDATE, transaction });

/**
 * Alta o reingreso: genera los días desde `fecha` (o desde hoy, si ya pasó:
 * los días pasados no se generan solos, LP-3). En el alta (`copiarPlantilla`)
 * antes copia la plantilla de su sucursal principal a su horario.
 */
const prepararIngreso = async (req, idEmpleado, fecha, transaction, { copiarPlantilla = false } = {}) => {
    if (copiarPlantilla) {
        const horarios = require('./horarios');
        const { registrar } = require('./bitacoraHorarios');
        const [e] = await db.empresa(req).query(`
            SELECT e.idSucursalPrincipal, s.nombre AS sucursal FROM empleados e
              JOIN sucursales s ON s.idEmpresa = e.idEmpresa AND s.idSucursal = e.idSucursalPrincipal
             WHERE e.idEmpresa = :idEmpresa AND e.idEmpleado = :idEmpleado`, { replacements: { idEmpleado }, transaction });
        const plantilla = await horarios.leerPlantilla(req, e.idSucursalPrincipal, transaction);
        await horarios.guardarHorarioEmpleado(req, idEmpleado, plantilla, transaction);
        await registrar(req, { tipo: 'HORARIO', idEmpleado, idSucursal: e.idSucursalPrincipal,
            motivo: horarios.vacio(plantilla) ? `Alta: la sucursal ${ e.sucursal } no tiene plantilla; queda sin horario`
                : `Alta: copia la plantilla de ${ e.sucursal }`,
            antes: null, despues: { aPartirDe: fecha, dias: horarios.textoSemana(plantilla) } }, transaction);
    }
    const { hoy } = await horizonte(req, idEmpleado, transaction);
    return regenerarDesde(req, idEmpleado, fecha > hoy ? fecha : hoy, transaction);
};

module.exports = {
    diaSemanaDe, publico, deHorario, horizonte, generar, regenerarDesde, asegurar, regenerarDia,
    eliminarPosteriores, actualizarPrecio, cambiarSucursal, prepararIngreso
};
