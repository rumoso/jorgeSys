// =============================================================================
// Jornada de un día (análisis 006 §5 y §6) — funciones puras, sin base
// =============================================================================
//   calcularDia({ entrada, salida, comidaMinutos, bComidaDentro })
//       → { horas, tipoJornada, bCruzaMedianoche, minutosNocturnos, minutos }
//   maximoDiario(tipoJornada)       8, 7.5 o 7 (LFT art. 61)
//   avisosSemana(dias, maxSemanal)  avisos de máximo diario y semanal
//   avisoDia(dia)                   el aviso de máximo diario de un día (o null)
//   validarDia(dia)                 lista de errores (vacía si está bien)
//
// Horas en 'HH:mm' (se acepta 'HH:mm:ss' como llega de la base). Una salida
// menor o igual a la entrada cruza la medianoche: es UN solo día, el de la
// entrada.
//
// Tipo de jornada (LFT art. 60): diurna entre 6:00 y 20:00; nocturna entre
// 20:00 y 6:00; mixta si tiene de las dos, salvo que la parte nocturna llegue
// a 3.5 h: entonces es nocturna.
// =============================================================================

const ESTADOS = ['LABORABLE', 'DESCANSO', 'SIN_HORARIO'];
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MAXIMOS = { DIURNA: 8, MIXTA: 7.5, NOCTURNA: 7 };
const NOCHE_INICIO = 20 * 60;
const NOCHE_FIN = 6 * 60;
const MIXTA_A_NOCTURNA = 210;           // 3.5 h
const DIA_MIN = 24 * 60;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

/** 'HH:mm' o 'HH:mm:ss' → 'HH:mm' (o null si no es una hora). */
const hora = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const m = RE_HORA.exec(String(v).trim());
    return m ? `${ m[1] }:${ m[2] }` : null;
};

const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

const redondear = (n) => Math.round(n * 100) / 100;

/** Minutos de [ini, fin) que caen en la noche (20:00–6:00). fin ≤ 2 días. */
const nocturnos = (ini, fin) => {
    const noches = [[0, NOCHE_FIN], [NOCHE_INICIO, DIA_MIN + NOCHE_FIN], [DIA_MIN + NOCHE_INICIO, 2 * DIA_MIN]];
    return noches.reduce((s, [a, b]) => s + Math.max(0, Math.min(fin, b) - Math.max(ini, a)), 0);
};

/** Entrada y salida en minutos desde la medianoche del día de la entrada. */
const tramo = (entrada, salida) => {
    const ini = minutos(hora(entrada));
    let fin = minutos(hora(salida));
    const cruza = fin <= ini;
    if (cruza) fin += DIA_MIN;
    return { ini, fin, cruza };
};

/**
 * Horas y tipo de jornada de un turno.
 * La comida se descuenta de las horas solo si NO cuenta dentro de la jornada.
 */
const calcularDia = ({ entrada, salida, comidaMinutos = 0, bComidaDentro = false }) => {
    const { ini, fin, cruza } = tramo(entrada, salida);
    const duracion = fin - ini;
    const noche = nocturnos(ini, fin);
    const diaMin = duracion - noche;
    let tipoJornada;
    if (noche === 0) tipoJornada = 'DIURNA';
    else if (diaMin === 0 || noche >= MIXTA_A_NOCTURNA) tipoJornada = 'NOCTURNA';
    else tipoJornada = 'MIXTA';
    const comida = bComidaDentro ? 0 : Number(comidaMinutos) || 0;
    const trabajados = Math.max(0, duracion - comida);
    return { horas: redondear(trabajados / 60), tipoJornada, bCruzaMedianoche: cruza, minutosNocturnos: noche, minutos: trabajados };
};

const maximoDiario = (tipoJornada) => MAXIMOS[tipoJornada] ?? MAXIMOS.DIURNA;

const nombreDia = (diaSemana) => DIAS[diaSemana] || '';

/** Etiqueta de un día para los avisos: 'Lunes' o 'Lunes 2026-11-16'. */
const etiquetaDia = (d) => [d.diaSemana ? nombreDia(d.diaSemana) : null, d.fecha || null].filter(Boolean).join(' ');

/** Aviso de máximo diario de un día ya calculado ({ estado, horas, tipoJornada, diaSemana?, fecha? }) o null. */
const avisoDia = (d) => {
    if (d.estado !== 'LABORABLE' || d.horas === null || d.horas === undefined) return null;
    const maximo = maximoDiario(d.tipoJornada);
    if (Number(d.horas) <= maximo) return null;
    return {
        tipo: 'DIARIO', diaSemana: d.diaSemana ?? null, fecha: d.fecha ?? null, tipoJornada: d.tipoJornada,
        horas: Number(d.horas), maximo,
        mensaje: `${ etiquetaDia(d) }: ${ Number(d.horas) } h pasan del máximo de ${ maximo } h de la jornada ${ d.tipoJornada.toLowerCase() }`
    };
};

/**
 * Avisos de una semana: uno por cada día que pasa de su máximo diario y uno
 * si la suma pasa de `maxSemanal`. No impiden guardar.
 *   dias: [{ estado, horas, tipoJornada, diaSemana?, fecha? }]
 */
const avisosSemana = (dias, maxSemanal) => {
    const avisos = dias.map(avisoDia).filter(Boolean);
    const total = redondear(dias.filter(d => d.estado === 'LABORABLE').reduce((s, d) => s + (Number(d.horas) || 0), 0));
    if (maxSemanal && total > Number(maxSemanal)) {
        avisos.push({
            tipo: 'SEMANAL', diaSemana: null, fecha: null, tipoJornada: null, horas: total, maximo: Number(maxSemanal),
            mensaje: `La semana suma ${ total } h y pasa del máximo de ${ Number(maxSemanal) } h por semana`
        });
    }
    return avisos;
};

/**
 * Errores de un día (vacío si está bien):
 *   { estado: LABORABLE | DESCANSO | SIN_HORARIO, entrada, salida, comidaMinutos, bComidaDentro }
 * - laborable: entrada y salida 'HH:mm', distintas; comida entera, de 0 a
 *   menos que la duración del turno;
 * - descanso y sin horario: sin entrada, salida ni comida.
 */
const validarDia = (d, etiqueta = null) => {
    const errores = [];
    const quien = etiqueta || etiquetaDia(d) || 'El día';
    if (!d || !ESTADOS.includes(d.estado)) return [`${ quien }: escoge si es laborable o descanso`];
    if (d.estado !== 'LABORABLE') {
        const tiene = (v) => v !== null && v !== undefined && v !== '';
        if (tiene(d.entrada) || tiene(d.salida)) errores.push(`${ quien }: un ${ d.estado === 'DESCANSO' ? 'descanso' : 'día sin horario' } no lleva entrada ni salida`);
        if (Number(d.comidaMinutos) > 0) errores.push(`${ quien }: un ${ d.estado === 'DESCANSO' ? 'descanso' : 'día sin horario' } no lleva comida`);
        return errores;
    }
    const entrada = hora(d.entrada);
    const salida = hora(d.salida);
    if (!entrada) errores.push(`${ quien }: la entrada no es una hora válida (HH:mm)`);
    if (!salida) errores.push(`${ quien }: la salida no es una hora válida (HH:mm)`);
    if (entrada && salida && entrada === salida) errores.push(`${ quien }: la entrada y la salida no pueden ser iguales`);
    const comida = d.comidaMinutos === null || d.comidaMinutos === undefined || d.comidaMinutos === '' ? 0 : Number(d.comidaMinutos);
    if (!Number.isInteger(comida) || comida < 0) errores.push(`${ quien }: los minutos de comida deben ser un número entero de 0 en adelante`);
    else if (entrada && salida && entrada !== salida) {
        const { ini, fin } = tramo(entrada, salida);
        if (comida >= fin - ini) errores.push(`${ quien }: la comida (${ comida } min) debe ser menor que el turno (${ fin - ini } min)`);
    }
    if (d.bComidaDentro !== undefined && d.bComidaDentro !== null && typeof d.bComidaDentro !== 'boolean'
        && ![0, 1, '0', '1'].includes(d.bComidaDentro)) errores.push(`${ quien }: "cuenta dentro de la jornada" debe ser sí o no`);
    return errores;
};

/** ¿`h` ('HH:mm') cae dentro del turno (estrictamente entre la entrada y la salida)? */
const dentroDelTurno = (entrada, salida, h) => {
    const { ini, fin } = tramo(entrada, salida);
    let m = minutos(hora(h));
    if (m <= ini) m += DIA_MIN;
    return m > ini && m < fin;
};

module.exports = {
    ESTADOS, DIAS, MAXIMOS,
    hora, calcularDia, maximoDiario, avisoDia, avisosSemana, validarDia, dentroDelTurno, nombreDia
};
