// =============================================================================
// Panel → Empresas (análisis 009, T14 a T18 y T20)
// =============================================================================
// /api/panel/empresas, todo con validarPanel. El panel escoge la empresa
// (idEmpresa del body o del query): es la excepción única a LP-1, por eso
// cada consulta a una tabla de empresa dice por qué con `/* panel: … */` y
// toda escritura deja historial y bitácora del producto en su transacción.
// =============================================================================

const { DateTime } = require('luxon');
const { db, QueryTypes } = require('../../helpers/db');
const { Regla } = require('../../helpers/permisosEdicion');
const { invalidarEmpresa } = require('../../helpers/userActions');
const empresaAlta = require('../../helpers/empresaAlta');
const bitacoraProducto = require('../../helpers/panel/bitacoraProducto');
const exportacion = require('../../helpers/panel/exportacionEmpresa');
const constantes = require('../../helpers/constantes');
const fechas = require('../../helpers/fechas');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(`panel/${ donde }`, error);
    return res.json({ status_code: 2, message, data: null });
};

const MSG_NO_EXISTE = 'La empresa no existe';
const ESTADOS = ['ACTIVA', 'SUSPENDIDA', 'EN_BAJA', 'ELIMINADA'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const texto = (v, max) => {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    return s ? s.slice(0, max) : null;
};
const motivoDe = (v) => {
    const m = texto(v, 501);
    if (!m) throw new Regla('Escribe el motivo');
    if (m.length > 500) throw new Regla('El motivo admite hasta 500 caracteres');
    return m;
};
const precioDe = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 9999999999.99) throw new Regla('El precio especial debe ser un número mayor o igual a 0');
    return Math.round(n * 100) / 100;
};
const fechaValida = (s) => RE_FECHA.test(String(s)) && DateTime.fromFormat(String(s), 'yyyy-MM-dd', { zone: 'utc' }).isValid;
const dinero = (v) => (v === null || v === undefined ? null : Number(v));

/** La empresa (con bloqueo si se va a escribir), o lanza "no existe". */
const empresaDe = async (req, idEmpresa, transaction, bloquear = false) => {
    const id = idValido(idEmpresa);
    if (!id) throw new Regla(MSG_NO_EXISTE);
    const [e] = await db.panel(req).query(`
        SELECT /* panel: la empresa que escogió el superadministrador */
               idEmpresa, nombreComercial, razonSocial, rfc, estado, motivoEstado, fechaEstado,
               fechaBajaProgramada, fechaEliminacion, fechaAlta
          FROM empresas WHERE idEmpresa = :id ${ bloquear ? 'FOR UPDATE' : '' }`,
    { replacements: { id }, transaction });
    if (!e) throw new Regla(MSG_NO_EXISTE);
    return e;
};

const noEliminada = (e) => {
    if (e.estado === 'ELIMINADA') throw new Regla(`La empresa ${ e.nombreComercial } fue eliminada: ya no se puede cambiar`);
};

/** Otra empresa (no eliminada) con el mismo nombre comercial. */
const nombreOcupado = async (req, nombre, idExcepto, transaction) => {
    const [x] = await db.panel(req).query(`
        SELECT /* panel: el nombre comercial no se repite entre empresas */ idEmpresa
          FROM empresas
         WHERE nombreComercial = :nombre AND estado <> 'ELIMINADA' AND idEmpresa <> :idExcepto
         LIMIT 1`, { replacements: { nombre, idExcepto: idExcepto || 0 }, transaction });
    return !!x;
};

/** Plan del catálogo, o lanza. `activo` exige que esté activo. */
const planDe = async (req, idPlan, transaction, { activo = true } = {}) => {
    const id = idValido(idPlan);
    const [p] = id ? await db.panel(req).query(`
        SELECT idPlan, nombre, tipoCobro, limiteEmpleados, precio, bActivo FROM cat_planes WHERE idPlan = :id`,
    { replacements: { id }, transaction }) : [];
    if (!p) throw new Regla('El plan no existe');
    if (activo && !p.bActivo) throw new Regla(`El plan ${ p.nombre } está desactivado`);
    return { ...p, limiteEmpleados: p.limiteEmpleados === null ? null : Number(p.limiteEmpleados), precio: Number(p.precio) };
};

/** Empleados activos de una empresa (lo mismo que cuenta el conteo diario). */
const activosDe = async (req, idEmpresa, transaction) => {
    const [r] = await db.panel(req).query(`
        SELECT /* panel: empleados activos de una empresa para revisar el límite de su plan */ COUNT(*) AS n
          FROM empleados WHERE idEmpresa = :idEmpresa AND estado = 'ACTIVO'`,
    { replacements: { idEmpresa }, transaction });
    return Number(r.n);
};

const historial = (req, idEmpresa, { tipo, detalle = null, motivo = null }, transaction) => db.panel(req).query(`
    INSERT INTO empresas_historial (idEmpresa, tipo, detalle, motivo, idSuperadmin)
    VALUES (:idEmpresa, :tipo, :detalle, :motivo, :idSuperadmin) /* panel: historial de la empresa */`, {
    replacements: { idEmpresa, tipo, detalle: detalle ? String(detalle).slice(0, 1000) : null, motivo, idSuperadmin: req.idSuperadmin },
    type: QueryTypes.INSERT, transaction
});

// ── Consultas (T14) ──────────────────────────────────────────────────────────

/**
 * GET /api/panel/empresas/getEmpresas?q=&estado=&idPlan=
 * data: [{ idEmpresa, nombreComercial, razonSocial, rfc, estado, motivoEstado, fechaEstado, fechaAlta,
 *          idPlan, plan, tipoCobro, limiteEmpleados, precioEspecial, empleadosActivos, usuarios, ultimoAcceso }]
 */
const getEmpresas = async (req, res) => {
    try {
        const q = texto(req.query.q, 100);
        const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : null;
        const idPlan = idValido(req.query.idPlan);
        const filas = await db.panel(req).query(`
            SELECT /* panel: lista de todas las empresas con su plan y su uso */
                   e.idEmpresa, e.nombreComercial, e.razonSocial, e.rfc, e.estado, e.motivoEstado, e.fechaEstado, e.fechaAlta,
                   ep.idPlan, p.nombre AS plan, p.tipoCobro, p.limiteEmpleados, ep.precioEspecial,
                   (SELECT COUNT(*) FROM empleados x WHERE x.idEmpresa = e.idEmpresa AND x.estado = 'ACTIVO') AS empleadosActivos,
                   (SELECT COUNT(*) FROM usuarios_empresa ue WHERE ue.idEmpresa = e.idEmpresa AND ue.bActivo = 1) AS usuarios,
                   (SELECT MAX(b.fecha) FROM bitacora_sesiones b WHERE b.idEmpresa = e.idEmpresa AND b.resultado = 'OK') AS ultimoAcceso
              FROM empresas e
              LEFT JOIN empresas_planes ep ON ep.idEmpresa = e.idEmpresa AND ep.vigente = 1
              LEFT JOIN cat_planes p ON p.idPlan = ep.idPlan
             WHERE (:estado IS NULL OR e.estado = :estado)
               AND (:idPlan IS NULL OR ep.idPlan = :idPlan)
               AND (:like IS NULL OR e.nombreComercial LIKE :like OR e.razonSocial LIKE :like OR e.rfc LIKE :like)
             ORDER BY e.nombreComercial, e.idEmpresa`, {
            replacements: { estado, idPlan, like: q ? `%${ q.replace(/[\\%_]/g, (c) => '\\' + c) }%` : null }
        });
        return ok(res, `${ filas.length } empresa(s)`, filas.map(f => ({
            ...f,
            limiteEmpleados: f.limiteEmpleados === null ? null : Number(f.limiteEmpleados),
            precioEspecial: dinero(f.precioEspecial),
            empleadosActivos: Number(f.empleadosActivos),
            usuarios: Number(f.usuarios)
        })));
    } catch (error) {
        return falla(res, 'getEmpresas', error, 'No fue posible consultar las empresas');
    }
};

/**
 * GET /api/panel/empresas/getEmpresaById?idEmpresa=
 * data: { empresa, plan (vigente o null), planes (historial de planes), uso: [{ mes, maximo, dias }] (últimos 12
 *         meses, del más reciente; maximo null si no hubo conteo), historial: [...],
 *         exportaciones: [{ idExportacion, tamano, fecha, superadmin }] }
 */
const getEmpresaById = async (req, res) => {
    try {
        const e = await empresaDe(req, req.query.idEmpresa);
        const idEmpresa = e.idEmpresa;
        const [cuenta] = await db.panel(req).query(`
            SELECT /* panel: ficha de una empresa */
                   (SELECT COUNT(*) FROM empleados x WHERE x.idEmpresa = :idEmpresa AND x.estado = 'ACTIVO') AS empleadosActivos,
                   (SELECT COUNT(*) FROM usuarios_empresa ue WHERE ue.idEmpresa = :idEmpresa AND ue.bActivo = 1) AS usuarios,
                   (SELECT COUNT(*) FROM sucursales s WHERE s.idEmpresa = :idEmpresa AND s.bActivo = 1) AS sucursales,
                   (SELECT MAX(b.fecha) FROM bitacora_sesiones b WHERE b.idEmpresa = :idEmpresa AND b.resultado = 'OK') AS ultimoAcceso`,
        { replacements: { idEmpresa } });

        const planes = (await db.panel(req).query(`
            SELECT /* panel: historial de planes de una empresa */
                   ep.idEmpresaPlan, ep.idPlan, p.nombre AS plan, p.tipoCobro, p.limiteEmpleados, p.precio,
                   ep.precioEspecial, ep.fechaInicio, ep.fechaFin, ep.vigente, ep.fechaRegistro, sa.nombre AS superadmin
              FROM empresas_planes ep
              JOIN cat_planes p ON p.idPlan = ep.idPlan
              LEFT JOIN superadmins sa ON sa.idSuperadmin = ep.idSuperadmin
             WHERE ep.idEmpresa = :idEmpresa
             ORDER BY ep.fechaInicio DESC, ep.idEmpresaPlan DESC`, { replacements: { idEmpresa } }))
            .map(p => ({ ...p, vigente: p.vigente === 1, limiteEmpleados: p.limiteEmpleados === null ? null : Number(p.limiteEmpleados),
                precio: Number(p.precio), precioEspecial: dinero(p.precioEspecial) }));

        const hoy = DateTime.fromFormat(await empresaAlta.hoyProducto(), 'yyyy-MM-dd', { zone: 'utc' });
        const meses = Array.from({ length: 12 }, (_, i) => hoy.minus({ months: i }).toFormat('yyyy-MM'));
        const conteos = await db.panel(req).query(`
            SELECT /* panel: uso por mes de una empresa (máximo del mes) */
                   DATE_FORMAT(fecha, '%Y-%m') AS mes, MAX(empleadosActivos) AS maximo, COUNT(*) AS dias
              FROM empresas_conteo_diario
             WHERE idEmpresa = :idEmpresa AND fecha >= :desde
             GROUP BY DATE_FORMAT(fecha, '%Y-%m')`, { replacements: { idEmpresa, desde: `${ meses[11] }-01` } });
        const porMes = new Map(conteos.map(c => [c.mes, c]));
        const uso = meses.map(mes => ({
            mes,
            maximo: porMes.has(mes) ? Number(porMes.get(mes).maximo) : null,
            dias: porMes.has(mes) ? Number(porMes.get(mes).dias) : 0
        }));

        const hist = await db.panel(req).query(`
            SELECT /* panel: historial de una empresa */
                   h.idHistorial, h.tipo, h.detalle, h.motivo, h.fecha, h.idSuperadmin,
                   COALESCE(sa.nombre, '(script en el servidor)') AS superadmin
              FROM empresas_historial h
              LEFT JOIN superadmins sa ON sa.idSuperadmin = h.idSuperadmin
             WHERE h.idEmpresa = :idEmpresa
             ORDER BY h.fecha DESC, h.idHistorial DESC`, { replacements: { idEmpresa } });

        // 009 T29: exportaciones de la baja (para descargarlas).
        const exportaciones = (await db.panel(req).query(`
            SELECT /* panel: exportaciones de la baja de una empresa */
                   x.idExportacion, x.tamano, x.fecha, COALESCE(sa.nombre, '(script en el servidor)') AS superadmin
              FROM empresas_exportaciones x
              LEFT JOIN superadmins sa ON sa.idSuperadmin = x.idSuperadmin
             WHERE x.idEmpresa = :idEmpresa
             ORDER BY x.fecha DESC, x.idExportacion DESC`, { replacements: { idEmpresa } }))
            .map(x => ({ ...x, tamano: Number(x.tamano) }));

        return ok(res, e.nombreComercial, {
            empresa: { ...e, empleadosActivos: Number(cuenta.empleadosActivos), usuarios: Number(cuenta.usuarios),
                sucursales: Number(cuenta.sucursales), ultimoAcceso: cuenta.ultimoAcceso },
            plan: planes.find(p => p.vigente) || null,
            planes,
            uso,
            historial: hist,
            exportaciones
        });
    } catch (error) {
        return falla(res, 'getEmpresaById', error, 'No fue posible consultar la empresa');
    }
};

/**
 * GET /api/panel/empresas/getCatalogosAlta: lo que llena el modal de alta (catálogos globales).
 * data: { zonas: [{ zona, nombre }], modulos: [{ modulo, nombre, icono }] (los DISPONIBLES, sin los "siempre") }
 */
const getCatalogosAlta = async (req, res) => {
    try {
        const zonas = await db.panel(req).query('SELECT zona, nombre FROM cat_zonas_horarias ORDER BY orden, nombre');
        const modulos = await db.panel(req).query(`
            SELECT modulo, nombre, icono FROM cat_modulos
             WHERE bSiempre = 0 AND estado = 'DISPONIBLE'
             ORDER BY orden`);
        return ok(res, 'Catálogos del alta', { zonas, modulos });
    } catch (error) {
        return falla(res, 'getCatalogosAlta', error, 'No fue posible consultar los catálogos del alta');
    }
};

// ── Alta en un paso (T15) ────────────────────────────────────────────────────

/**
 * POST /api/panel/empresas/insertEmpresa
 * { nombreComercial, razonSocial?, rfc?, sucursal, zonaHoraria, correoAdmin, nombreAdmin?, modulos?: [],
 *   idPlan, precioEspecial? }
 * data: { id, idSucursal, idUsuario, cuentaCreada, passwordProvisional }. La contraseña provisional
 * (solo cuenta nueva) viaja UNA vez, aquí; no se guarda en claro ni en la bitácora.
 */
const insertEmpresa = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const datos = empresaAlta.validarDatosEmpresa(req.body);
            if (await nombreOcupado(req, datos.nombreComercial, null, t)) {
                throw new Regla(`Ya existe una empresa con el nombre comercial ${ datos.nombreComercial }`);
            }
            const plan = await planDe(req, req.body.idPlan, t);
            const precioEspecial = precioDe(req.body.precioEspecial);
            const modulos = Array.isArray(req.body.modulos) ? req.body.modulos : null;
            const alta = await empresaAlta.altaEmpresa({
                ...datos,
                sucursal: req.body.sucursal,
                zonaHoraria: req.body.zonaHoraria,
                correoAdmin: req.body.correoAdmin,
                nombreAdmin: req.body.nombreAdmin,
                modulos,
                idPlan: plan.idPlan,
                precioEspecial,
                idSuperadmin: req.idSuperadmin
            }, t);
            const [mods] = await db.panel(req).query(`
                SELECT /* panel: módulos con los que quedó la empresa nueva */ GROUP_CONCAT(modulo ORDER BY modulo) AS lista
                  FROM empresas_modulos WHERE idEmpresa = :idEmpresa`, { replacements: { idEmpresa: alta.idEmpresa }, transaction: t });
            await bitacoraProducto.registrar(req, {
                accion: 'EMPRESA_ALTA', idEmpresa: alta.idEmpresa, objeto: datos.nombreComercial,
                despues: {
                    ...datos, sucursal: texto(req.body.sucursal, 100), zonaHoraria: req.body.zonaHoraria,
                    administrador: alta.correoAdmin, cuentaCreada: alta.cuentaCreada,
                    modulos: mods?.lista ? mods.lista.split(',') : [], idPlan: plan.idPlan, plan: plan.nombre, precioEspecial
                }
            }, t);
            return alta;
        });
        return ok(res, r.cuentaCreada
            ? `Empresa ${ r.nombreComercial } creada. Entrega al administrador su contraseña provisional: solo se muestra esta vez.`
            : `Empresa ${ r.nombreComercial } creada. ${ r.nombreAdmin } ya tenía cuenta: se le dio acceso y entra con su contraseña de siempre.`,
        { id: r.idEmpresa, idSucursal: r.idSucursal, idUsuario: r.idUsuario, cuentaCreada: r.cuentaCreada,
            passwordProvisional: r.passwordProvisional });
    } catch (error) {
        return falla(res, 'insertEmpresa', error, 'No fue posible dar de alta la empresa');
    }
};

// ── Datos (T16) ──────────────────────────────────────────────────────────────

/** POST /api/panel/empresas/updateEmpresaDatos { idEmpresa, nombreComercial, razonSocial, rfc } → data: { id } */
const updateEmpresaDatos = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const e = await empresaDe(req, req.body.idEmpresa, t, true);
            noEliminada(e);
            const datos = empresaAlta.validarDatosEmpresa(req.body);
            const antes = { nombreComercial: e.nombreComercial, razonSocial: e.razonSocial, rfc: e.rfc };
            if (Object.keys(datos).every(k => (datos[k] ?? null) === (antes[k] ?? null))) return { e, cambio: false };
            if (datos.nombreComercial !== e.nombreComercial && await nombreOcupado(req, datos.nombreComercial, e.idEmpresa, t)) {
                throw new Regla(`Ya existe una empresa con el nombre comercial ${ datos.nombreComercial }`);
            }
            await db.panel(req).query(`
                UPDATE empresas SET nombreComercial = :nombreComercial, razonSocial = :razonSocial, rfc = :rfc
                 WHERE idEmpresa = :idEmpresa /* panel: datos de la empresa */`,
            { replacements: { ...datos, idEmpresa: e.idEmpresa }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'EMPRESA_DATOS', idEmpresa: e.idEmpresa, objeto: datos.nombreComercial, antes, despues: datos }, t);
            return { e, cambio: true };
        });
        return ok(res, r.cambio ? 'Datos de la empresa guardados' : 'Sin cambios que guardar', { id: r.e.idEmpresa });
    } catch (error) {
        return falla(res, 'updateEmpresaDatos', error, 'No fue posible guardar los datos de la empresa');
    }
};

// ── Suspender y reactivar (T17) ──────────────────────────────────────────────
// El login, validarJWT y validarDispositivo ya rechazan lo que no está ACTIVA:
// al suspender, las sesiones abiertas terminan en su siguiente petición.

const cambiarEstado = ({ desde, hacia, tipo, accion, verbo }) => async (req, res) => {
    try {
        const e = await db.transaccion(async (t) => {
            const emp = await empresaDe(req, req.body.idEmpresa, t, true);
            const motivo = motivoDe(req.body.motivo);
            if (emp.estado !== desde) {
                throw new Regla(`La empresa ${ emp.nombreComercial } está ${ emp.estado.replace('_', ' ').toLowerCase() }: solo se puede ${ verbo } una empresa ${ desde.toLowerCase() }`);
            }
            await db.panel(req).query(`
                UPDATE empresas SET estado = :hacia, motivoEstado = :motivo, fechaEstado = :ahora
                 WHERE idEmpresa = :idEmpresa /* panel: suspender o reactivar la empresa */`,
            { replacements: { hacia, motivo, ahora: new Date(), idEmpresa: emp.idEmpresa }, type: QueryTypes.UPDATE, transaction: t });
            await historial(req, emp.idEmpresa, { tipo, motivo }, t);
            await bitacoraProducto.registrar(req, { accion, idEmpresa: emp.idEmpresa, objeto: emp.nombreComercial,
                antes: { estado: desde }, despues: { estado: hacia }, motivo }, t);
            return emp;
        });
        return ok(res, hacia === 'SUSPENDIDA'
            ? `Empresa ${ e.nombreComercial } suspendida: nadie de la empresa entra y sus dispositivos dejan de checar`
            : `Empresa ${ e.nombreComercial } reactivada: todo vuelve a funcionar como estaba`, { id: e.idEmpresa });
    } catch (error) {
        return falla(res, accion, error, `No fue posible ${ verbo } la empresa`);
    }
};

/** POST /api/panel/empresas/suspenderEmpresa { idEmpresa, motivo } → data: { id } */
const suspenderEmpresa = cambiarEstado({ desde: 'ACTIVA', hacia: 'SUSPENDIDA', tipo: 'SUSPENSION', accion: 'EMPRESA_SUSPENSION', verbo: 'suspender' });
/** POST /api/panel/empresas/reactivarEmpresa { idEmpresa, motivo } → data: { id } */
const reactivarEmpresa = cambiarEstado({ desde: 'SUSPENDIDA', hacia: 'ACTIVA', tipo: 'REACTIVACION', accion: 'EMPRESA_REACTIVACION', verbo: 'reactivar' });

// ── Baja definitiva (T29) ────────────────────────────────────────────────────
// iniciarBaja: exportación completa + EN_BAJA + eliminación programada a
// `baja.dias_gracia` días. revertirBaja: dentro del periodo, a SUSPENDIDA. La
// eliminación la hace la tarea diaria (helpers/panel/eliminacionEmpresa.js).
// En EN_BAJA y ELIMINADA nadie entra ni checa (login, validarJWT,
// validarDispositivo), tampoco soporte.

const mismoNombre = (a, b) => String(a ?? '').trim().replace(/\s+/g, ' ') === String(b ?? '').trim().replace(/\s+/g, ' ');

/**
 * POST /api/panel/empresas/iniciarBaja { idEmpresa, nombreConfirmacion, motivo }
 * Solo una empresa ACTIVA o SUSPENDIDA; `nombreConfirmacion` es el nombre comercial escrito igual.
 * data: { id, idExportacion, tamano, fechaBajaProgramada (ISO), diasGracia }
 */
const iniciarBaja = async (req, res) => {
    let generado = null;
    let idEmpresa = null;
    try {
        const previa = await empresaDe(req, req.body.idEmpresa);
        idEmpresa = previa.idEmpresa;
        const motivo = motivoDe(req.body.motivo);
        if (!['ACTIVA', 'SUSPENDIDA'].includes(previa.estado)) {
            throw new Regla(`La empresa ${ previa.nombreComercial } está ${ previa.estado === 'EN_BAJA' ? 'en baja' : 'eliminada' }: no se puede dar de baja otra vez`);
        }
        if (!mismoNombre(req.body.nombreConfirmacion, previa.nombreComercial)) {
            throw new Regla('Escribe el nombre comercial de la empresa exactamente igual para confirmar la baja');
        }
        const dias = await constantes.valor('baja.dias_gracia');
        generado = await exportacion.generarExportacion(req, idEmpresa, { nombreEmpresa: previa.nombreComercial });
        const r = await db.transaccion(async (t) => {
            const e = await empresaDe(req, idEmpresa, t, true);
            if (!['ACTIVA', 'SUSPENDIDA'].includes(e.estado)) throw new Regla(`La empresa ${ e.nombreComercial } ya no está activa ni suspendida`);
            const ahora = fechas.ahora();
            const programada = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);
            const idExportacion = await exportacion.registrarExportacion(req, e.idEmpresa, generado, t);
            await db.panel(req).query(`
                UPDATE empresas SET estado = 'EN_BAJA', motivoEstado = :motivo, fechaEstado = :ahora, fechaBajaProgramada = :programada
                 WHERE idEmpresa = :idEmpresa /* panel: baja definitiva de la empresa (periodo de gracia) */`,
            { replacements: { motivo, ahora, programada, idEmpresa: e.idEmpresa }, type: QueryTypes.UPDATE, transaction: t });
            await historial(req, e.idEmpresa, {
                tipo: 'BAJA', motivo,
                detalle: `Exportación generada (${ generado.tamano } bytes). Eliminación programada para ${ programada.toISOString().slice(0, 10) } (${ dias } días de gracia).`
            }, t);
            await bitacoraProducto.registrar(req, {
                accion: 'EMPRESA_BAJA', idEmpresa: e.idEmpresa, objeto: e.nombreComercial,
                antes: { estado: e.estado }, despues: { estado: 'EN_BAJA', fechaBajaProgramada: programada.toISOString(), idExportacion, tamano: generado.tamano },
                motivo
            }, t);
            return { e, idExportacion, programada };
        });
        return ok(res, `Empresa ${ r.e.nombreComercial } en baja: nadie entra ni checa. Sus datos se eliminan el `
            + `${ r.programada.toISOString().slice(0, 10) } si no se revierte antes. Descarga la exportación para entregarla.`, {
            id: r.e.idEmpresa, idExportacion: r.idExportacion, tamano: generado.tamano,
            fechaBajaProgramada: r.programada.toISOString(), diasGracia: dias
        });
    } catch (error) {
        if (generado && idEmpresa) await exportacion.borrarArchivo(idEmpresa, generado.archivo).catch(() => {});
        return falla(res, 'iniciarBaja', error, 'No fue posible dar de baja la empresa');
    }
};

/** POST /api/panel/empresas/revertirBaja { idEmpresa, motivo } → data: { id }. Solo dentro del periodo de gracia; queda SUSPENDIDA. */
const revertirBaja = async (req, res) => {
    try {
        const e = await db.transaccion(async (t) => {
            const emp = await empresaDe(req, req.body.idEmpresa, t, true);
            const motivo = motivoDe(req.body.motivo);
            if (emp.estado !== 'EN_BAJA') throw new Regla(`La empresa ${ emp.nombreComercial } no está en baja`);
            const ahora = fechas.ahora();
            if (!emp.fechaBajaProgramada || new Date(`${ String(emp.fechaBajaProgramada).replace(' ', 'T') }Z`) <= ahora) {
                throw new Regla(`El periodo de gracia de ${ emp.nombreComercial } ya venció: la baja no se puede revertir`);
            }
            await db.panel(req).query(`
                UPDATE empresas SET estado = 'SUSPENDIDA', motivoEstado = :motivo, fechaEstado = :ahora, fechaBajaProgramada = NULL
                 WHERE idEmpresa = :idEmpresa /* panel: revertir la baja de la empresa */`,
            { replacements: { motivo, ahora, idEmpresa: emp.idEmpresa }, type: QueryTypes.UPDATE, transaction: t });
            await historial(req, emp.idEmpresa, { tipo: 'BAJA_REVERTIDA', motivo, detalle: 'Queda suspendida; para que vuelva a funcionar, reactívala' }, t);
            await bitacoraProducto.registrar(req, { accion: 'EMPRESA_BAJA_REVERTIDA', idEmpresa: emp.idEmpresa, objeto: emp.nombreComercial,
                antes: { estado: 'EN_BAJA', fechaBajaProgramada: emp.fechaBajaProgramada }, despues: { estado: 'SUSPENDIDA' }, motivo }, t);
            return emp;
        });
        return ok(res, `Baja de ${ e.nombreComercial } revertida: queda suspendida hasta que la reactives`, { id: e.idEmpresa });
    } catch (error) {
        return falla(res, 'revertirBaja', error, 'No fue posible revertir la baja');
    }
};

/**
 * GET /api/panel/empresas/descargarExportacion?idEmpresa=&idExportacion=
 * Sin idExportacion, la más reciente. Responde el .xlsx (binario); sus errores son JSON. Queda en la bitácora.
 */
const descargarExportacion = async (req, res) => {
    try {
        const e = await empresaDe(req, req.query.idEmpresa);
        const idExportacion = idValido(req.query.idExportacion);
        const [x] = await db.panel(req).query(`
            SELECT /* panel: exportación de la baja de una empresa */ idExportacion, archivo, tamano, fecha
              FROM empresas_exportaciones
             WHERE idEmpresa = :idEmpresa AND (:idExportacion IS NULL OR idExportacion = :idExportacion)
             ORDER BY fecha DESC, idExportacion DESC LIMIT 1`, { replacements: { idEmpresa: e.idEmpresa, idExportacion } });
        if (!x) return no(res, 'La empresa no tiene esa exportación');
        const ruta = await exportacion.rutaArchivo(e.idEmpresa, x.archivo);
        if (!ruta) return no(res, 'El archivo de la exportación ya no existe');
        await bitacoraProducto.registrar(req, { accion: 'EMPRESA_EXPORTACION_DESCARGA', idEmpresa: e.idEmpresa,
            objeto: String(x.idExportacion), despues: { idExportacion: x.idExportacion, tamano: Number(x.tamano) } });
        const nombre = `exportacion-${ e.idEmpresa }-${ String(x.fecha).slice(0, 10) }.xlsx`;
        res.set('Cache-Control', 'private, no-store');
        return res.download(ruta, nombre);
    } catch (error) {
        return falla(res, 'descargarExportacion', error, 'No fue posible descargar la exportación');
    }
};

// ── Módulos (T18) ────────────────────────────────────────────────────────────

/**
 * GET /api/panel/empresas/getModulosEmpresa?idEmpresa=
 * data: [{ modulo, nombre, icono, disponible, contratado }] (sin los módulos "siempre", como General)
 */
const getModulosEmpresa = async (req, res) => {
    try {
        const e = await empresaDe(req, req.query.idEmpresa);
        const filas = await db.panel(req).query(`
            SELECT /* panel: módulos contratados de una empresa */
                   m.modulo, m.nombre, m.icono, m.estado,
                   EXISTS (SELECT 1 FROM empresas_modulos em WHERE em.idEmpresa = :idEmpresa AND em.modulo = m.modulo) AS contratado
              FROM cat_modulos m
             WHERE m.bSiempre = 0
             ORDER BY m.orden`, { replacements: { idEmpresa: e.idEmpresa } });
        return ok(res, 'Módulos de la empresa', filas.map(f => ({
            modulo: f.modulo, nombre: f.nombre, icono: f.icono, disponible: f.estado === 'DISPONIBLE', contratado: !!Number(f.contratado)
        })));
    } catch (error) {
        return falla(res, 'getModulosEmpresa', error, 'No fue posible consultar los módulos');
    }
};

/**
 * POST /api/panel/empresas/setModulosEmpresa { idEmpresa, modulos: [] } → data: { id, modulos }
 * Quitar un módulo solo oculta sus menús: roles, permisos y datos se conservan.
 */
const setModulosEmpresa = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const e = await empresaDe(req, req.body.idEmpresa, t, true);
            noEliminada(e);
            const cambio = await empresaAlta.guardarModulos(e.idEmpresa, req.body.modulos, t);
            if (cambio.cambio) {
                const lista = (x) => (x.length ? x.join(', ') : 'ninguno');
                await historial(req, e.idEmpresa, { tipo: 'MODULOS', detalle: `Antes: ${ lista(cambio.antes)}. Ahora: ${ lista(cambio.despues) }.` }, t);
                await bitacoraProducto.registrar(req, { accion: 'EMPRESA_MODULOS', idEmpresa: e.idEmpresa, objeto: e.nombreComercial,
                    antes: cambio.antes, despues: cambio.despues }, t);
            }
            return { e, cambio };
        });
        // Menús y acciones de toda la empresa se recalculan en la siguiente petición.
        if (r.cambio.cambio) invalidarEmpresa(r.e.idEmpresa);
        return ok(res, r.cambio.cambio ? 'Módulos de la empresa guardados' : 'Sin cambios que guardar',
            { id: r.e.idEmpresa, modulos: r.cambio.despues });
    } catch (error) {
        return falla(res, 'setModulosEmpresa', error, 'No fue posible guardar los módulos');
    }
};

// ── Plan de la empresa (T20) ─────────────────────────────────────────────────

/**
 * POST /api/panel/empresas/setPlanEmpresa { idEmpresa, idPlan, fechaInicio?, precioEspecial?, motivo?, bConfirmado? }
 * Cierra el plan vigente (fechaFin = fechaInicio del nuevo) y abre el nuevo. fechaInicio: hoy del
 * producto por defecto; no antes del inicio del vigente ni en el futuro.
 * Si el plan nuevo tiene un límite menor a los empleados activos y no viene bConfirmado: status_code 1,
 * data: { codigo: 'CONFIRMAR_LIMITE', activos, limite }. Al guardar, data: { id (idEmpresaPlan), advertencia }.
 */
const setPlanEmpresa = async (req, res) => {
    try {
        const hoy = await empresaAlta.hoyProducto();
        const r = await db.transaccion(async (t) => {
            const e = await empresaDe(req, req.body.idEmpresa, t, true);
            noEliminada(e);
            const plan = await planDe(req, req.body.idPlan, t);
            const precioEspecial = precioDe(req.body.precioEspecial);
            const fechaInicio = req.body.fechaInicio ? String(req.body.fechaInicio) : hoy;
            if (!fechaValida(fechaInicio)) throw new Regla('La fecha de inicio no es válida (AAAA-MM-DD)');
            if (fechaInicio > hoy) throw new Regla('La fecha de inicio no puede ser futura');
            const motivo = texto(req.body.motivo, 500);

            const [vigente] = await db.panel(req).query(`
                SELECT /* panel: plan vigente de la empresa que se va a cambiar */
                       ep.idEmpresaPlan, ep.idPlan, ep.fechaInicio, ep.precioEspecial, p.nombre AS plan
                  FROM empresas_planes ep JOIN cat_planes p ON p.idPlan = ep.idPlan
                 WHERE ep.idEmpresa = :idEmpresa AND ep.vigente = 1 FOR UPDATE`,
            { replacements: { idEmpresa: e.idEmpresa }, transaction: t });
            if (vigente && vigente.idPlan === plan.idPlan && dinero(vigente.precioEspecial) === precioEspecial) {
                throw new Regla(`La empresa ya tiene el plan ${ plan.nombre } con ese precio`);
            }
            if (vigente && fechaInicio < vigente.fechaInicio) {
                throw new Regla(`La fecha de inicio no puede ser anterior al inicio del plan vigente (${ vigente.fechaInicio })`);
            }

            const activos = await activosDe(req, e.idEmpresa, t);
            const advertencia = plan.tipoCobro === 'LIMITE' && plan.limiteEmpleados < activos;
            if (advertencia && req.body.bConfirmado !== true) {
                throw new Regla(`${ e.nombreComercial } tiene ${ activos } empleados activos y el plan ${ plan.nombre } permite ${ plan.limiteEmpleados }. `
                    + 'Si lo confirmas, no podrá dar de alta ni reactivar empleados hasta bajar de ese número o subir de plan.',
                { codigo: 'CONFIRMAR_LIMITE', activos, limite: plan.limiteEmpleados });
            }

            if (vigente) {
                await db.panel(req).query(`
                    UPDATE empresas_planes SET fechaFin = :fechaInicio
                     WHERE idEmpresa = :idEmpresa AND idEmpresaPlan = :id /* panel: cierra el plan vigente */`,
                { replacements: { fechaInicio, idEmpresa: e.idEmpresa, id: vigente.idEmpresaPlan }, type: QueryTypes.UPDATE, transaction: t });
            }
            const [id] = await db.panel(req).query(`
                INSERT INTO empresas_planes (idEmpresa, idPlan, fechaInicio, precioEspecial, idSuperadmin)
                VALUES (:idEmpresa, :idPlan, :fechaInicio, :precioEspecial, :idSuperadmin) /* panel: abre el plan nuevo */`,
            { replacements: { idEmpresa: e.idEmpresa, idPlan: plan.idPlan, fechaInicio, precioEspecial, idSuperadmin: req.idSuperadmin },
                type: QueryTypes.INSERT, transaction: t });

            const precio = precioEspecial !== null ? `, precio especial ${ precioEspecial }` : '';
            await historial(req, e.idEmpresa, {
                tipo: 'PLAN',
                detalle: `${ vigente ? `De ${ vigente.plan } a ${ plan.nombre }` : `Plan ${ plan.nombre }` } desde ${ fechaInicio }${ precio }`
                    + (advertencia ? ` (con ${ activos } empleados activos sobre un límite de ${ plan.limiteEmpleados })` : ''),
                motivo
            }, t);
            await bitacoraProducto.registrar(req, {
                accion: 'EMPRESA_PLAN', idEmpresa: e.idEmpresa, objeto: String(plan.idPlan),
                antes: vigente ? { idPlan: vigente.idPlan, plan: vigente.plan, fechaInicio: vigente.fechaInicio, precioEspecial: dinero(vigente.precioEspecial) } : null,
                despues: { idPlan: plan.idPlan, plan: plan.nombre, fechaInicio, precioEspecial, activos, confirmado: advertencia },
                motivo
            }, t);
            return { id, plan, advertencia };
        });
        return ok(res, `Plan ${ r.plan.nombre } asignado${ r.advertencia ? ': la empresa queda arriba del límite y no podrá dar de alta empleados' : '' }`,
            { id: r.id, advertencia: r.advertencia });
    } catch (error) {
        return falla(res, 'setPlanEmpresa', error, 'No fue posible cambiar el plan');
    }
};

module.exports = {
    getEmpresas, getEmpresaById, getCatalogosAlta, insertEmpresa, updateEmpresaDatos,
    suspenderEmpresa, reactivarEmpresa, getModulosEmpresa, setModulosEmpresa, setPlanEmpresa,
    iniciarBaja, revertirBaja, descargarExportacion
};
