// =============================================================================
// Personas → Empleados (análisis 004)
// =============================================================================
// Reglas que aplican a TODO lo de aquí:
// - la empresa sale de la sesión; un empleado de otra empresa, o fuera de las
//   sucursales del usuario (principal U operativa), "no existe";
// - sin empleados_DatosPersonales, CURP, RFC, NSS y fecha de nacimiento no
//   viajan en la respuesta ni se sobrescriben; sin empleados_Precio, tampoco
//   el precio por hora;
// - el empleado nunca se borra: se da de baja y se reingresa.
// La alta masiva (Excel) está en controllers/empleadosImportacion.js.
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const { hoy } = require('../helpers/fechas');
const archivos = require('../helpers/archivos');
const { registrar } = require('../helpers/bitacoraEmpleados');
const diasProgramados = require('../helpers/diasProgramados');
const { leerPlantilla, resumen } = require('../helpers/horarios');
const {
    MSG_NO_EXISTE, CAMPOS_PERSONALES, Regla, esFecha, texto, limpiar,
    filtroAlcance, empleadoVisible, siguienteNumero, precioVigente, activosEn, permiteAlta, ultimoMarcaje,
    catalogos, validarEmpleado, posiblesDuplicados, crearEmpleado, guardarPrecio, validarPrecio
} = require('../helpers/empleados');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(donde, error);
    return res.json({ status_code: 2, message, data: null });
};

const puede = (req, accion) => !!req.permisos?.acciones?.has(accion);
const nombreCompleto = (e) => [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(' ');

/** Quita lo que el usuario no puede ver. `foto` (nombre del archivo) nunca viaja. */
const publico = (req, e) => {
    const { foto, zonaHoraria, ...resto } = e;
    const out = { ...resto, nombreCompleto: nombreCompleto(e), bFoto: !!foto, zonaHoraria };
    if (!puede(req, 'empleados_DatosPersonales')) for (const k of CAMPOS_PERSONALES) delete out[k];
    return out;
};

// ── Consultas ────────────────────────────────────────────────────────────────

const ESTADOS = { activos: 'ACTIVO', baja: 'BAJA' };

/**
 * GET /api/empleados/getEmpleados?q=&idSucursal=&idPuesto=&idDepartamento=&estado=activos|baja|todos&pagina=&porPagina=
 * { total, pagina, porPagina, filas }. Marca `porReubicar` a quien tiene una sucursal inactiva.
 */
const getEmpleados = async (req, res) => {
    try {
        const porPagina = Math.min(Math.max(Number(req.query.porPagina) || 25, 5), 100);
        const pagina = Math.max(Number(req.query.pagina) || 1, 1);
        const estado = req.query.estado === 'todos' ? null : (ESTADOS[req.query.estado] || 'ACTIVO');
        const q = texto(req.query.q, 100);
        const like = q ? `%${ q.replace(/[\\%_]/g, (c) => '\\' + c) }%` : null;
        const f = await filtroAlcance(req, 'e');
        const replacements = {
            ...f.replacements, estado, like,
            idSucursal: Number(req.query.idSucursal) || null,
            idPuesto: Number(req.query.idPuesto) || null,
            idDepartamento: Number(req.query.idDepartamento) || null
        };
        const filtros = `
               AND ${ f.sql }
               AND (:estado IS NULL OR e.estado = :estado)
               AND (:idSucursal IS NULL OR e.idSucursalPrincipal = :idSucursal OR e.idSucursalOperativa = :idSucursal)
               AND (:idPuesto IS NULL OR e.idPuesto = :idPuesto)
               AND (:idDepartamento IS NULL OR e.idDepartamento = :idDepartamento)
               AND (:like IS NULL OR e.numeroEmpleado LIKE :like
                    OR CONCAT_WS(' ', e.nombre, e.apellidoPaterno, e.apellidoMaterno) LIKE :like
                    OR CONCAT_WS(' ', e.apellidoPaterno, e.apellidoMaterno, e.nombre) LIKE :like)`;
        const [{ total }] = await db.empresa(req).query(`
            SELECT COUNT(*) AS total FROM empleados e
             WHERE e.idEmpresa = :idEmpresa ${ filtros }`, { replacements });
        const filas = await db.empresa(req).query(`
            SELECT e.idEmpleado, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno, e.estado,
                   e.fechaIngreso, e.fechaBaja,
                   e.idSucursalPrincipal, sp.nombre AS sucursalPrincipal, sp.zonaHoraria, sp.bActivo AS principalActiva,
                   e.idSucursalOperativa, so.nombre AS sucursalOperativa, so.bActivo AS operativaActiva,
                   e.idPuesto, p.nombre AS puesto, e.idDepartamento, d.nombre AS departamento,
                   (e.foto IS NOT NULL) AS bFoto
              FROM empleados e
              JOIN sucursales sp ON sp.idEmpresa = e.idEmpresa AND sp.idSucursal = e.idSucursalPrincipal
              JOIN sucursales so ON so.idEmpresa = e.idEmpresa AND so.idSucursal = e.idSucursalOperativa
              LEFT JOIN puestos p ON p.idEmpresa = e.idEmpresa AND p.idPuesto = e.idPuesto
              LEFT JOIN departamentos d ON d.idEmpresa = e.idEmpresa AND d.idDepartamento = e.idDepartamento
             WHERE e.idEmpresa = :idEmpresa ${ filtros }
             ORDER BY e.apellidoPaterno, e.apellidoMaterno, e.nombre, e.idEmpleado
             LIMIT ${ porPagina } OFFSET ${ (pagina - 1) * porPagina }`, { replacements });
        const data = filas.map(x => ({
            ...x, nombreCompleto: nombreCompleto(x), bFoto: !!x.bFoto,
            principalActiva: !!x.principalActiva, operativaActiva: !!x.operativaActiva,
            porReubicar: !x.principalActiva || !x.operativaActiva
        }));
        return ok(res, `${ total } empleado(s)`, { total: Number(total), pagina, porPagina, filas: data });
    } catch (error) {
        return falla(res, 'getEmpleados', error, 'No fue posible consultar los empleados');
    }
};

/** GET /api/empleados/getEmpleado?idEmpleado= — la ficha completa con sus periodos. */
const getEmpleado = async (req, res) => {
    try {
        const e = await empleadoVisible(req, req.query.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        const [extra] = await db.empresa(req).query(`
            SELECT sp.nombre AS sucursalPrincipal, sp.bActivo AS principalActiva,
                   so.nombre AS sucursalOperativa, so.bActivo AS operativaActiva, so.zonaHoraria AS zonaOperativa,
                   p.nombre AS puesto, d.nombre AS departamento, u.nombre AS usuarioNombre, u.correo AS usuarioCorreo
              FROM empleados e
              JOIN sucursales sp ON sp.idEmpresa = e.idEmpresa AND sp.idSucursal = e.idSucursalPrincipal
              JOIN sucursales so ON so.idEmpresa = e.idEmpresa AND so.idSucursal = e.idSucursalOperativa
              LEFT JOIN puestos p ON p.idEmpresa = e.idEmpresa AND p.idPuesto = e.idPuesto
              LEFT JOIN departamentos d ON d.idEmpresa = e.idEmpresa AND d.idDepartamento = e.idDepartamento
              LEFT JOIN usuarios u ON u.idUsuario = e.idUsuario
             WHERE e.idEmpresa = :idEmpresa AND e.idEmpleado = :id`, { replacements: { id: e.idEmpleado } });
        const periodos = await db.empresa(req).query(`
            SELECT idPeriodo, fechaIngreso, fechaBaja, motivoBaja
              FROM empleados_periodos
             WHERE idEmpresa = :idEmpresa AND idEmpleado = :id
             ORDER BY fechaIngreso DESC`, { replacements: { id: e.idEmpleado } });
        const data = {
            ...publico(req, e), ...extra,
            principalActiva: !!extra.principalActiva, operativaActiva: !!extra.operativaActiva,
            porReubicar: !extra.principalActiva || !extra.operativaActiva,
            hoy: hoy(e.zonaHoraria),
            periodos
        };
        if (puede(req, 'empleados_Precio')) data.precioVigente = await precioVigente(req, e.idEmpleado, data.hoy);
        return ok(res, 'Empleado', data);
    } catch (error) {
        return falla(res, 'getEmpleado', error, 'No fue posible consultar el empleado');
    }
};

/** GET /api/empleados/getSiguienteNumero */
const getSiguienteNumero = async (req, res) => {
    try {
        return ok(res, 'Siguiente número', { numeroEmpleado: await siguienteNumero(req) });
    } catch (error) {
        return falla(res, 'getSiguienteNumero', error, 'No fue posible calcular el siguiente número');
    }
};

/**
 * GET /api/empleados/getCatalogosEmpleado — sucursales activas del alcance,
 * puestos y departamentos activos y, con empleados_CreateUpdate, las cuentas
 * de la empresa que todavía no tienen empleado.
 */
const getCatalogosEmpleado = async (req, res) => {
    try {
        const f = await filtroAlcance(req, 's');
        const sucursales = (await db.empresa(req).query(`
            SELECT idSucursal, nombre, zonaHoraria FROM sucursales s
             WHERE s.idEmpresa = :idEmpresa AND s.bActivo = 1
             ORDER BY nombre`)).filter(s => f.alcance.incluye(s.idSucursal));
        const puestos = await db.empresa(req).query(
            'SELECT idPuesto AS id, nombre FROM puestos WHERE idEmpresa = :idEmpresa AND bActivo = 1 ORDER BY nombre');
        const departamentos = await db.empresa(req).query(
            'SELECT idDepartamento AS id, nombre FROM departamentos WHERE idEmpresa = :idEmpresa AND bActivo = 1 ORDER BY nombre');
        const usuarios = puede(req, 'empleados_CreateUpdate') ? await db.empresa(req).query(`
            SELECT ue.idUsuario, u.nombre, u.correo
              FROM usuarios_empresa ue
              JOIN usuarios u ON u.idUsuario = ue.idUsuario
             WHERE ue.idEmpresa = :idEmpresa AND ue.bActivo = 1 AND u.bActivo = 1
               AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.idEmpresa = :idEmpresa AND e.idUsuario = ue.idUsuario)
             ORDER BY u.nombre`) : [];
        return ok(res, 'Catálogos', { sucursales, puestos, departamentos, usuarios });
    } catch (error) {
        return falla(res, 'getCatalogosEmpleado', error, 'No fue posible consultar los catálogos');
    }
};

/** GET /api/empleados/getEmpleadosActivosEn?fecha=AAAA-MM-DD — de las sucursales del usuario. */
const getEmpleadosActivosEn = async (req, res) => {
    const fecha = String(req.query.fecha || '');
    try {
        if (!esFecha(fecha)) return no(res, 'La fecha no es válida (AAAA-MM-DD)');
        const f = await filtroAlcance(req, 'e');
        return ok(res, 'Empleados activos', { fecha, activos: await activosEn(req, fecha, f) });
    } catch (error) {
        return falla(res, 'getEmpleadosActivosEn', error, 'No fue posible contar los empleados activos');
    }
};

// ── Alta y edición ───────────────────────────────────────────────────────────

const EDITABLES = ['numeroEmpleado', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'idSucursalPrincipal',
    'idSucursalOperativa', 'idPuesto', 'idDepartamento', 'telefono', 'correo', 'curp', 'rfc', 'nss',
    'fechaNacimiento', 'idUsuario'];

/**
 * POST /api/empleados/insertUpdateEmpleado
 * Alta rápida: numeroEmpleado (vacío = el siguiente), nombre, apellidoPaterno,
 * idSucursalPrincipal y fechaIngreso. La operativa arranca igual a la principal.
 * En el alta, un posible duplicado responde data.codigo = 'POSIBLE_DUPLICADO'
 * y se guarda al reenviar con confirmarDuplicado: true.
 * Cambiar la principal regresa data.avisoHorario; la operativa no avisa nada.
 *
 * Horarios (análisis 006):
 * - el alta copia la plantilla de su sucursal principal a su horario y genera
 *   sus días programados;
 * - cambiar la sucursal principal exige `horarioAlCambiarSucursal:
 *   'conservar' | 'tomar'`; sin él responde data.codigo = 'CONFIRMAR_HORARIO'
 *   (nada se guarda). En los dos casos los días futuros que no se cambiaron a
 *   mano pasan a la sucursal nueva; con 'tomar' el horario no se toca todavía
 *   y la respuesta trae data.plantillaNueva para cargarla en la pestaña
 *   Horario (se guarda con horarios/setHorarioEmpleado);
 * - cambiar la operativa no toca horario ni días.
 */
const insertUpdateEmpleado = async (req, res) => {
    const idEmpleado = Number(req.body.idEmpleado) || null;
    const confirmarDuplicado = req.body.confirmarDuplicado === true;
    const entrada = limpiar(req.body);
    if (!puede(req, 'empleados_DatosPersonales')) for (const k of CAMPOS_PERSONALES) delete entrada[k];
    try {
        const resultado = await db.transaccion(async (t) => {
            const cat = await catalogos(req, t);
            const actual = idEmpleado ? await empleadoVisible(req, idEmpleado, { transaction: t, bloquear: true }) : null;
            if (idEmpleado && !actual) throw new Regla(MSG_NO_EXISTE);

            const d = {};
            for (const k of EDITABLES) d[k] = k in entrada ? entrada[k] : (actual ? actual[k] : null);
            if (!actual) {
                d.fechaIngreso = entrada.fechaIngreso ?? null;
                if (!d.numeroEmpleado) d.numeroEmpleado = await siguienteNumero(req, t);
                if (!d.idSucursalOperativa) d.idSucursalOperativa = d.idSucursalPrincipal;
            }

            const errores = await validarEmpleado(req, d, { actual, cat }, t);
            if (errores.length) throw new Regla(errores[0], { errores });

            if (!actual) {
                const plan = await permiteAlta(req, 1);
                if (!plan.ok) throw new Regla(plan.mensaje, { codigo: 'LIMITE_PLAN' });
                if (!confirmarDuplicado) {
                    const dup = await posiblesDuplicados(req, d, t);
                    if (dup.visibles.length || dup.fuera) {
                        const n = dup.visibles.length + dup.fuera;
                        throw new Regla(n === 1 ? 'Ya existe un empleado con el mismo nombre o CURP. ¿Es la misma persona?'
                            : `Ya existen ${ n } empleados con el mismo nombre o CURP. ¿Es alguna de estas personas?`,
                        { codigo: 'POSIBLE_DUPLICADO', parecidos: dup.visibles, fueraDeAlcance: dup.fuera });
                    }
                }
                const id = await crearEmpleado(req, d, 'ALTA', t);
                await diasProgramados.prepararIngreso(req, id, d.fechaIngreso, t, { copiarPlantilla: true });
                return { message: `Empleado ${ d.numeroEmpleado } dado de alta`, data: { id, numeroEmpleado: d.numeroEmpleado } };
            }

            // Análisis 006: cambiar la principal pregunta qué pasa con su horario.
            const cambioPrincipal = actual.idSucursalPrincipal !== d.idSucursalPrincipal;
            const nombreSuc = (id) => cat.sucursales.get(id)?.nombre ?? null;
            const horarioAlCambiar = ['conservar', 'tomar'].includes(req.body.horarioAlCambiarSucursal)
                ? req.body.horarioAlCambiarSucursal : null;
            if (cambioPrincipal && !horarioAlCambiar) {
                throw new Regla(`Vas a cambiar la sucursal principal de ${ nombreSuc(actual.idSucursalPrincipal) } a ${ nombreSuc(d.idSucursalPrincipal) }. `
                    + '¿Conserva su horario o toma el de la nueva sucursal?', {
                    codigo: 'CONFIRMAR_HORARIO',
                    idSucursalAnterior: actual.idSucursalPrincipal, sucursalAnterior: nombreSuc(actual.idSucursalPrincipal),
                    idSucursalNueva: d.idSucursalPrincipal, sucursalNueva: nombreSuc(d.idSucursalPrincipal)
                });
            }

            await db.empresa(req).query(`
                UPDATE empleados
                   SET numeroEmpleado = :numeroEmpleado, nombre = :nombre, apellidoPaterno = :apellidoPaterno,
                       apellidoMaterno = :apellidoMaterno, idSucursalPrincipal = :idSucursalPrincipal,
                       idSucursalOperativa = :idSucursalOperativa, idPuesto = :idPuesto, idDepartamento = :idDepartamento,
                       telefono = :telefono, correo = :correo, curp = :curp, rfc = :rfc, nss = :nss,
                       fechaNacimiento = :fechaNacimiento, idUsuario = :idUsuario
                 WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`,
            { replacements: { ...d, idEmpleado }, type: QueryTypes.UPDATE, transaction: t });

            // Los días futuros no manuales pasan a la sucursal nueva (desde hoy en la zona de la anterior).
            let plantillaNueva = null;
            if (cambioPrincipal) {
                await diasProgramados.cambiarSucursal(req, idEmpleado, d.idSucursalPrincipal, hoy(actual.zonaHoraria), t);
                if (horarioAlCambiar === 'tomar') plantillaNueva = await resumen(req, await leerPlantilla(req, d.idSucursalPrincipal, t));
            }

            // Bitácora: cada sucursal con su tipo; lo demás como edición.
            for (const [k, tipo] of [['idSucursalPrincipal', 'SUCURSAL_PRINCIPAL'], ['idSucursalOperativa', 'SUCURSAL_OPERATIVA']]) {
                if (actual[k] === d[k]) continue;
                await registrar(req, { idEmpleado, tipo,
                    antes: { idSucursal: actual[k], sucursal: nombreSuc(actual[k]) },
                    despues: { idSucursal: d[k], sucursal: nombreSuc(d[k]) } }, t);
            }
            const antes = {}, despues = {};
            for (const k of EDITABLES.filter(x => x !== 'idSucursalPrincipal' && x !== 'idSucursalOperativa')) {
                antes[k] = actual[k]; despues[k] = d[k];
            }
            await registrar(req, { idEmpleado, tipo: 'EDICION', antes, despues }, t);

            return {
                message: 'Empleado actualizado correctamente',
                data: {
                    id: idEmpleado, numeroEmpleado: d.numeroEmpleado,
                    avisoHorario: cambioPrincipal
                        ? `Cambió la sucursal principal a ${ nombreSuc(d.idSucursalPrincipal) }. El horario y los festivos que le aplican pueden cambiar: revísalos en Horarios.`
                        : null,
                    horarioAlCambiarSucursal: cambioPrincipal ? horarioAlCambiar : null,
                    plantillaNueva
                }
            };
        });
        return ok(res, resultado.message, resultado.data);
    } catch (error) {
        if (error?.original?.errno === 1062) return no(res, 'El número de empleado o la cuenta ligada ya son de otro empleado');
        return falla(res, 'insertUpdateEmpleado', error, 'No fue posible guardar el empleado');
    }
};

// ── Precio por hora ──────────────────────────────────────────────────────────

/** GET /api/empleados/getPreciosEmpleado?idEmpleado= — historial con quién y cuándo. */
const getPreciosEmpleado = async (req, res) => {
    try {
        const e = await empleadoVisible(req, req.query.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        const historial = (await db.empresa(req).query(`
            SELECT p.idPrecio, p.precioHora, p.aPartirDe, p.fechaCaptura, u.nombre AS capturo
              FROM empleados_precios p
              LEFT JOIN usuarios u ON u.idUsuario = p.idUsuarioCaptura
             WHERE p.idEmpresa = :idEmpresa AND p.idEmpleado = :id
             ORDER BY p.aPartirDe DESC`, { replacements: { id: e.idEmpleado } }))
            .map(p => ({ ...p, precioHora: Number(p.precioHora) }));
        const fechaHoy = hoy(e.zonaHoraria);
        return ok(res, `${ historial.length } precio(s)`, {
            hoy: fechaHoy, zonaHoraria: e.zonaHoraria,
            vigente: await precioVigente(req, e.idEmpleado, fechaHoy), historial
        });
    } catch (error) {
        return falla(res, 'getPreciosEmpleado', error, 'No fue posible consultar el precio por hora');
    }
};

/** POST /api/empleados/setPrecioEmpleado { idEmpleado, precioHora, aPartirDe } — con la misma fecha, reemplaza. */
const setPrecioEmpleado = async (req, res) => {
    const aPartirDe = String(req.body.aPartirDe || '');
    try {
        const precioHora = validarPrecio(req.body.precioHora);
        if (!esFecha(aPartirDe)) return no(res, 'La fecha "a partir de" no es válida (AAAA-MM-DD)');
        const antes = await db.transaccion(async (t) => {
            const e = await empleadoVisible(req, req.body.idEmpleado, { transaction: t, bloquear: true });
            if (!e) throw new Regla(MSG_NO_EXISTE);
            const anterior = await guardarPrecio(req, { idEmpleado: e.idEmpleado, precioHora, aPartirDe }, t);
            // Análisis 006: los días ya generados llevan el precio vigente de cada día.
            await diasProgramados.actualizarPrecio(req, e.idEmpleado, aPartirDe, t);
            return anterior;
        });
        return ok(res, `Precio por hora guardado: $${ precioHora.toFixed(2) } a partir del ${ aPartirDe }`,
            { precioHora, aPartirDe, anterior: antes });
    } catch (error) {
        return falla(res, 'setPrecioEmpleado', error, 'No fue posible guardar el precio por hora');
    }
};

// ── Baja y reingreso ─────────────────────────────────────────────────────────

/**
 * POST /api/empleados/bajaEmpleado { idEmpleado, fechaBaja, motivoBaja }
 * Cierra el periodo abierto. La fecha no puede ser anterior al ingreso de ese
 * periodo ni posterior a hoy en la zona de su sucursal principal. Con un
 * marcaje posterior a la fecha exige empleados_BajaRetroactiva. Nunca borra.
 */
const bajaEmpleado = async (req, res) => {
    const fechaBaja = String(req.body.fechaBaja || '');
    const motivoBaja = texto(req.body.motivoBaja, 250);
    try {
        if (!esFecha(fechaBaja)) return no(res, 'La fecha de baja no es válida (AAAA-MM-DD)');
        if (!motivoBaja) return no(res, 'Escribe el motivo de la baja');
        if (motivoBaja.length > 250) return no(res, 'El motivo admite hasta 250 caracteres');
        const e = await db.transaccion(async (t) => {
            const emp = await empleadoVisible(req, req.body.idEmpleado, { transaction: t, bloquear: true });
            if (!emp) throw new Regla(MSG_NO_EXISTE);
            if (emp.estado === 'BAJA') throw new Regla(`${ emp.nombre } ya está dado de baja desde el ${ emp.fechaBaja }`);
            const [periodo] = await db.empresa(req).query(`
                SELECT idPeriodo, fechaIngreso FROM empleados_periodos
                 WHERE idEmpresa = :idEmpresa AND idEmpleado = :id AND fechaBaja IS NULL
                 ORDER BY fechaIngreso DESC LIMIT 1 FOR UPDATE`, { replacements: { id: emp.idEmpleado }, transaction: t });
            if (!periodo) throw new Regla('El empleado no tiene un periodo laboral abierto');
            if (fechaBaja < periodo.fechaIngreso) throw new Regla(`La baja no puede ser anterior a su ingreso (${ periodo.fechaIngreso })`);
            const fechaHoy = hoy(emp.zonaHoraria);
            if (fechaBaja > fechaHoy) throw new Regla(`La baja no puede ser posterior a hoy (${ fechaHoy })`);
            const marcaje = await ultimoMarcaje(req, emp.idEmpleado);
            if (marcaje && fechaBaja < marcaje.fecha && !puede(req, 'empleados_BajaRetroactiva')) {
                throw new Regla(`Tiene un marcaje el ${ marcaje.fecha }, posterior a la fecha de baja. Hace falta el permiso de baja retroactiva.`,
                    { codigo: 'BAJA_RETROACTIVA', ultimoMarcaje: marcaje.fecha });
            }
            await db.empresa(req).query(`
                UPDATE empleados_periodos SET fechaBaja = :fechaBaja, motivoBaja = :motivoBaja
                 WHERE idEmpresa = :idEmpresa AND idPeriodo = :idPeriodo`,
            { replacements: { fechaBaja, motivoBaja, idPeriodo: periodo.idPeriodo }, type: QueryTypes.UPDATE, transaction: t });
            await db.empresa(req).query(`
                UPDATE empleados SET estado = 'BAJA', fechaBaja = :fechaBaja, motivoBaja = :motivoBaja
                 WHERE idEmpresa = :idEmpresa AND idEmpleado = :id`,
            { replacements: { fechaBaja, motivoBaja, id: emp.idEmpleado }, type: QueryTypes.UPDATE, transaction: t });
            await registrar(req, { idEmpleado: emp.idEmpleado, tipo: 'BAJA',
                antes: { estado: 'ACTIVO', fechaIngreso: periodo.fechaIngreso },
                despues: { estado: 'BAJA', fechaBaja, motivoBaja } }, t);
            // Análisis 006: sin días programados después de la baja.
            await diasProgramados.eliminarPosteriores(req, emp.idEmpleado, fechaBaja, t);
            return emp;
        });
        return ok(res, `${ nombreCompleto(e) } quedó dado de baja con fecha ${ fechaBaja }`, { id: e.idEmpleado });
    } catch (error) {
        return falla(res, 'bajaEmpleado', error, 'No fue posible dar de baja al empleado');
    }
};

/**
 * POST /api/empleados/reingresoEmpleado { idEmpleado, fechaIngreso }
 * Abre un periodo nuevo, posterior a la última baja. Conserva número, datos e historial.
 */
const reingresoEmpleado = async (req, res) => {
    const fechaIngreso = String(req.body.fechaIngreso || '');
    try {
        if (!esFecha(fechaIngreso)) return no(res, 'La fecha de reingreso no es válida (AAAA-MM-DD)');
        const e = await db.transaccion(async (t) => {
            const emp = await empleadoVisible(req, req.body.idEmpleado, { transaction: t, bloquear: true });
            if (!emp) throw new Regla(MSG_NO_EXISTE);
            if (emp.estado !== 'BAJA') throw new Regla(`${ emp.nombre } está activo; no hay nada que reingresar`);
            const [ultima] = await db.empresa(req).query(`
                SELECT MAX(fechaBaja) AS fechaBaja FROM empleados_periodos
                 WHERE idEmpresa = :idEmpresa AND idEmpleado = :id`, { replacements: { id: emp.idEmpleado }, transaction: t });
            if (ultima?.fechaBaja && fechaIngreso <= ultima.fechaBaja) {
                throw new Regla(`El reingreso debe ser posterior a su última baja (${ ultima.fechaBaja })`);
            }
            const plan = await permiteAlta(req, 1);
            if (!plan.ok) throw new Regla(plan.mensaje, { codigo: 'LIMITE_PLAN' });
            await db.empresa(req).query(`
                INSERT INTO empleados_periodos (idEmpresa, idEmpleado, fechaIngreso)
                VALUES (:idEmpresa, :id, :fechaIngreso)`,
            { replacements: { id: emp.idEmpleado, fechaIngreso }, type: QueryTypes.INSERT, transaction: t });
            await db.empresa(req).query(`
                UPDATE empleados SET estado = 'ACTIVO', fechaIngreso = :fechaIngreso, fechaBaja = NULL, motivoBaja = NULL
                 WHERE idEmpresa = :idEmpresa AND idEmpleado = :id`,
            { replacements: { id: emp.idEmpleado, fechaIngreso }, type: QueryTypes.UPDATE, transaction: t });
            await registrar(req, { idEmpleado: emp.idEmpleado, tipo: 'REINGRESO',
                antes: { estado: 'BAJA', fechaBaja: emp.fechaBaja, motivoBaja: emp.motivoBaja },
                despues: { estado: 'ACTIVO', fechaIngreso } }, t);
            // Análisis 006: sus días se generan desde la fecha nueva (con el horario que conserva).
            await diasProgramados.prepararIngreso(req, emp.idEmpleado, fechaIngreso, t);
            return emp;
        });
        return ok(res, `${ nombreCompleto(e) } reingresó con fecha ${ fechaIngreso }`, { id: e.idEmpleado });
    } catch (error) {
        return falla(res, 'reingresoEmpleado', error, 'No fue posible reingresar al empleado');
    }
};

// ── Foto ─────────────────────────────────────────────────────────────────────

/** POST /api/empleados/setFotoEmpleado (multipart: archivo + idEmpleado) */
const setFotoEmpleado = async (req, res) => {
    let nueva = null;
    try {
        const e = await empleadoVisible(req, req.body.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        nueva = await archivos.guardar(req, 'empleados', req.archivo.buffer, req.archivo.ext);
        await db.transaccion(async (t) => {
            await db.empresa(req).query(
                'UPDATE empleados SET foto = :foto WHERE idEmpresa = :idEmpresa AND idEmpleado = :id',
                { replacements: { foto: nueva, id: e.idEmpleado }, type: QueryTypes.UPDATE, transaction: t });
            await registrar(req, { idEmpleado: e.idEmpleado, tipo: 'EDICION',
                antes: { foto: e.foto ? 'con foto' : null }, despues: { foto: e.foto ? 'foto cambiada' : 'con foto' } }, t);
        });
        await archivos.borrar(req, 'empleados', e.foto);
        return ok(res, e.foto ? 'Foto cambiada' : 'Foto guardada', { id: e.idEmpleado });
    } catch (error) {
        if (nueva) await archivos.borrar(req, 'empleados', nueva);
        return falla(res, 'setFotoEmpleado', error, 'No fue posible guardar la foto');
    }
};

/** DELETE /api/empleados/deleteFotoEmpleado?idEmpleado= */
const deleteFotoEmpleado = async (req, res) => {
    try {
        const e = await empleadoVisible(req, req.query.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        if (!e.foto) return ok(res, 'El empleado no tenía foto', { id: e.idEmpleado });
        await db.transaccion(async (t) => {
            await db.empresa(req).query(
                'UPDATE empleados SET foto = NULL WHERE idEmpresa = :idEmpresa AND idEmpleado = :id',
                { replacements: { id: e.idEmpleado }, type: QueryTypes.UPDATE, transaction: t });
            await registrar(req, { idEmpleado: e.idEmpleado, tipo: 'EDICION', antes: { foto: 'con foto' }, despues: { foto: null } }, t);
        });
        await archivos.borrar(req, 'empleados', e.foto);
        return ok(res, 'Foto quitada', { id: e.idEmpleado });
    } catch (error) {
        return falla(res, 'deleteFotoEmpleado', error, 'No fue posible quitar la foto');
    }
};

/**
 * GET /api/empleados/getFotoEmpleado?idEmpleado= — la imagen (binario), solo
 * con sesión, de la empresa y del alcance. Sin foto o sin acceso: JSON
 * { status_code: 1 } como cualquier error.
 */
const getFotoEmpleado = async (req, res) => {
    try {
        const e = await empleadoVisible(req, req.query.idEmpleado);
        if (!e) return no(res, MSG_NO_EXISTE);
        if (!e.foto) return no(res, 'El empleado no tiene foto');
        const archivo = await archivos.leer(req, 'empleados', e.foto);
        if (!archivo) return no(res, 'El empleado no tiene foto');
        res.set({ 'Content-Type': archivo.mime, 'Cache-Control': 'private, max-age=300' });
        return res.send(archivo.buffer);
    } catch (error) {
        return falla(res, 'getFotoEmpleado', error, 'No fue posible consultar la foto');
    }
};

module.exports = {
    getEmpleados, getEmpleado, getSiguienteNumero, getCatalogosEmpleado, getEmpleadosActivosEn,
    insertUpdateEmpleado, getPreciosEmpleado, setPrecioEmpleado, bajaEmpleado, reingresoEmpleado,
    setFotoEmpleado, deleteFotoEmpleado, getFotoEmpleado
};
