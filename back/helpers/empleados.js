// =============================================================================
// Piezas de empleados que usan varios endpoints (análisis 004)
// =============================================================================
//   siguienteNumero(req)              el siguiente número de empleado
//   filtroAlcance(req, alias)         SQL + parámetros: solo los empleados cuya
//                                     sucursal principal U operativa es del
//                                     alcance del usuario (001)
//   empleadoVisible(req, id)          el empleado, si es de la empresa y del
//                                     alcance; si no, undefined ("no existe")
//   precioVigente(req, id, fecha)     el precio de ese día
//   activosEn(req, fecha)             cuántos tenían un periodo abierto ese día
//   usoDelPlan(req)                   plan vigente, activos y % del límite (009)
//   permiteAlta(req, n)               límite del plan (009): ¿caben n activos más?
//   ultimoMarcaje(req, id)            hoy vacío (los marcajes llegan con el 007)
//   validarEmpleado(req, d, ctx)      LA regla de un empleado: la usan el alta,
//                                     la edición, la vista previa y la carga
//                                     del Excel
// =============================================================================

const { DateTime } = require('luxon');
const { db, QueryTypes } = require('./db');
const { alcanceSucursales } = require('./sesion');
const { hoy } = require('./fechas');
const { Regla } = require('./permisosEdicion');
const { planVigente } = require('./panel/plan');

const MSG_NO_EXISTE = 'El empleado no existe';
const PRECIO_MAX = 10000;

// ── Textos y formatos ────────────────────────────────────────────────────────

/** Sin espacios de más; vacío → null. */
const texto = (v, max = null) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(/\s+/g, ' ');
    if (!s) return null;
    return max ? s.slice(0, max + 1) : s;     // un carácter de más para que la validación lo note
};
const mayusculas = (v) => { const s = texto(v); return s ? s.toUpperCase().replace(/\s+/g, '') : null; };
const idONulo = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

/** 'AAAA-MM-DD' de verdad (no 2026-02-30). Es una fecha de negocio: no pasa por instantes. */
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromFormat(s, 'yyyy-MM-dd', { zone: 'utc' }).isValid;

const RE = {
    numero: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    curp: /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/,
    rfc: /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/,
    nss: /^\d{11}$/,
    correo: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    telefono: /^[0-9+()\-. ]{7,20}$/
};

/** Nombre completo para buscar duplicados: sin mayúsculas, acentos ni espacios de más. */
const llaveNombre = (nombre, paterno, materno) => [nombre, paterno, materno]
    .map(x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean).join(' ');

// ── Alcance ──────────────────────────────────────────────────────────────────

/**
 * SQL para limitar a los empleados del alcance:
 *   const f = await filtroAlcance(req, 'e');
 *   `... WHERE e.idEmpresa = :idEmpresa AND ${ f.sql }`, { replacements: { ...f.replacements } }
 */
const filtroAlcance = async (req, alias = 'e', transaction) => {
    const alcance = await alcanceSucursales(req, transaction);
    if (alcance.todas) return { sql: '1 = 1', replacements: {}, alcance };
    const ids = [...alcance.ids];
    return {
        sql: `(${ alias }.idSucursalPrincipal IN (:alcanceIds) OR ${ alias }.idSucursalOperativa IN (:alcanceIds))`,
        replacements: { alcanceIds: ids.length ? ids : [0] },
        alcance
    };
};

const CAMPOS_EMPLEADO = `
    e.idEmpleado, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno,
    e.idSucursalPrincipal, e.idSucursalOperativa, e.idPuesto, e.idDepartamento,
    e.estado, e.fechaIngreso, e.fechaBaja, e.motivoBaja, e.telefono, e.correo,
    e.curp, e.rfc, e.nss, e.fechaNacimiento, e.foto, e.idUsuario, e.fechaAlta`;

/** El empleado si es de la empresa y del alcance; si no, undefined. `bloquear` = FOR UPDATE. */
const empleadoVisible = async (req, idEmpleado, { transaction, bloquear = false } = {}) => {
    const id = idONulo(idEmpleado);
    if (!id) return undefined;
    const f = await filtroAlcance(req, 'e', transaction);
    const [e] = await db.empresa(req).query(`
        SELECT ${ CAMPOS_EMPLEADO }, sp.zonaHoraria
          FROM empleados e
          JOIN sucursales sp ON sp.idEmpresa = e.idEmpresa AND sp.idSucursal = e.idSucursalPrincipal
         WHERE e.idEmpresa = :idEmpresa AND e.idEmpleado = :id AND ${ f.sql }
         ${ bloquear ? 'FOR UPDATE' : '' }`, { replacements: { id, ...f.replacements }, transaction });
    return e;
};

// ── Número, precio, activos, plan, marcajes ──────────────────────────────────

/** El mayor número numérico de la empresa (también los de baja), más uno. */
const siguienteNumero = async (req, transaction) => {
    const [r] = await db.empresa(req).query(`
        SELECT MAX(CAST(numeroEmpleado AS UNSIGNED)) AS mayor
          FROM empleados
         WHERE idEmpresa = :idEmpresa AND numeroEmpleado REGEXP '^[0-9]{1,18}$'`, { transaction });
    return String(Number(r?.mayor || 0) + 1);
};

/** El precio con el mayor `aPartirDe` que no pase de `fecha` (o null). */
const precioVigente = async (req, idEmpleado, fecha, transaction) => {
    const [p] = await db.empresa(req).query(`
        SELECT precioHora, aPartirDe
          FROM empleados_precios
         WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND aPartirDe <= :fecha
         ORDER BY aPartirDe DESC
         LIMIT 1`, { replacements: { idEmpleado, fecha }, transaction });
    return p ? { precioHora: Number(p.precioHora), aPartirDe: p.aPartirDe } : null;
};

/**
 * Cuántos empleados tenían un periodo laboral abierto el día `fecha`
 * (la fecha de baja es su último día). Con `f` (filtroAlcance) cuenta solo los
 * del alcance; sin él, toda la empresa (lo usa el cobro, 009).
 */
const activosEn = async (req, fecha, f = null) => {
    const [r] = await db.empresa(req).query(`
        SELECT COUNT(DISTINCT p.idEmpleado) AS n
          FROM empleados_periodos p
          JOIN empleados e ON e.idEmpresa = p.idEmpresa AND e.idEmpleado = p.idEmpleado
         WHERE p.idEmpresa = :idEmpresa
           AND p.fechaIngreso <= :fecha
           AND (p.fechaBaja IS NULL OR p.fechaBaja >= :fecha)
           AND ${ f ? f.sql : '1 = 1' }`, { replacements: { fecha, ...(f?.replacements || {}) } });
    return Number(r.n);
};

/**
 * Uso del plan de la empresa de la sesión (009): { plan, tipoCobro, limite,
 * activos, porcentaje }. Activos = empleados en estado ACTIVO (lo mismo que
 * cuenta el conteo diario). Sin plan con límite, `limite` y `porcentaje` son null.
 */
const usoDelPlan = async (req, transaction) => {
    const plan = await planVigente(req, transaction);
    const [r] = await db.empresa(req).query(
        "SELECT COUNT(*) AS n FROM empleados WHERE idEmpresa = :idEmpresa AND estado = 'ACTIVO'", { transaction });
    const activos = Number(r.n);
    const limite = plan?.tipoCobro === 'LIMITE' ? plan.limiteEmpleados : null;
    return {
        plan: plan?.nombre ?? null,
        tipoCobro: plan?.tipoCobro ?? null,
        limite,
        activos,
        porcentaje: limite ? Math.floor((activos * 100) / limite) : null
    };
};

/**
 * Límite del plan (009): con un plan LIMITE, activos + `cantidad` no puede
 * pasar del límite. Aplica a la alta, la reactivación (reingreso) y la alta
 * masiva; nunca al checador ni a las consultas. → { ok, mensaje }
 */
const permiteAlta = async (req, cantidad = 1, transaction) => {
    const uso = await usoDelPlan(req, transaction);
    if (uso.limite === null || uso.activos + cantidad <= uso.limite) return { ok: true, mensaje: null };
    const disponibles = Math.max(uso.limite - uso.activos, 0);
    return {
        ok: false,
        mensaje: `Tu plan ${ uso.plan } permite hasta ${ uso.limite } empleados activos y hoy tienes ${ uso.activos }`
            + (cantidad > 1 ? `: no caben los ${ cantidad } nuevos${ disponibles ? ` (quedan ${ disponibles } lugares)` : '' }.` : '.')
            + ' Para dar de alta o reactivar más empleados, pide al proveedor del sistema que suba tu plan.'
    };
};

/** Último marcaje del empleado: { instante, fecha } o null. Los marcajes llegan con el 007. */
// eslint-disable-next-line no-unused-vars
const ultimoMarcaje = async (req, idEmpleado) => null;

// ── Catálogos de la empresa para validar ─────────────────────────────────────

/** Sucursales, puestos y departamentos de la empresa, con el alcance. */
const catalogos = async (req, transaction) => {
    const alcance = await alcanceSucursales(req, transaction);
    const sucursales = await db.empresa(req).query(
        'SELECT idSucursal, nombre, zonaHoraria, bActivo FROM sucursales WHERE idEmpresa = :idEmpresa', { transaction });
    const puestos = await db.empresa(req).query(
        'SELECT idPuesto AS id, nombre, bActivo FROM puestos WHERE idEmpresa = :idEmpresa', { transaction });
    const departamentos = await db.empresa(req).query(
        'SELECT idDepartamento AS id, nombre, bActivo FROM departamentos WHERE idEmpresa = :idEmpresa', { transaction });
    const porId = (l, k) => new Map(l.map(x => [x[k], x]));
    const porNombre = (l) => new Map(l.map(x => [llaveNombre(x.nombre), x]));
    return {
        alcance,
        sucursales: porId(sucursales, 'idSucursal'), sucursalesPorNombre: porNombre(sucursales),
        puestos: porId(puestos, 'id'), puestosPorNombre: porNombre(puestos),
        departamentos: porId(departamentos, 'id'), departamentosPorNombre: porNombre(departamentos)
    };
};

// ── Limpieza de lo que llega ─────────────────────────────────────────────────

const CAMPOS_PERSONALES = ['curp', 'rfc', 'nss', 'fechaNacimiento'];

/** Lo que llega del navegador o del Excel, limpio. Lo que no viene queda `undefined`. */
const limpiar = (b) => {
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    const d = {};
    if (has('numeroEmpleado')) d.numeroEmpleado = texto(b.numeroEmpleado, 20);
    if (has('nombre')) d.nombre = texto(b.nombre, 80);
    if (has('apellidoPaterno')) d.apellidoPaterno = texto(b.apellidoPaterno, 60);
    if (has('apellidoMaterno')) d.apellidoMaterno = texto(b.apellidoMaterno, 60);
    for (const k of ['idSucursalPrincipal', 'idSucursalOperativa', 'idPuesto', 'idDepartamento', 'idUsuario']) {
        if (has(k)) d[k] = idONulo(b[k]);
    }
    if (has('fechaIngreso')) d.fechaIngreso = texto(b.fechaIngreso);
    if (has('telefono')) d.telefono = texto(b.telefono, 20);
    if (has('correo')) d.correo = texto(b.correo, 150)?.toLowerCase() ?? null;
    if (has('curp')) d.curp = mayusculas(b.curp);
    if (has('rfc')) d.rfc = mayusculas(b.rfc);
    if (has('nss')) d.nss = texto(b.nss)?.replace(/[\s-]/g, '') ?? null;
    if (has('fechaNacimiento')) d.fechaNacimiento = texto(b.fechaNacimiento);
    return d;
};

// ── La regla ─────────────────────────────────────────────────────────────────

/**
 * Valida un empleado ya combinado (lo que llegó encima de lo que tenía).
 *   d       { numeroEmpleado, nombre, ..., idSucursalPrincipal, ... }
 *   ctx     { actual (o null en el alta), cat (catalogos()), numerosLote (Set,
 *             opcional), idPuestoNuevo/idDepartamentoNuevo (true si se crearán) }
 * Regresa la lista de errores (vacía si está bien). No lanza.
 */
const validarEmpleado = async (req, d, ctx, transaction) => {
    const { actual = null, cat } = ctx;
    const errores = [];
    const cambia = (k) => !actual || String(actual[k] ?? '') !== String(d[k] ?? '');

    // Identificación
    if (!d.numeroEmpleado) errores.push('Falta el número de empleado');
    else if (d.numeroEmpleado.length > 20) errores.push('El número de empleado admite hasta 20 caracteres');
    else if (!RE.numero.test(d.numeroEmpleado)) errores.push(`El número "${ d.numeroEmpleado }" solo admite letras, números, guion, punto y diagonal`);
    else {
        if (ctx.numerosLote?.has(d.numeroEmpleado.toLowerCase())) errores.push(`El número ${ d.numeroEmpleado } está repetido en el archivo`);
        if (cambia('numeroEmpleado')) {
            const [otro] = await db.empresa(req).query(`
                SELECT idEmpleado, estado FROM empleados
                 WHERE idEmpresa = :idEmpresa AND numeroEmpleado = :numero AND idEmpleado <> :id`,
            { replacements: { numero: d.numeroEmpleado, id: actual?.idEmpleado || 0 }, transaction });
            if (otro) errores.push(`El número ${ d.numeroEmpleado } ya es de otro empleado${ otro.estado === 'BAJA' ? ' (dado de baja)' : '' }`);
        }
    }
    if (!d.nombre) errores.push('Falta el nombre');
    else if (d.nombre.length > 80) errores.push('El nombre admite hasta 80 caracteres');
    if (!d.apellidoPaterno) errores.push('Falta el apellido paterno');
    else if (d.apellidoPaterno.length > 60) errores.push('El apellido paterno admite hasta 60 caracteres');
    if (d.apellidoMaterno && d.apellidoMaterno.length > 60) errores.push('El apellido materno admite hasta 60 caracteres');

    // Sucursales: una que cambia debe existir, ser del alcance y estar activa.
    // La que ya tenía se conserva aunque esté inactiva.
    for (const [k, etiqueta] of [['idSucursalPrincipal', 'principal'], ['idSucursalOperativa', 'operativa']]) {
        if (!d[k]) { errores.push(`Falta la sucursal ${ etiqueta }`); continue; }
        if (!cambia(k)) continue;
        const s = cat.sucursales.get(d[k]);
        if (!s || !cat.alcance.incluye(d[k])) errores.push(`La sucursal ${ etiqueta } no existe`);
        else if (!s.bActivo) errores.push(`La sucursal ${ s.nombre } está inactiva`);
    }

    // Puesto y departamento: activos y de la empresa (o por crearse en la carga).
    for (const [k, lista, etiqueta] of [['idPuesto', cat.puestos, 'puesto'], ['idDepartamento', cat.departamentos, 'departamento']]) {
        if (!d[k] || !cambia(k)) continue;
        const x = lista.get(d[k]);
        if (!x) errores.push(`El ${ etiqueta } no existe`);
        else if (!x.bActivo) errores.push(`El ${ etiqueta } ${ x.nombre } está inactivo`);
    }

    // Periodo
    if (!actual) {
        if (!d.fechaIngreso) errores.push('Falta la fecha de ingreso');
        else if (!esFecha(d.fechaIngreso)) errores.push(`La fecha de ingreso "${ d.fechaIngreso }" no es válida (AAAA-MM-DD)`);
    }

    // Contacto y datos personales
    if (d.telefono && (d.telefono.length > 20 || !RE.telefono.test(d.telefono))) errores.push(`El teléfono "${ d.telefono }" no es válido`);
    if (d.correo && (d.correo.length > 150 || !RE.correo.test(d.correo))) errores.push(`El correo "${ d.correo }" no es válido`);
    if (d.curp && cambia('curp') && !RE.curp.test(d.curp)) errores.push(`La CURP "${ d.curp }" no tiene un formato válido`);
    if (d.rfc && cambia('rfc') && !RE.rfc.test(d.rfc)) errores.push(`El RFC "${ d.rfc }" no tiene un formato válido`);
    if (d.nss && cambia('nss') && !RE.nss.test(d.nss)) errores.push(`El NSS "${ d.nss }" debe tener 11 dígitos`);
    if (d.fechaNacimiento && cambia('fechaNacimiento')) {
        const zona = cat.sucursales.get(d.idSucursalPrincipal)?.zonaHoraria || 'America/Mexico_City';
        if (!esFecha(d.fechaNacimiento)) errores.push(`La fecha de nacimiento "${ d.fechaNacimiento }" no es válida (AAAA-MM-DD)`);
        else if (d.fechaNacimiento >= hoy(zona) || d.fechaNacimiento < '1900-01-01') errores.push('La fecha de nacimiento no es válida');
    }

    // Cuenta ligada: acceso activo en la empresa y sin otro empleado.
    if (d.idUsuario && cambia('idUsuario')) {
        const [acceso] = await db.empresa(req).query(`
            SELECT ue.idUsuario,
                   (SELECT e.idEmpleado FROM empleados e
                     WHERE e.idEmpresa = :idEmpresa AND e.idUsuario = ue.idUsuario AND e.idEmpleado <> :id LIMIT 1) AS otro
              FROM usuarios_empresa ue
             WHERE ue.idEmpresa = :idEmpresa AND ue.idUsuario = :idUsuario AND ue.bActivo = 1`,
        { replacements: { idUsuario: d.idUsuario, id: actual?.idEmpleado || 0 }, transaction });
        if (!acceso) errores.push('El usuario no existe en esta empresa');
        else if (acceso.otro) errores.push('Ese usuario ya está ligado a otro empleado');
    }
    return errores;
};

/**
 * Posibles duplicados de un alta: mismo nombre completo o misma CURP.
 * Regresa { visibles: [...], fuera: n } — de los que no son del alcance del
 * usuario solo se dice cuántos hay.
 */
const posiblesDuplicados = async (req, d, transaction) => {
    const llave = llaveNombre(d.nombre, d.apellidoPaterno, d.apellidoMaterno);
    const candidatos = await db.empresa(req).query(`
        SELECT e.idEmpleado, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno, e.estado, e.curp,
               e.idSucursalPrincipal, e.idSucursalOperativa, s.nombre AS sucursal
          FROM empleados e
          JOIN sucursales s ON s.idEmpresa = e.idEmpresa AND s.idSucursal = e.idSucursalPrincipal
         WHERE e.idEmpresa = :idEmpresa
           AND (e.apellidoPaterno = :paterno OR (:curp IS NOT NULL AND e.curp = :curp))`,
    { replacements: { paterno: d.apellidoPaterno || '', curp: d.curp || null }, transaction });
    const iguales = candidatos.filter(c =>
        llaveNombre(c.nombre, c.apellidoPaterno, c.apellidoMaterno) === llave || (d.curp && c.curp === d.curp));
    if (!iguales.length) return { visibles: [], fuera: 0 };
    const alcance = await alcanceSucursales(req, transaction);
    const ve = (c) => alcance.incluye(c.idSucursalPrincipal) || alcance.incluye(c.idSucursalOperativa);
    return {
        visibles: iguales.filter(ve).map(c => ({
            idEmpleado: c.idEmpleado, numeroEmpleado: c.numeroEmpleado,
            nombreCompleto: [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' '),
            estado: c.estado, sucursal: c.sucursal,
            motivo: d.curp && c.curp === d.curp ? 'misma CURP' : 'mismo nombre'
        })),
        fuera: iguales.filter(c => !ve(c)).length
    };
};

// ── Escritura del alta (la usan insertUpdateEmpleado y la importación) ──────

/** Inserta el empleado, su primer periodo y su bitácora. Regresa el id. */
const crearEmpleado = async (req, d, tipoBitacora, transaction) => {
    const [idEmpleado] = await db.empresa(req).query(`
        INSERT INTO empleados (idEmpresa, numeroEmpleado, nombre, apellidoPaterno, apellidoMaterno,
                               idSucursalPrincipal, idSucursalOperativa, idPuesto, idDepartamento,
                               estado, fechaIngreso, telefono, correo, curp, rfc, nss, fechaNacimiento, idUsuario)
        VALUES (:idEmpresa, :numeroEmpleado, :nombre, :apellidoPaterno, :apellidoMaterno,
                :idSucursalPrincipal, :idSucursalOperativa, :idPuesto, :idDepartamento,
                'ACTIVO', :fechaIngreso, :telefono, :correo, :curp, :rfc, :nss, :fechaNacimiento, :idUsuario)`, {
        replacements: {
            numeroEmpleado: d.numeroEmpleado, nombre: d.nombre, apellidoPaterno: d.apellidoPaterno,
            apellidoMaterno: d.apellidoMaterno ?? null,
            idSucursalPrincipal: d.idSucursalPrincipal, idSucursalOperativa: d.idSucursalOperativa,
            idPuesto: d.idPuesto ?? null, idDepartamento: d.idDepartamento ?? null, fechaIngreso: d.fechaIngreso,
            telefono: d.telefono ?? null, correo: d.correo ?? null, curp: d.curp ?? null, rfc: d.rfc ?? null,
            nss: d.nss ?? null, fechaNacimiento: d.fechaNacimiento ?? null, idUsuario: d.idUsuario ?? null
        },
        type: QueryTypes.INSERT,
        transaction
    });
    await db.empresa(req).query(`
        INSERT INTO empleados_periodos (idEmpresa, idEmpleado, fechaIngreso)
        VALUES (:idEmpresa, :idEmpleado, :fechaIngreso)`,
    { replacements: { idEmpleado, fechaIngreso: d.fechaIngreso }, type: QueryTypes.INSERT, transaction });

    const { registrar } = require('./bitacoraEmpleados');
    const despues = { ...d };
    for (const k of Object.keys(despues)) if (despues[k] === null || despues[k] === undefined) delete despues[k];
    await registrar(req, { idEmpleado, tipo: tipoBitacora, antes: null, despues }, transaction);
    return idEmpleado;
};

/** Guarda un precio (con la misma fecha, reemplaza). Regresa el precio anterior que aplicaba. */
const guardarPrecio = async (req, { idEmpleado, precioHora, aPartirDe }, transaction) => {
    const antes = await precioVigente(req, idEmpleado, aPartirDe, transaction);
    await db.empresa(req).query(`
        INSERT INTO empleados_precios (idEmpresa, idEmpleado, precioHora, aPartirDe, idUsuarioCaptura)
        VALUES (:idEmpresa, :idEmpleado, :precioHora, :aPartirDe, :uid)
        ON DUPLICATE KEY UPDATE precioHora = VALUES(precioHora), idUsuarioCaptura = VALUES(idUsuarioCaptura),
                                fechaCaptura = CURRENT_TIMESTAMP`,
    { replacements: { idEmpleado, precioHora, aPartirDe, uid: req.uid ?? null }, type: QueryTypes.INSERT, transaction });
    const { registrar } = require('./bitacoraEmpleados');
    await registrar(req, {
        idEmpleado, tipo: 'PRECIO',
        antes: antes ? { precioHora: antes.precioHora.toFixed(2), aPartirDe: antes.aPartirDe } : null,
        despues: { precioHora: Number(precioHora).toFixed(2), aPartirDe }
    }, transaction);
    return antes;
};

/** Precio válido: mayor a cero, con tope razonable, a dos decimales. Regresa el número o lanza Regla. */
const validarPrecio = (v) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
    if (v === null || v === undefined || v === '' || !Number.isFinite(n)) throw new Regla('Escribe el precio por hora');
    if (n <= 0) throw new Regla('El precio por hora debe ser mayor a cero');
    if (n > PRECIO_MAX) throw new Regla(`El precio por hora no puede pasar de ${ PRECIO_MAX.toLocaleString('es-MX', { timeZone: 'UTC' }) }`);
    return Math.round(n * 100) / 100;
};

module.exports = {
    MSG_NO_EXISTE, PRECIO_MAX, CAMPOS_PERSONALES, CAMPOS_EMPLEADO, RE,
    texto, esFecha, llaveNombre, limpiar,
    filtroAlcance, empleadoVisible, siguienteNumero, precioVigente, activosEn, usoDelPlan, permiteAlta, ultimoMarcaje,
    catalogos, validarEmpleado, posiblesDuplicados, crearEmpleado, guardarPrecio, validarPrecio, Regla
};
