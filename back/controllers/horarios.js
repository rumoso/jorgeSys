// =============================================================================
// Checador → Horarios (análisis 006)
// =============================================================================
// Horario semanal del empleado, plantilla de la sucursal, días programados,
// cambios de un día a mano (con cobertura en otra sucursal), horarios por
// ajustar y bitácora.
//
// Reglas que aplican a TODO lo de aquí:
// - la empresa sale de la sesión; un empleado o una sucursal de otra empresa,
//   o fuera de las sucursales del usuario, "no existe" (la sucursal que
//   CUBRE solo tiene que ser de la empresa y estar activa);
// - el pasado no se recalcula (LP-3): una fecha pasada exige
//   horarios_Retroactivo y una semana cerrada horarios_SemanaCerrada
//   (data.codigo = 'FECHA_PASADA' | 'SEMANA_CERRADA');
// - un día cambiado a mano nunca lo pisa una regeneración;
// - todo cambio deja bitácora (LP-4).
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const fechas = require('../helpers/fechas');
const jornada = require('../helpers/jornada');
const H = require('../helpers/horarios');
const DP = require('../helpers/diasProgramados');
const { registrar } = require('../helpers/bitacoraHorarios');
const { alcanceSucursales } = require('../helpers/sesion');
const { MSG_NO_EXISTE, Regla, esFecha, texto, filtroAlcance, empleadoVisible } = require('../helpers/empleados');

const MSG_SUC_NO_EXISTE = 'La sucursal no existe';
const MAX_DIAS_CONSULTA = 93;
const MAX_DIAS_ADELANTE = 366;
const MAX_BITACORA = 500;

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(donde, error);
    return res.json({ status_code: 2, message, data: null });
};

const puede = (req, accion) => !!req.permisos?.acciones?.has(accion);
const nombreCompleto = (e) => [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(' ');
const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

/** Motivo limpio (o null); más de 250 caracteres es error. */
const leerMotivo = (v) => {
    const m = texto(v, 250);
    if (m && m.length > 250) throw new Regla('El motivo admite hasta 250 caracteres');
    return m;
};

/** Sucursal de la empresa; con `alcance`, solo si es de las del usuario. Si no, undefined. */
const sucursalDe = async (req, idSucursal, { alcance = true, transaction } = {}) => {
    const id = idValido(idSucursal);
    if (!id) return undefined;
    const [s] = await db.empresa(req).query(`
        SELECT idSucursal, nombre, zonaHoraria, bActivo FROM sucursales
         WHERE idEmpresa = :idEmpresa AND idSucursal = :id`, { replacements: { id }, transaction });
    if (!s) return undefined;
    if (alcance && !(await alcanceSucursales(req, transaction)).incluye(s.idSucursal)) return undefined;
    return { ...s, bActivo: !!s.bActivo };
};

/** Lanza Regla si la fecha exige un permiso que falta. */
const exigirFecha = async (req, fecha, idSucursal) => {
    const f = await H.revisarFecha(req, fecha, idSucursal);
    if (f) throw new Regla(f.mensaje, { codigo: f.codigo });
};

/** Siete días limpios o Regla con la lista de errores. */
const semanaValida = (entrada) => {
    const { dias, errores } = H.normalizarSemana(entrada);
    if (errores.length) throw new Regla(errores[0], { errores });
    return dias;
};

/** El horario sin `invalido` y en forma de guardar (para la bitácora de la plantilla). */
const crudo = (dias) => dias.map(d => ({ diaSemana: d.diaSemana, estado: d.estado, entrada: d.entrada, salida: d.salida,
    comidaMinutos: d.comidaMinutos, bComidaDentro: !!d.bComidaDentro }));

/**
 * Guarda el horario de un empleado y regenera sus días desde `aPartirDe`.
 * Si la fecha va más allá del horizonte, antes completa con el horario
 * anterior los días que faltan hasta la víspera (LP-3: el horario nuevo
 * aplica desde esa fecha, no antes).
 */
const aplicarHorario = async (req, idEmpleado, dias, aPartirDe, t) => {
    const { hoy, hasta } = await DP.horizonte(req, idEmpleado, t);
    if (aPartirDe > hasta) await DP.generar(req, idEmpleado, hoy, fechas.sumarDias(aPartirDe, -1), t, { soloFaltantes: true });
    await H.guardarHorarioEmpleado(req, idEmpleado, dias, t);
    return DP.regenerarDesde(req, idEmpleado, aPartirDe, t);
};

/** "a partir de": AAAA-MM-DD y a lo más un año adelante. Lanza Regla. */
const validarAPartirDe = (aPartirDe, zona) => {
    if (!esFecha(aPartirDe)) throw new Regla('La fecha "a partir de" no es válida (AAAA-MM-DD)');
    const tope = fechas.sumarDias(fechas.hoy(zona), MAX_DIAS_ADELANTE);
    if (aPartirDe > tope) throw new Regla(`La fecha "a partir de" no puede pasar del ${ tope }`);
};

const mensajeConservados = (conservados) => conservados.length
    ? `; se conservaron ${ conservados.length } día(s) cambiado(s) a mano` : '';

// ── Sucursales para la pantalla ──────────────────────────────────────────────

/**
 * GET /api/horarios/getSucursalesHorarios
 * Todas las sucursales de la empresa con `bAlcance` (las del usuario: el
 * selector de la pantalla) y `bActivo` (las que pueden recibir una cobertura).
 */
const getSucursalesHorarios = async (req, res) => {
    try {
        const alcance = await alcanceSucursales(req);
        const filas = await db.empresa(req).query(`
            SELECT idSucursal, nombre, zonaHoraria, bActivo FROM sucursales
             WHERE idEmpresa = :idEmpresa ORDER BY bActivo DESC, nombre`);
        const data = filas.map(s => ({ ...s, bActivo: !!s.bActivo, bAlcance: alcance.incluye(s.idSucursal) }));
        return ok(res, `${ data.length } sucursal(es)`, data);
    } catch (error) {
        return falla(res, 'getSucursalesHorarios', error, 'No fue posible consultar las sucursales');
    }
};

// ── Horario del empleado ─────────────────────────────────────────────────────

/** GET /api/horarios/getHorarioEmpleado?idEmpleado= */
const getHorarioEmpleado = async (req, res) => {
    try {
        const e = await empleadoVisible(req, req.query.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        const [s] = await db.empresa(req).query(
            'SELECT nombre FROM sucursales WHERE idEmpresa = :idEmpresa AND idSucursal = :id', { replacements: { id: e.idSucursalPrincipal } });
        const dias = await H.leerHorarioEmpleado(req, e.idEmpleado);
        const plantilla = await H.leerPlantilla(req, e.idSucursalPrincipal);
        const r = await H.resumen(req, dias);
        return ok(res, 'Horario del empleado', {
            idEmpleado: e.idEmpleado, numeroEmpleado: e.numeroEmpleado, nombreCompleto: nombreCompleto(e), estado: e.estado,
            idSucursalPrincipal: e.idSucursalPrincipal, sucursalPrincipal: s?.nombre ?? null, zonaHoraria: e.zonaHoraria,
            hoy: fechas.hoy(e.zonaHoraria),
            ...r,
            bSinHorario: H.vacio(dias), bPlantillaDefinida: !H.vacio(plantilla), bIgualPlantilla: H.mismoHorario(dias, plantilla)
        });
    } catch (error) {
        return falla(res, 'getHorarioEmpleado', error, 'No fue posible consultar el horario');
    }
};

/**
 * POST /api/horarios/revisarHorario { dias }
 * No guarda nada: horas por día, tipo de jornada, total semanal y avisos de
 * máximos. Los días con error van sin cálculo y sus errores en data.errores.
 */
const revisarHorario = async (req, res) => {
    try {
        const { dias, errores } = H.normalizarSemana(req.body.dias);
        const r = await H.resumen(req, dias);
        return ok(res, errores.length ? `${ errores.length } error(es) en el horario` : 'Horario revisado', { ...r, errores });
    } catch (error) {
        return falla(res, 'revisarHorario', error, 'No fue posible revisar el horario');
    }
};

/**
 * POST /api/horarios/setHorarioEmpleado { idEmpleado, dias, aPartirDe, motivo? }
 * Guarda el horario y regenera los días desde "a partir de", sin tocar los
 * anteriores ni los cambiados a mano (regresa cuáles se conservaron). Los
 * avisos de máximos no impiden guardar.
 */
const setHorarioEmpleado = async (req, res) => {
    const aPartirDe = String(req.body.aPartirDe || '');
    try {
        const dias = semanaValida(req.body.dias);
        const motivo = leerMotivo(req.body.motivo);
        const r = await db.transaccion(async (t) => {
            const e = await empleadoVisible(req, req.body.idEmpleado, { transaction: t, bloquear: true });
            if (!e) throw new Regla(MSG_NO_EXISTE);
            if (e.estado === 'BAJA') throw new Regla(`${ nombreCompleto(e) } está dado de baja: su horario no se cambia`);
            validarAPartirDe(aPartirDe, e.zonaHoraria);
            await exigirFecha(req, aPartirDe, e.idSucursalPrincipal);
            const antes = await H.leerHorarioEmpleado(req, e.idEmpleado, t);
            const g = await aplicarHorario(req, e.idEmpleado, dias, aPartirDe, t);
            await registrar(req, { tipo: 'HORARIO', idEmpleado: e.idEmpleado, idSucursal: e.idSucursalPrincipal,
                motivo: motivo || `A partir del ${ aPartirDe }`,
                antes: { dias: H.textoSemana(antes) },
                despues: { aPartirDe, dias: H.textoSemana(dias), conservados: g.conservados.length } }, t);
            return { e, ...g };
        });
        const resumen = await H.resumen(req, dias);
        return ok(res, `Horario guardado a partir del ${ aPartirDe }${ mensajeConservados(r.conservados) }`, {
            id: r.e.idEmpleado, aPartirDe, generados: r.generados, conservados: r.conservados, ...resumen
        });
    } catch (error) {
        return falla(res, 'setHorarioEmpleado', error, 'No fue posible guardar el horario');
    }
};

// ── Plantilla de la sucursal ─────────────────────────────────────────────────

/** GET /api/horarios/getPlantilla?idSucursal= */
const getPlantilla = async (req, res) => {
    try {
        const s = await sucursalDe(req, req.query.idSucursal);
        if (!s) return no(res, MSG_SUC_NO_EXISTE);
        const dias = await H.leerPlantilla(req, s.idSucursal);
        return ok(res, `Plantilla de ${ s.nombre }`, {
            idSucursal: s.idSucursal, sucursal: s.nombre, zonaHoraria: s.zonaHoraria, bActivo: s.bActivo,
            hoy: fechas.hoy(s.zonaHoraria), bDefinida: !H.vacio(dias), ...(await H.resumen(req, dias))
        });
    } catch (error) {
        return falla(res, 'getPlantilla', error, 'No fue posible consultar la plantilla');
    }
};

/** POST /api/horarios/setPlantilla { idSucursal, dias, motivo? } — no cambia a ningún empleado. */
const setPlantilla = async (req, res) => {
    try {
        const dias = semanaValida(req.body.dias);
        const motivo = leerMotivo(req.body.motivo);
        const s = await db.transaccion(async (t) => {
            const suc = await sucursalDe(req, req.body.idSucursal, { transaction: t });
            if (!suc) throw new Regla(MSG_SUC_NO_EXISTE);
            const antes = await H.leerPlantilla(req, suc.idSucursal, t);
            await H.guardarPlantilla(req, suc.idSucursal, dias, t);
            await registrar(req, { tipo: 'PLANTILLA', idSucursal: suc.idSucursal, motivo,
                antes: { dias: H.textoSemana(antes), semana: crudo(antes) },
                despues: { dias: H.textoSemana(dias), semana: crudo(dias) } }, t);
            return suc;
        });
        return ok(res, `Plantilla de ${ s.nombre } guardada. No cambió el horario de ningún empleado: usa "Aplicar a empleados…".`,
            { id: s.idSucursal, ...(await H.resumen(req, dias)) });
    } catch (error) {
        return falla(res, 'setPlantilla', error, 'No fue posible guardar la plantilla');
    }
};

/** Horarios de varios empleados: Map idEmpleado → siete días. */
const horariosDe = async (req, ids, transaction) => {
    const out = new Map(ids.map(id => [id, []]));
    if (!ids.length) return new Map();
    const filas = await db.empresa(req).query(`
        SELECT idEmpleado, diaSemana, bDescanso, entrada, salida, comidaMinutos, bComidaDentro
          FROM empleados_horario WHERE idEmpresa = :idEmpresa AND idEmpleado IN (:ids)`, { replacements: { ids }, transaction });
    for (const f of filas) out.get(f.idEmpleado).push(f);
    const H7 = new Map();
    for (const [id, fs] of out) {
        H7.set(id, H.DIAS_SEMANA.map(d => {
            const f = fs.find(x => Number(x.diaSemana) === d);
            if (!f) return H.sinHorario(d);
            return f.bDescanso
                ? { diaSemana: d, estado: 'DESCANSO', entrada: null, salida: null, comidaMinutos: 0, bComidaDentro: false }
                : { diaSemana: d, estado: 'LABORABLE', entrada: jornada.hora(f.entrada), salida: jornada.hora(f.salida),
                    comidaMinutos: Number(f.comidaMinutos) || 0, bComidaDentro: !!f.bComidaDentro };
        }));
    }
    return H7;
};

/**
 * Grupo de un empleado frente a la plantilla:
 *   IGUAL      ya tiene ese horario;
 *   CAMBIARIA  no tiene horario, o tiene el de una versión anterior de la plantilla;
 *   PROPIO     tiene un horario propio distinto.
 */
const grupoDe = (horario, plantilla, anteriores) => {
    if (H.mismoHorario(horario, plantilla)) return 'IGUAL';
    if (H.vacio(horario) || anteriores.some(p => H.mismoHorario(horario, p))) return 'CAMBIARIA';
    return 'PROPIO';
};

const versionesAnteriores = async (req, idSucursal, transaction) => (await db.empresa(req).query(`
    SELECT antes FROM bitacora_horarios
     WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal AND tipo = 'PLANTILLA' AND antes IS NOT NULL`,
{ replacements: { idSucursal }, transaction }))
    .map(f => (typeof f.antes === 'string' ? JSON.parse(f.antes) : f.antes)?.semana)
    .filter(h => Array.isArray(h) && !H.vacio(h));

/**
 * GET /api/horarios/previsualizarAplicar?idSucursal=
 * Los empleados activos (del alcance) con esa sucursal principal, cada uno
 * con su grupo: IGUAL, CAMBIARIA o PROPIO.
 */
const previsualizarAplicar = async (req, res) => {
    try {
        const s = await sucursalDe(req, req.query.idSucursal);
        if (!s) return no(res, MSG_SUC_NO_EXISTE);
        const plantilla = await H.leerPlantilla(req, s.idSucursal);
        const anteriores = await versionesAnteriores(req, s.idSucursal);
        const f = await filtroAlcance(req, 'e');
        const empleados = await db.empresa(req).query(`
            SELECT e.idEmpleado, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno
              FROM empleados e
             WHERE e.idEmpresa = :idEmpresa AND e.estado = 'ACTIVO' AND e.idSucursalPrincipal = :idSucursal AND ${ f.sql }
             ORDER BY e.apellidoPaterno, e.apellidoMaterno, e.nombre`, { replacements: { idSucursal: s.idSucursal, ...f.replacements } });
        const horarios = await horariosDe(req, empleados.map(e => e.idEmpleado));
        const lista = empleados.map(e => {
            const h = horarios.get(e.idEmpleado);
            return { idEmpleado: e.idEmpleado, numeroEmpleado: e.numeroEmpleado, nombreCompleto: nombreCompleto(e),
                grupo: grupoDe(h, plantilla, anteriores), bSinHorario: H.vacio(h), horario: H.textoSemana(h) };
        });
        const cuenta = (g) => lista.filter(x => x.grupo === g).length;
        return ok(res, `${ lista.length } empleado(s) con ${ s.nombre } como sucursal principal`, {
            idSucursal: s.idSucursal, sucursal: s.nombre, hoy: fechas.hoy(s.zonaHoraria), bDefinida: !H.vacio(plantilla),
            plantilla: await H.resumen(req, plantilla), empleados: lista,
            resumen: { igual: cuenta('IGUAL'), cambiaria: cuenta('CAMBIARIA'), propio: cuenta('PROPIO') }
        });
    } catch (error) {
        return falla(res, 'previsualizarAplicar', error, 'No fue posible preparar la vista previa');
    }
};

/**
 * POST /api/horarios/aplicarPlantilla { idSucursal, idEmpleados[], aPartirDe, motivo? }
 * En una transacción: a cada escogido le copia la plantilla, regenera sus
 * días desde la fecha (respetando los cambiados a mano) y deja bitácora.
 */
const aplicarPlantilla = async (req, res) => {
    const aPartirDe = String(req.body.aPartirDe || '');
    try {
        const ids = Array.isArray(req.body.idEmpleados) ? [...new Set(req.body.idEmpleados.map(idValido))] : [];
        if (!ids.length || ids.includes(null)) return no(res, 'Escoge a qué empleados aplicar la plantilla');
        const motivo = leerMotivo(req.body.motivo);
        const r = await db.transaccion(async (t) => {
            const s = await sucursalDe(req, req.body.idSucursal, { transaction: t });
            if (!s) throw new Regla(MSG_SUC_NO_EXISTE);
            const plantilla = await H.leerPlantilla(req, s.idSucursal, t);
            if (H.vacio(plantilla)) throw new Regla(`La plantilla de ${ s.nombre } está vacía: guárdala antes de aplicarla`);
            validarAPartirDe(aPartirDe, s.zonaHoraria);
            await exigirFecha(req, aPartirDe, s.idSucursal);
            const resultados = [];
            for (const id of ids) {
                const e = await empleadoVisible(req, id, { transaction: t, bloquear: true });
                if (!e) throw new Regla(MSG_NO_EXISTE);
                if (e.estado !== 'ACTIVO') throw new Regla(`${ nombreCompleto(e) } está dado de baja`);
                if (e.idSucursalPrincipal !== s.idSucursal) throw new Regla(`${ nombreCompleto(e) } no tiene ${ s.nombre } como sucursal principal`);
                const antes = await H.leerHorarioEmpleado(req, e.idEmpleado, t);
                const g = await aplicarHorario(req, e.idEmpleado, plantilla, aPartirDe, t);
                await registrar(req, { tipo: 'APLICAR', idEmpleado: e.idEmpleado, idSucursal: s.idSucursal,
                    motivo: motivo || `Plantilla de ${ s.nombre } a partir del ${ aPartirDe }`,
                    antes: { dias: H.textoSemana(antes) },
                    despues: { aPartirDe, dias: H.textoSemana(plantilla), conservados: g.conservados.length } }, t);
                resultados.push({ idEmpleado: e.idEmpleado, nombreCompleto: nombreCompleto(e), generados: g.generados, conservados: g.conservados });
            }
            return { s, resultados };
        });
        const conservados = r.resultados.flatMap(x => x.conservados);
        return ok(res, `Plantilla de ${ r.s.nombre } aplicada a ${ r.resultados.length } empleado(s) a partir del ${ aPartirDe }${ mensajeConservados(conservados) }`,
            { aplicados: r.resultados.length, aPartirDe, resultados: r.resultados });
    } catch (error) {
        return falla(res, 'aplicarPlantilla', error, 'No fue posible aplicar la plantilla');
    }
};

// ── Días ─────────────────────────────────────────────────────────────────────

const SELECT_DIA = `
    SELECT d.idDia, d.idEmpleado, d.fecha, d.estado, d.entrada, d.salida, d.bCruzaMedianoche, d.comidaMinutos,
           d.bComidaDentro, d.horas, d.tipoJornada, d.idSucursal, s.nombre AS sucursal, d.precioHora, d.bManual,
           d.motivo, d.idSucursalCobertura, sc.nombre AS sucursalCobertura, d.horaCobertura, d.horasHorario
      FROM dias_programados d
      JOIN sucursales s ON s.idEmpresa = d.idEmpresa AND s.idSucursal = d.idSucursal
      LEFT JOIN sucursales sc ON sc.idEmpresa = d.idEmpresa AND sc.idSucursal = d.idSucursalCobertura
     WHERE d.idEmpresa = :idEmpresa`;

const leerDia = async (req, idEmpleado, fecha, transaction, bloquear = false) => (await db.empresa(req).query(`
    ${ SELECT_DIA }
       AND d.idEmpleado = :idEmpleado AND d.fecha = :fecha ${ bloquear ? 'FOR UPDATE' : '' }`,
{ replacements: { idEmpleado, fecha }, transaction }))[0];

/** Un día legible para la bitácora. */
const textoDiaProgramado = (d) => ({
    horario: H.textoDia({ ...d, estado: d.estado }),
    horas: Number(d.horas),
    sucursal: d.sucursal,
    cobertura: d.idSucursalCobertura ? `Cubre en ${ d.sucursalCobertura } desde ${ jornada.hora(d.horaCobertura) }` : null
});

/**
 * GET /api/horarios/getDiasEmpleado?idEmpleado=&desde=&hasta=
 * El calendario (a lo más 93 días). Solo vienen los días generados.
 */
const getDiasEmpleado = async (req, res) => {
    const desde = String(req.query.desde || '');
    const hasta = String(req.query.hasta || '');
    try {
        if (!esFecha(desde) || !esFecha(hasta)) return no(res, 'Las fechas no son válidas (AAAA-MM-DD)');
        if (desde > hasta) return no(res, 'La fecha inicial no puede ser posterior a la final');
        if (fechas.sumarDias(desde, MAX_DIAS_CONSULTA - 1) < hasta) return no(res, `Consulta a lo más ${ MAX_DIAS_CONSULTA } días`);
        const e = await empleadoVisible(req, req.query.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        const conPrecio = puede(req, 'empleados_Precio');
        const dias = (await db.empresa(req).query(`
            ${ SELECT_DIA }
               AND d.idEmpleado = :idEmpleado AND d.fecha BETWEEN :desde AND :hasta
             ORDER BY d.fecha`, { replacements: { idEmpleado: e.idEmpleado, desde, hasta } }))
            .map(d => DP.publico(d, { conPrecio }));
        const h = await DP.horizonte(req, e.idEmpleado);
        return ok(res, `${ dias.length } día(s)`, {
            idEmpleado: e.idEmpleado, nombreCompleto: nombreCompleto(e), zonaHoraria: e.zonaHoraria,
            hoy: h.hoy, horizonte: h.hasta, desde, hasta, dias
        });
    } catch (error) {
        return falla(res, 'getDiasEmpleado', error, 'No fue posible consultar los días');
    }
};

/**
 * GET /api/horarios/getDiasSucursal?idSucursal=&fecha=
 * Los empleados (del alcance) con día programado esa fecha en esa sucursal:
 * por sucursal del día o porque la cubren (`bCubre`). Vienen todos los
 * estados (laborable, descanso, sin horario).
 */
const getDiasSucursal = async (req, res) => {
    const fecha = String(req.query.fecha || '');
    try {
        if (!esFecha(fecha)) return no(res, 'La fecha no es válida (AAAA-MM-DD)');
        const s = await sucursalDe(req, req.query.idSucursal);
        if (!s) return no(res, MSG_SUC_NO_EXISTE);
        const f = await filtroAlcance(req, 'e');
        const conPrecio = puede(req, 'empleados_Precio');
        const filas = await db.empresa(req).query(`
            SELECT x.*, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno
              FROM (${ SELECT_DIA }
                       AND d.fecha = :fecha
                       AND (d.idSucursal = :idSucursal OR d.idSucursalCobertura = :idSucursal)) x
              JOIN empleados e ON e.idEmpresa = :idEmpresa AND e.idEmpleado = x.idEmpleado
             WHERE ${ f.sql }
             ORDER BY e.apellidoPaterno, e.apellidoMaterno, e.nombre`,
        { replacements: { fecha, idSucursal: s.idSucursal, ...f.replacements } });
        const empleados = filas.map(x => ({
            ...DP.publico(x, { conPrecio }), numeroEmpleado: x.numeroEmpleado, nombreCompleto: nombreCompleto(x),
            bCubre: x.idSucursalCobertura === s.idSucursal
        }));
        const semana = await H.semanaCerrada(req, fecha, s.idSucursal);
        return ok(res, `${ empleados.length } empleado(s)`, {
            idSucursal: s.idSucursal, sucursal: s.nombre, zonaHoraria: s.zonaHoraria, fecha, hoy: semana.hoy,
            bPasada: fecha < semana.hoy, semana: { desde: semana.desde, hasta: semana.hasta, cierre: semana.cierre, bCerrada: semana.cerrada },
            empleados
        });
    } catch (error) {
        return falla(res, 'getDiasSucursal', error, 'No fue posible consultar los días de la sucursal');
    }
};

/** Lo que llega para cambiar un día, limpio. Lanza Regla. */
const leerCambio = (b) => {
    const dia = {
        estado: String(b.estado || ''),
        entrada: b.entrada === '' || b.entrada === undefined ? null : b.entrada,
        salida: b.salida === '' || b.salida === undefined ? null : b.salida,
        comidaMinutos: b.comidaMinutos === '' || b.comidaMinutos === null || b.comidaMinutos === undefined ? 0 : Number(b.comidaMinutos),
        bComidaDentro: b.bComidaDentro === true || b.bComidaDentro === 1 || b.bComidaDentro === '1'
    };
    if (!['LABORABLE', 'DESCANSO'].includes(dia.estado)) throw new Regla('Escoge si el día es laborable o descanso');
    const errores = jornada.validarDia(dia, 'El día');
    if (errores.length) throw new Regla(errores[0], { errores });
    if (dia.estado === 'LABORABLE') { dia.entrada = jornada.hora(dia.entrada); dia.salida = jornada.hora(dia.salida); }
    let cobertura = null;
    if (b.cobertura) {
        cobertura = { idSucursalCobertura: idValido(b.cobertura.idSucursalCobertura), horaCobertura: jornada.hora(b.cobertura.horaCobertura) };
        if (!cobertura.idSucursalCobertura) throw new Regla('Escoge la sucursal que cubre');
        if (!cobertura.horaCobertura) throw new Regla('Escribe desde qué hora cubre (HH:mm)');
    }
    return { dia, motivo: leerMotivo(b.motivo), cobertura };
};

/**
 * Cambia un día a mano. `idSucursalDia` (opcional) cambia la sucursal del
 * día; en una cobertura no cambia. `deSucursal` (setDiaVarios): el día debe
 * ser de esa sucursal (del día o de cobertura).
 * Regresa { dia (público), aviso }.
 */
const cambiarDia = async (req, e, fecha, c, t, { idSucursalDia = null, deSucursal = null } = {}) => {
    const nombre = nombreCompleto(e);
    let actual = await leerDia(req, e.idEmpleado, fecha, t, true);
    if (!actual && !deSucursal) {
        await DP.generar(req, e.idEmpleado, fecha, fecha, t);
        actual = await leerDia(req, e.idEmpleado, fecha, t, true);
    }
    if (!actual) throw new Regla(deSucursal ? `${ nombre } no tiene día programado el ${ fecha } en ${ deSucursal.nombre }`
        : `${ nombre } no trabaja en la empresa el ${ fecha }`);
    if (deSucursal && actual.idSucursal !== deSucursal.idSucursal && actual.idSucursalCobertura !== deSucursal.idSucursal) {
        throw new Regla(`${ nombre } no tiene día programado el ${ fecha } en ${ deSucursal.nombre }`);
    }
    await exigirFecha(req, fecha, actual.idSucursal);

    let sucursalDia = { idSucursal: actual.idSucursal, nombre: actual.sucursal };
    if (idSucursalDia && idSucursalDia !== actual.idSucursal) {
        if (c.cobertura) throw new Regla('En una cobertura la sucursal del día no cambia: es la de la entrada');
        const s = await sucursalDe(req, idSucursalDia, { alcance: false, transaction: t });
        if (!s) throw new Regla('La sucursal del día no existe');
        if (!s.bActivo) throw new Regla(`La sucursal ${ s.nombre } está inactiva`);
        sucursalDia = s;
    }

    let motivo = c.motivo;
    let cobertura = { idSucursalCobertura: null, horaCobertura: null, horasHorario: null };
    if (c.cobertura) {
        if (c.dia.estado !== 'LABORABLE') throw new Regla('Una cobertura solo se marca en un día laborable');
        const s = await sucursalDe(req, c.cobertura.idSucursalCobertura, { alcance: false, transaction: t });
        if (!s) throw new Regla('La sucursal que cubre no existe');
        if (!s.bActivo) throw new Regla(`La sucursal ${ s.nombre } está inactiva`);
        if (s.idSucursal === sucursalDia.idSucursal) throw new Regla('La sucursal que cubre debe ser otra que la del día');
        if (!jornada.dentroDelTurno(c.dia.entrada, c.dia.salida, c.cobertura.horaCobertura)) {
            throw new Regla(`La hora de cobertura (${ c.cobertura.horaCobertura }) debe caer dentro del turno (${ c.dia.entrada }–${ c.dia.salida })`);
        }
        const horario = await H.leerHorarioEmpleado(req, e.idEmpleado, t);
        cobertura = { idSucursalCobertura: s.idSucursal, horaCobertura: c.cobertura.horaCobertura,
            horasHorario: DP.deHorario(horario[DP.diaSemanaDe(fecha) - 1]).horas };
        motivo = motivo || `Cubre en ${ s.nombre }`;
    }
    if (!motivo) throw new Regla('Escribe el motivo del cambio');

    const nuevo = DP.deHorario(c.dia);
    await db.empresa(req).query(`
        UPDATE dias_programados
           SET estado = :estado, entrada = :entrada, salida = :salida, bCruzaMedianoche = :bCruzaMedianoche,
               comidaMinutos = :comidaMinutos, bComidaDentro = :bComidaDentro, horas = :horas, tipoJornada = :tipoJornada,
               idSucursal = :idSucursal, bManual = 1, motivo = :motivo,
               idSucursalCobertura = :idSucursalCobertura, horaCobertura = :horaCobertura, horasHorario = :horasHorario,
               idUsuarioCambio = :uid
         WHERE idEmpresa = :idEmpresa AND idDia = :idDia`, {
        replacements: { ...nuevo, idSucursal: sucursalDia.idSucursal, motivo, ...cobertura, uid: req.uid ?? null, idDia: actual.idDia },
        type: QueryTypes.UPDATE, transaction: t
    });
    const despues = await leerDia(req, e.idEmpleado, fecha, t);
    await registrar(req, { tipo: cobertura.idSucursalCobertura ? 'COBERTURA' : 'DIA', idEmpleado: e.idEmpleado,
        idSucursal: sucursalDia.idSucursal, fechaDia: fecha, motivo,
        antes: textoDiaProgramado(actual), despues: textoDiaProgramado(despues) }, t);
    const dia = DP.publico(despues, { conPrecio: puede(req, 'empleados_Precio') });
    return { dia, aviso: jornada.avisoDia({ ...dia, diaSemana: null }) };
};

/**
 * POST /api/horarios/setDia { idEmpleado, fecha, estado, entrada, salida, comidaMinutos,
 *   bComidaDentro, idSucursal?, motivo, cobertura?: { idSucursalCobertura, horaCobertura } }
 * Motivo obligatorio (en una cobertura, por default "Cubre en <sucursal>").
 */
const setDia = async (req, res) => {
    const fecha = String(req.body.fecha || '');
    try {
        if (!esFecha(fecha)) return no(res, 'La fecha no es válida (AAAA-MM-DD)');
        const c = leerCambio(req.body);
        const r = await db.transaccion(async (t) => {
            const e = await empleadoVisible(req, req.body.idEmpleado, { transaction: t, bloquear: true });
            if (!e) throw new Regla(MSG_NO_EXISTE);
            return cambiarDia(req, e, fecha, c, t, { idSucursalDia: idValido(req.body.idSucursal) });
        });
        return ok(res, `Día ${ fecha } cambiado${ r.dia.idSucursalCobertura ? ` (cubre en ${ r.dia.sucursalCobertura })` : '' }`, {
            dia: r.dia, avisos: r.aviso ? [r.aviso] : []
        });
    } catch (error) {
        return falla(res, 'setDia', error, 'No fue posible cambiar el día');
    }
};

/**
 * POST /api/horarios/setDiaVarios { idSucursal, fecha, idEmpleados[], estado, entrada, salida,
 *   comidaMinutos, bComidaDentro, motivo, cobertura? }
 * El mismo cambio para varios, en una transacción. `idSucursal` es la de la
 * pantalla: el día de cada uno debe ser de ella (o cubrirla). La sucursal del
 * día no cambia.
 */
const setDiaVarios = async (req, res) => {
    const fecha = String(req.body.fecha || '');
    try {
        if (!esFecha(fecha)) return no(res, 'La fecha no es válida (AAAA-MM-DD)');
        const ids = Array.isArray(req.body.idEmpleados) ? [...new Set(req.body.idEmpleados.map(idValido))] : [];
        if (!ids.length || ids.includes(null)) return no(res, 'Escoge a qué empleados cambiar el día');
        const c = leerCambio(req.body);
        const r = await db.transaccion(async (t) => {
            const s = await sucursalDe(req, req.body.idSucursal, { transaction: t });
            if (!s) throw new Regla(MSG_SUC_NO_EXISTE);
            const out = [];
            for (const id of ids) {
                const e = await empleadoVisible(req, id, { transaction: t, bloquear: true });
                if (!e) throw new Regla(MSG_NO_EXISTE);
                out.push(await cambiarDia(req, e, fecha, c, t, { deSucursal: s }));
            }
            return out;
        });
        return ok(res, `Día ${ fecha } cambiado a ${ r.length } empleado(s)`, {
            cambiados: r.length, dias: r.map(x => x.dia), avisos: r.map(x => x.aviso).filter(Boolean)
        });
    } catch (error) {
        return falla(res, 'setDiaVarios', error, 'No fue posible cambiar el día');
    }
};

/**
 * POST /api/horarios/regresarDia { idEmpleado, fecha, motivo }
 * Vuelve a lo que marca el horario semanal: quita bManual y la cobertura.
 */
const regresarDia = async (req, res) => {
    const fecha = String(req.body.fecha || '');
    try {
        if (!esFecha(fecha)) return no(res, 'La fecha no es válida (AAAA-MM-DD)');
        const motivo = leerMotivo(req.body.motivo);
        if (!motivo) return no(res, 'Escribe el motivo para regresar el día a su horario');
        const dia = await db.transaccion(async (t) => {
            const e = await empleadoVisible(req, req.body.idEmpleado, { transaction: t, bloquear: true });
            if (!e) throw new Regla(MSG_NO_EXISTE);
            const actual = await leerDia(req, e.idEmpleado, fecha, t, true);
            if (!actual) throw new Regla(`${ nombreCompleto(e) } no tiene día programado el ${ fecha }`);
            if (!actual.bManual) throw new Regla(`El día ${ fecha } no está cambiado a mano: ya es el de su horario`);
            await exigirFecha(req, fecha, actual.idSucursal);
            await DP.regenerarDia(req, e.idEmpleado, fecha, t);
            const despues = await leerDia(req, e.idEmpleado, fecha, t);
            await registrar(req, { tipo: 'DIA_REGRESO', idEmpleado: e.idEmpleado, idSucursal: despues.idSucursal, fechaDia: fecha, motivo,
                antes: textoDiaProgramado(actual), despues: textoDiaProgramado(despues) }, t);
            return DP.publico(despues, { conPrecio: puede(req, 'empleados_Precio') });
        });
        return ok(res, `El día ${ fecha } regresó a su horario`, { dia });
    } catch (error) {
        return falla(res, 'regresarDia', error, 'No fue posible regresar el día');
    }
};

/**
 * GET /api/horarios/getSalidaPlantilla?idSucursal=&fecha=
 * La salida de la plantilla de esa sucursal para ese día de la semana (la
 * sucursal solo tiene que ser de la empresa: es la que se cubre). Sin
 * horario ese día: data.salida = null y el mensaje lo dice.
 */
const getSalidaPlantilla = async (req, res) => {
    const fecha = String(req.query.fecha || '');
    try {
        if (!esFecha(fecha)) return no(res, 'La fecha no es válida (AAAA-MM-DD)');
        const s = await sucursalDe(req, req.query.idSucursal, { alcance: false });
        if (!s) return no(res, MSG_SUC_NO_EXISTE);
        const diaSemana = DP.diaSemanaDe(fecha);
        const d = (await H.leerPlantilla(req, s.idSucursal))[diaSemana - 1];
        const data = { idSucursal: s.idSucursal, sucursal: s.nombre, fecha, diaSemana, nombreDia: jornada.nombreDia(diaSemana),
            estado: d.estado, entrada: d.entrada, salida: d.estado === 'LABORABLE' ? d.salida : null };
        return ok(res, data.salida ? `La plantilla de ${ s.nombre } sale a las ${ data.salida } el ${ data.nombreDia.toLowerCase() }`
            : `La plantilla de ${ s.nombre } no tiene horario el ${ data.nombreDia.toLowerCase() }`, data);
    } catch (error) {
        return falla(res, 'getSalidaPlantilla', error, 'No fue posible consultar la plantilla');
    }
};

// ── Listas ───────────────────────────────────────────────────────────────────

/**
 * GET /api/horarios/getHorariosPorAjustar?idSucursal=
 * Empleados activos del alcance sin horario, o con días SIN_HORARIO de hoy
 * en adelante (hoy en la zona de su sucursal principal).
 */
const getHorariosPorAjustar = async (req, res) => {
    try {
        const idSucursal = idValido(req.query.idSucursal);
        if (req.query.idSucursal && !(idSucursal && await sucursalDe(req, idSucursal))) return no(res, MSG_SUC_NO_EXISTE);
        const f = await filtroAlcance(req, 'e');
        const zonas = (await db.empresa(req).query('SELECT DISTINCT zonaHoraria FROM sucursales WHERE idEmpresa = :idEmpresa'))
            .map(z => z.zonaHoraria);
        const hoyPorZona = {};
        const casos = zonas.map((z, i) => { hoyPorZona[`z${ i }`] = z; hoyPorZona[`h${ i }`] = fechas.hoy(z); return `WHEN :z${ i } THEN :h${ i }`; });
        const desde = casos.length ? `CASE sp.zonaHoraria ${ casos.join(' ') } END` : 'NULL';
        const filas = await db.empresa(req).query(`
            SELECT e.idEmpleado, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno,
                   e.idSucursalPrincipal, sp.nombre AS sucursalPrincipal, sp.zonaHoraria,
                   NOT EXISTS (SELECT 1 FROM empleados_horario h WHERE h.idEmpresa = e.idEmpresa AND h.idEmpleado = e.idEmpleado) AS bSinHorario,
                   (SELECT COUNT(*) FROM dias_programados d
                     WHERE d.idEmpresa = e.idEmpresa AND d.idEmpleado = e.idEmpleado AND d.estado = 'SIN_HORARIO'
                       AND d.fecha >= ${ desde }) AS diasSinHorario,
                   (SELECT MIN(d.fecha) FROM dias_programados d
                     WHERE d.idEmpresa = e.idEmpresa AND d.idEmpleado = e.idEmpleado AND d.estado = 'SIN_HORARIO'
                       AND d.fecha >= ${ desde }) AS primerDiaSinHorario
              FROM empleados e
              JOIN sucursales sp ON sp.idEmpresa = e.idEmpresa AND sp.idSucursal = e.idSucursalPrincipal
             WHERE e.idEmpresa = :idEmpresa AND e.estado = 'ACTIVO' AND ${ f.sql }
               AND (:idSucursal IS NULL OR e.idSucursalPrincipal = :idSucursal)
             ORDER BY e.apellidoPaterno, e.apellidoMaterno, e.nombre`,
        { replacements: { ...hoyPorZona, ...f.replacements, idSucursal } });
        const data = filas
            .map(x => ({
                idEmpleado: x.idEmpleado, numeroEmpleado: x.numeroEmpleado, nombreCompleto: nombreCompleto(x),
                idSucursalPrincipal: x.idSucursalPrincipal, sucursalPrincipal: x.sucursalPrincipal, zonaHoraria: x.zonaHoraria,
                bSinHorario: !!Number(x.bSinHorario), diasSinHorario: Number(x.diasSinHorario) || 0,
                primerDiaSinHorario: x.primerDiaSinHorario || null
            }))
            .filter(x => x.bSinHorario || x.diasSinHorario > 0);
        return ok(res, `${ data.length } empleado(s) con horario por ajustar`, data);
    } catch (error) {
        return falla(res, 'getHorariosPorAjustar', error, 'No fue posible consultar los horarios por ajustar');
    }
};

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? null);
/** Sin la copia en crudo de la plantilla (`semana`): solo lo legible. */
const sinCrudo = (v) => { if (v && typeof v === 'object' && !Array.isArray(v)) { const { semana, ...resto } = v; void semana; return resto; } return v; };

/**
 * GET /api/horarios/getBitacoraHorarios?idEmpleado= | idSucursal=&desde=&hasta=
 * Una de las dos: la del empleado (ficha) o la de la sucursal (pantalla
 * Horarios). `desde`/`hasta` (AAAA-MM-DD, opcionales) en la zona de la
 * sucursal (la principal, para un empleado). Lo más reciente primero, hasta 500.
 */
const getBitacoraHorarios = async (req, res) => {
    const desde = req.query.desde ? String(req.query.desde) : null;
    const hasta = req.query.hasta ? String(req.query.hasta) : null;
    try {
        if ((desde && !esFecha(desde)) || (hasta && !esFecha(hasta))) return no(res, 'Las fechas no son válidas (AAAA-MM-DD)');
        if (desde && hasta && desde > hasta) return no(res, 'La fecha inicial no puede ser posterior a la final');
        let filtro, replacements, zona;
        if (req.query.idEmpleado) {
            const e = await empleadoVisible(req, req.query.idEmpleado);
            if (!e) return no(res, MSG_NO_EXISTE);
            filtro = 'b.idEmpleado = :id'; replacements = { id: e.idEmpleado }; zona = e.zonaHoraria;
        } else if (req.query.idSucursal) {
            const s = await sucursalDe(req, req.query.idSucursal);
            if (!s) return no(res, MSG_SUC_NO_EXISTE);
            filtro = 'b.idSucursal = :id'; replacements = { id: s.idSucursal }; zona = s.zonaHoraria;
        } else {
            return no(res, 'Indica el empleado o la sucursal');
        }
        replacements.inicio = desde ? fechas.limitesDia(desde, zona).inicio : null;
        replacements.fin = hasta ? fechas.limitesDia(hasta, zona).fin : null;
        const filas = await db.empresa(req).query(`
            SELECT b.idBitacora, b.fecha, b.tipo, b.idEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno,
                   b.idSucursal, s.nombre AS sucursal, b.fechaDia, b.motivo, b.antes, b.despues, u.nombre AS autor
              FROM bitacora_horarios b
              LEFT JOIN empleados e ON e.idEmpresa = b.idEmpresa AND e.idEmpleado = b.idEmpleado
              LEFT JOIN sucursales s ON s.idEmpresa = b.idEmpresa AND s.idSucursal = b.idSucursal
              LEFT JOIN usuarios u ON u.idUsuario = b.idUsuarioAutor
             WHERE b.idEmpresa = :idEmpresa AND ${ filtro }
               AND (:inicio IS NULL OR b.fecha >= :inicio)
               AND (:fin IS NULL OR b.fecha < :fin)
             ORDER BY b.idBitacora DESC
             LIMIT ${ MAX_BITACORA }`, { replacements });
        const data = filas.map(x => ({
            idBitacora: x.idBitacora, fecha: x.fecha, tipo: x.tipo,
            idEmpleado: x.idEmpleado, empleado: x.idEmpleado ? nombreCompleto(x) : null,
            idSucursal: x.idSucursal, sucursal: x.sucursal, fechaDia: x.fechaDia, motivo: x.motivo,
            antes: sinCrudo(json(x.antes)), despues: sinCrudo(json(x.despues)), autor: x.autor, zonaHoraria: zona
        }));
        return ok(res, `${ data.length } cambio(s)`, data);
    } catch (error) {
        return falla(res, 'getBitacoraHorarios', error, 'No fue posible consultar la bitácora de horarios');
    }
};

module.exports = {
    getSucursalesHorarios,
    getHorarioEmpleado, revisarHorario, setHorarioEmpleado,
    getPlantilla, setPlantilla, previsualizarAplicar, aplicarPlantilla,
    getDiasEmpleado, getDiasSucursal, setDia, setDiaVarios, regresarDia, getSalidaPlantilla,
    getHorariosPorAjustar, getBitacoraHorarios
};
