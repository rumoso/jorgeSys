// =============================================================================
// Fechas de negocio por sucursal (análisis 003 §5)
// =============================================================================
// La regla: un INSTANTE se guarda en UTC; la FECHA DE NEGOCIO (el día al que
// pertenece un marcaje, una ausencia, un día programado) se calcula con la
// zona de SU sucursal. Nunca con el reloj del servidor ni con el navegador.
//
// Este es el ÚNICO lugar que hace esa cuenta (lo vigila
// scripts/auditar-fechas.js). Las zonas van siempre con nombre
// ('America/Tijuana'), nunca como desfase fijo: Tijuana, Ciudad Juárez y
// Matamoros tienen horario de verano, y ese día dura 23 o 25 horas.
//
// Formatos: fecha 'YYYY-MM-DD', hora 'HH:mm', instante = Date (UTC).
// =============================================================================

const { DateTime } = require('luxon');
// `db` se carga al usarse: las funciones puras se prueban sin base de datos.

const FECHA = 'yyyy-MM-dd';
const HORA = 'HH:mm';

const zonaValida = (zona) => {
    if (!zona || !DateTime.now().setZone(zona).isValid) throw new Error(`[fechas] Zona horaria inválida: "${ zona }"`);
    return zona;
};

const aDateTime = (instante) => {
    if (instante instanceof Date) return DateTime.fromJSDate(instante, { zone: 'utc' });
    if (typeof instante === 'number') return DateTime.fromMillis(instante, { zone: 'utc' });
    // Texto de la base (dateStrings, en UTC) o ISO.
    const s = String(instante);
    const dt = /T|Z|[+-]\d{2}:\d{2}$/.test(s) ? DateTime.fromISO(s, { zone: 'utc' }) : DateTime.fromSQL(s, { zone: 'utc' });
    if (!dt.isValid) throw new Error(`[fechas] Instante inválido: "${ s }"`);
    return dt;
};

const fechaDT = (fecha, zona) => {
    const dt = DateTime.fromFormat(String(fecha), FECHA, { zone: zonaValida(zona) });
    if (!dt.isValid) throw new Error(`[fechas] Fecha inválida: "${ fecha }" (AAAA-MM-DD)`);
    return dt;
};

/** El instante actual (Date, UTC). Para sellos; la fecha de negocio sale de `hoy(zona)`. */
const ahora = () => new Date();

/** Fecha y hora actuales en la zona: { fecha, hora, instante }. */
const ahoraEn = (zona) => aLocal(ahora(), zona);

/** 'YYYY-MM-DD' de hoy en la zona. */
const hoy = (zona) => DateTime.now().setZone(zonaValida(zona)).toFormat(FECHA);

/** La fecha de negocio ('YYYY-MM-DD') a la que pertenece un instante en la zona. */
const diaDe = (instante, zona) => aDateTime(instante).setZone(zonaValida(zona)).toFormat(FECHA);

/**
 * Inicio y fin de un día local como instantes UTC: { inicio, fin, horas }.
 * `fin` es el inicio del día siguiente (rango semiabierto [inicio, fin)).
 * `horas` es 23, 24 o 25.
 */
const limitesDia = (fecha, zona) => {
    const inicio = fechaDT(fecha, zona).startOf('day');
    const fin = inicio.plus({ days: 1 }).startOf('day');
    return { inicio: inicio.toUTC().toJSDate(), fin: fin.toUTC().toJSDate(), horas: fin.diff(inicio, 'hours').hours };
};

/**
 * La semana que contiene `fecha`, empezando en `inicioSemana` (1 = lunes …
 * 7 = domingo, el ajuste `asistencia.inicio_semana`).
 * { desde, hasta (fechas, inclusive), inicio, fin (instantes UTC, [inicio, fin)) }.
 */
const limitesSemana = (fecha, zona, inicioSemana = 1) => {
    const inicioDia = Number(inicioSemana);
    if (!Number.isInteger(inicioDia) || inicioDia < 1 || inicioDia > 7) throw new Error(`[fechas] inicioSemana inválido: ${ inicioSemana }`);
    const d = fechaDT(fecha, zona).startOf('day');
    const atras = (d.weekday - inicioDia + 7) % 7;
    const desde = d.minus({ days: atras }).startOf('day');
    const siguiente = desde.plus({ days: 7 }).startOf('day');
    return {
        desde: desde.toFormat(FECHA),
        hasta: siguiente.minus({ days: 1 }).toFormat(FECHA),
        inicio: desde.toUTC().toJSDate(),
        fin: siguiente.toUTC().toJSDate()
    };
};

/**
 * Fecha y hora locales → instante UTC: { instante, ajuste }.
 * En el cambio de horario:
 *  - hora que NO existe (se adelanta el reloj): se toma la primera hora
 *    válida después del salto; `ajuste = 'NO_EXISTE'`;
 *  - hora que se REPITE (se atrasa el reloj): se toma la primera vez;
 *    `ajuste = 'REPETIDA'`.
 * Sin ajuste: `ajuste = null`.
 */
const aInstante = (fecha, hora, zona) => {
    zonaValida(zona);
    const [h, m] = String(hora).split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        throw new Error(`[fechas] Hora inválida: "${ hora }" (HH:mm)`);
    }
    const base = fechaDT(fecha, zona);
    const pedido = { year: base.year, month: base.month, day: base.day, hour: h, minute: m };

    // Luxon resuelve la hora inexistente corriéndola hacia adelante, y la
    // repetida con el desfase vigente ANTES del cambio (la primera vez).
    const dt = DateTime.fromObject(pedido, { zone: zona });
    let ajuste = null;
    if (dt.hour !== h || dt.minute !== m || dt.day !== base.day) {
        ajuste = 'NO_EXISTE';
    } else {
        const otra = dt.plus({ hours: 1 });
        const otraAntes = dt.minus({ hours: 1 });
        if ((otra.hour === h && otra.minute === m && otra.day === base.day) ||
            (otraAntes.hour === h && otraAntes.minute === m && otraAntes.day === base.day)) ajuste = 'REPETIDA';
    }
    // La "primera vez" de una hora repetida es la del desfase mayor (antes de atrasar).
    let elegido = dt;
    if (ajuste === 'REPETIDA') {
        const antes = dt.minus({ hours: 1 });
        if (antes.hour === h && antes.minute === m) elegido = antes;
    }
    return { instante: elegido.toUTC().toJSDate(), ajuste };
};

/** Instante → { fecha, hora, instante (ISO UTC), zona } en la zona. */
const aLocal = (instante, zona) => {
    const dt = aDateTime(instante).setZone(zonaValida(zona));
    return { fecha: dt.toFormat(FECHA), hora: dt.toFormat(HORA), instante: dt.toUTC().toISO(), zona };
};

/** Suma días a una fecha de negocio (sin pasar por instantes). */
const sumarDias = (fecha, dias) => DateTime.fromFormat(String(fecha), FECHA, { zone: 'utc' }).plus({ days: dias }).toFormat(FECHA);

// ── Zona de una sucursal ─────────────────────────────────────────────────────

const TTL_MS = 5 * 60 * 1000;
const zonas = new Map();

/** Zona de una sucursal de la empresa de la sesión. Lanza si no es de la empresa. */
const zonaDeSucursal = async (req, idSucursal) => {
    const k = `${ req.idEmpresa }:${ idSucursal }`;
    const guardado = zonas.get(k);
    if (guardado && guardado.vence > Date.now()) return guardado.zona;
    const { db } = require('./db');
    const [s] = await db.empresa(req).query(
        'SELECT zonaHoraria FROM sucursales WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
        { replacements: { idSucursal: Number(idSucursal) } });
    if (!s) throw new Error(`[fechas] La sucursal ${ idSucursal } no es de la empresa ${ req.idEmpresa }`);
    zonas.set(k, { zona: s.zonaHoraria, vence: Date.now() + TTL_MS });
    return s.zonaHoraria;
};

/** Al cambiar la zona de una sucursal. */
const invalidarZona = (idEmpresa, idSucursal) => zonas.delete(`${ idEmpresa }:${ idSucursal }`);

module.exports = {
    ahora, ahoraEn, hoy, diaDe, limitesDia, limitesSemana, aInstante, aLocal, sumarDias,
    zonaDeSucursal, invalidarZona, zonaValida
};
