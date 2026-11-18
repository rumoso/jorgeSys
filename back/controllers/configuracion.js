// =============================================================================
// Empresa → Configuración (análisis 003)
// =============================================================================
// Ajustes de negocio de la empresa: valor general y, en los que lo admiten,
// valor propio por sucursal. El Front dibuja el formulario con el catálogo;
// el Back valida todo con helpers/valorTipado.js.
//
// Reglas de alcance (001):
// - los valores generales solo los cambia quien tiene TODAS las sucursales;
// - un usuario limitado ve y cambia solo las excepciones de sus sucursales.
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const { validar, convertir } = require('../helpers/valorTipado');
const configuracion = require('../helpers/configuracion');
const { registrar } = require('../helpers/bitacoraConfiguracion');
const { alcanceSucursales } = require('../helpers/sesion');
const fechas = require('../helpers/fechas');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    console.error(donde, error);
    return res.json({ status_code: 2, message, data: null });
};

const MSG_SOLO_TODAS = 'Los valores generales solo los cambia quien tiene acceso a todas las sucursales';

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Ajustes activos del catálogo, en orden. */
const ajustesActivos = (transaction) => db.global.query(`
    SELECT clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion,
           valorInicial, bExcepcionSucursal, bAdvierteCalculos
      FROM cat_configuracion_ajustes
     WHERE bActivo = 1
     ORDER BY orden, etiqueta`, { transaction });

const definicionPublica = (a) => ({
    clave: a.clave, grupo: a.grupo, etiqueta: a.etiqueta, ayuda: a.ayuda,
    tipoDato: a.tipoDato, control: a.control,
    opciones: json(a.opciones), validacion: json(a.validacion),
    valorInicial: convertir(a.tipoDato, a.valorInicial),
    bExcepcionSucursal: !!a.bExcepcionSucursal, bAdvierteCalculos: !!a.bAdvierteCalculos
});

/** Agrupa en el orden del primer ajuste de cada grupo. */
const agrupar = (ajustes) => {
    const grupos = new Map();
    for (const a of ajustes) {
        if (!grupos.has(a.grupo)) grupos.set(a.grupo, []);
        grupos.get(a.grupo).push(a);
    }
    return [...grupos].map(([grupo, lista]) => ({ grupo, ajustes: lista }));
};

/** Sucursal de la empresa de la sesión (o undefined). */
const sucursalDeEmpresa = async (req, idSucursal, transaction) => (await db.empresa(req).query(
    'SELECT idSucursal, nombre, bActivo FROM sucursales WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
    { replacements: { idSucursal }, transaction }))[0];

// ── Consultas ────────────────────────────────────────────────────────────────

/**
 * GET /api/configuracion/getConfiguracion
 * Ajustes agrupados con su valor general, si está confirmado y las
 * sucursales (del alcance del usuario) que tienen un valor distinto.
 */
const getConfiguracion = async (req, res) => {
    try {
        const alcance = await alcanceSucursales(req);
        const ajustes = await ajustesActivos();
        const valores = await db.empresa(req).query(`
            SELECT cv.idSucursal, cv.clave, cv.valor, cv.bConfirmado, cv.fechaModificacion,
                   u.nombre AS modifico
              FROM configuracion_valores cv
              LEFT JOIN usuarios u ON u.idUsuario = cv.idUsuarioModifico
             WHERE cv.idEmpresa = :idEmpresa`);
        const sucursales = new Map((await db.empresa(req).query(
            'SELECT idSucursal, nombre FROM sucursales WHERE idEmpresa = :idEmpresa AND bActivo = 1'))
            .filter(s => alcance.incluye(s.idSucursal))
            .map(s => [s.idSucursal, s.nombre]));

        const lista = ajustes.map(a => {
            const general = valores.find(v => v.clave === a.clave && v.idSucursal === null);
            const excepciones = a.bExcepcionSucursal
                ? valores.filter(v => v.clave === a.clave && v.idSucursal !== null && sucursales.has(v.idSucursal))
                    .map(v => ({ idSucursal: v.idSucursal, nombre: sucursales.get(v.idSucursal), valor: convertir(a.tipoDato, v.valor) }))
                    .sort((x, y) => x.nombre.localeCompare(y.nombre))
                : [];
            return {
                ...definicionPublica(a),
                valor: convertir(a.tipoDato, general ? general.valor : a.valorInicial),
                bConfirmado: !!general?.bConfirmado,
                modifico: general?.bConfirmado ? general.modifico : null,
                fechaModificacion: general?.bConfirmado ? general.fechaModificacion : null,
                excepciones
            };
        });

        return ok(res, `${ lista.length } ajuste(s)`, {
            todasSucursales: alcance.todas,
            puedeEditar: req.permisos.acciones.has('configuracion_Editar'),
            grupos: agrupar(lista)
        });
    } catch (error) {
        return falla(res, 'getConfiguracion', error, 'No fue posible consultar la configuración');
    }
};

/**
 * GET /api/configuracion/getConfiguracionSucursal?idSucursal=
 * Los ajustes que admiten excepción, con el valor general y el propio.
 */
const getConfiguracionSucursal = async (req, res) => {
    const idSucursal = Number(req.query.idSucursal);
    try {
        const sucursal = await sucursalDeEmpresa(req, idSucursal);
        const alcance = await alcanceSucursales(req);
        if (!sucursal || !alcance.incluye(idSucursal)) return no(res, 'La sucursal no existe');

        const ajustes = (await ajustesActivos()).filter(a => a.bExcepcionSucursal);
        const valores = await db.empresa(req).query(`
            SELECT idSucursal, clave, valor FROM configuracion_valores
             WHERE idEmpresa = :idEmpresa AND (idSucursal IS NULL OR idSucursal = :idSucursal)`,
        { replacements: { idSucursal } });

        const lista = ajustes.map(a => {
            const general = valores.find(v => v.clave === a.clave && v.idSucursal === null);
            const propio = valores.find(v => v.clave === a.clave && v.idSucursal === idSucursal);
            return {
                ...definicionPublica(a),
                valorGeneral: convertir(a.tipoDato, general ? general.valor : a.valorInicial),
                valorPropio: propio ? convertir(a.tipoDato, propio.valor) : null,
                bPropio: !!propio
            };
        });
        return ok(res, `${ lista.length } ajuste(s)`, {
            idSucursal, nombre: sucursal.nombre,
            puedeEditar: req.permisos.acciones.has('configuracion_Editar'),
            ajustes: lista
        });
    } catch (error) {
        return falla(res, 'getConfiguracionSucursal', error, 'No fue posible consultar la configuración de la sucursal');
    }
};

/** GET /api/configuracion/getBitacoraConfiguracion?limite= (de las sucursales del alcance) */
const getBitacoraConfiguracion = async (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
    try {
        const alcance = await alcanceSucursales(req);
        const filas = await db.empresa(req).query(`
            SELECT b.idBitacora, b.fecha, b.tipo, b.clave, b.idSucursal, s.nombre AS sucursal,
                   b.antes, b.despues, b.idSesionSoporte, IF(b.idSesionSoporte IS NULL, u.nombre, 'Soporte') AS autor
              FROM bitacora_configuracion b
              LEFT JOIN sucursales s ON s.idEmpresa = b.idEmpresa AND s.idSucursal = b.idSucursal
              LEFT JOIN usuarios u ON u.idUsuario = b.idUsuarioAutor
             WHERE b.idEmpresa = :idEmpresa AND b.tipo <> 'CONSTANTE'
             ORDER BY b.idBitacora DESC
             LIMIT ${ limite }`);
        const data = filas.filter(f => f.idSucursal === null || alcance.incluye(f.idSucursal));
        return ok(res, `${ data.length } cambio(s)`, data);
    } catch (error) {
        return falla(res, 'getBitacoraConfiguracion', error, 'No fue posible consultar la bitácora');
    }
};

/**
 * GET /api/configuracion/getAccesosSoporte?limite= (009, T27)
 * Cuándo entró soporte del proveedor a ESTA empresa, quién, por qué y cuánto duró.
 * data: [{ idSesionSoporte, superadmin, motivo, inicio, vence, fin (ISO o null), estado: ABIERTA|CERRADA|VENCIDA, minutos }]
 */
const getAccesosSoporte = async (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
    try {
        const ahora = fechas.ahora();
        const filas = await db.empresa(req).query(`
            SELECT idSesionSoporte, nombreSuperadmin AS superadmin, motivo, inicio, vence, fin
              FROM soporte_sesiones
             WHERE idEmpresa = :idEmpresa
             ORDER BY inicio DESC, idSesionSoporte DESC
             LIMIT ${ limite }`);
        const iso = (v) => (v ? `${ String(v).replace(' ', 'T') }Z` : null);
        const data = filas.map(f => {
            const inicio = iso(f.inicio), vence = iso(f.vence), fin = iso(f.fin);
            const estado = fin ? 'CERRADA' : new Date(vence) <= ahora ? 'VENCIDA' : 'ABIERTA';
            const hasta = fin || (estado === 'VENCIDA' ? vence : ahora.toISOString());
            return {
                idSesionSoporte: f.idSesionSoporte, superadmin: f.superadmin, motivo: f.motivo,
                inicio, vence, fin, estado,
                minutos: Math.max(0, Math.round((new Date(hasta) - new Date(inicio)) / 60000))
            };
        });
        return ok(res, `${ data.length } acceso(s) de soporte`, data);
    } catch (error) {
        return falla(res, 'getAccesosSoporte', error, 'No fue posible consultar los accesos de soporte');
    }
};

// ── Escrituras ───────────────────────────────────────────────────────────────

/** Valor general guardado (o undefined), bloqueado para la transacción. */
const generalActual = async (req, clave, transaction) => (await db.empresa(req).query(`
    SELECT valor, bConfirmado FROM configuracion_valores
     WHERE idEmpresa = :idEmpresa AND idSucursal IS NULL AND clave = :clave
     FOR UPDATE`, { replacements: { clave }, transaction }))[0];

const guardarGeneral = (req, clave, valor, transaction) => db.empresa(req).query(`
    INSERT INTO configuracion_valores (idEmpresa, idSucursal, clave, valor, bConfirmado, idUsuarioModifico)
    VALUES (:idEmpresa, NULL, :clave, :valor, 1, :uid)
    ON DUPLICATE KEY UPDATE valor = VALUES(valor), bConfirmado = 1, idUsuarioModifico = VALUES(idUsuarioModifico)`,
{ replacements: { clave, valor, uid: req.uid }, type: QueryTypes.INSERT, transaction });

/**
 * POST /api/configuracion/setConfiguracion { valores: [{ clave, valor }] }
 * Guarda los valores generales y los marca confirmados. No toca las
 * excepciones de sucursal.
 */
const setConfiguracion = async (req, res) => {
    const entrada = Array.isArray(req.body.valores) ? req.body.valores : [];
    try {
        const alcance = await alcanceSucursales(req);
        if (!alcance.todas) return no(res, MSG_SOLO_TODAS);
        if (!entrada.length) return no(res, 'No hay cambios que guardar');

        const catalogo = new Map((await ajustesActivos()).map(a => [a.clave, a]));
        const limpios = [];
        for (const { clave, valor } of entrada) {
            const def = catalogo.get(String(clave));
            if (!def) return no(res, `El ajuste "${ clave }" no existe`);
            const r = validar(def, valor);
            if (!r.ok) return no(res, r.mensaje, { clave });
            limpios.push({ clave: def.clave, texto: r.texto });
        }

        let cambios = 0;
        await db.transaccion(async (t) => {
            for (const { clave, texto } of limpios) {
                const actual = await generalActual(req, clave, t);
                const antes = actual ? actual.valor : catalogo.get(clave).valorInicial;
                if (actual?.bConfirmado && actual.valor === texto) continue;
                await guardarGeneral(req, clave, texto, t);
                await registrar(req, { tipo: antes === texto ? 'CONFIRMACION' : 'AJUSTE', clave, antes, despues: texto }, t);
                cambios++;
            }
        });
        configuracion.invalidar(req.idEmpresa);
        return ok(res, cambios ? 'Configuración guardada' : 'No hubo cambios', { cambios });
    } catch (error) {
        return falla(res, 'setConfiguracion', error, 'No fue posible guardar la configuración');
    }
};

/** POST /api/configuracion/confirmarConfiguracion { claves: [] } — acepta el valor inicial tal cual. */
const confirmarConfiguracion = async (req, res) => {
    const claves = Array.isArray(req.body.claves) ? req.body.claves.map(String) : [];
    try {
        const alcance = await alcanceSucursales(req);
        if (!alcance.todas) return no(res, MSG_SOLO_TODAS);
        const catalogo = new Map((await ajustesActivos()).map(a => [a.clave, a]));
        const malo = claves.find(c => !catalogo.has(c));
        if (malo) return no(res, `El ajuste "${ malo }" no existe`);

        let cambios = 0;
        await db.transaccion(async (t) => {
            for (const clave of claves) {
                const actual = await generalActual(req, clave, t);
                if (actual?.bConfirmado) continue;
                const valor = actual ? actual.valor : catalogo.get(clave).valorInicial;
                await guardarGeneral(req, clave, valor, t);
                await registrar(req, { tipo: 'CONFIRMACION', clave, antes: valor, despues: valor }, t);
                cambios++;
            }
        });
        configuracion.invalidar(req.idEmpresa);
        return ok(res, cambios ? 'Valores confirmados' : 'Ya estaban confirmados', { cambios });
    } catch (error) {
        return falla(res, 'confirmarConfiguracion', error, 'No fue posible confirmar la configuración');
    }
};

/**
 * POST /api/configuracion/setExcepcionSucursal { idSucursal, clave, valor }
 * `valor` nulo quita la excepción: la sucursal regresa al valor general.
 */
const setExcepcionSucursal = async (req, res) => {
    const idSucursal = Number(req.body.idSucursal);
    const clave = String(req.body.clave || '');
    const quitar = req.body.valor === null || req.body.valor === undefined;
    try {
        const sucursal = await sucursalDeEmpresa(req, idSucursal);
        const alcance = await alcanceSucursales(req);
        if (!sucursal || !alcance.incluye(idSucursal)) return no(res, 'La sucursal no existe');

        const def = (await ajustesActivos()).find(a => a.clave === clave);
        if (!def) return no(res, `El ajuste "${ clave }" no existe`);
        if (!def.bExcepcionSucursal) return no(res, `"${ def.etiqueta }" es igual para todas las sucursales; no admite un valor propio`);

        let texto = null;
        if (!quitar) {
            const r = validar(def, req.body.valor);
            if (!r.ok) return no(res, r.mensaje, { clave });
            texto = r.texto;
        }

        let cambio = false;
        await db.transaccion(async (t) => {
            const [actual] = await db.empresa(req).query(`
                SELECT valor FROM configuracion_valores
                 WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal AND clave = :clave
                 FOR UPDATE`, { replacements: { idSucursal, clave }, transaction: t });
            if (quitar) {
                if (!actual) return;
                await db.empresa(req).query(`
                    DELETE FROM configuracion_valores
                     WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal AND clave = :clave`,
                { replacements: { idSucursal, clave }, type: QueryTypes.DELETE, transaction: t });
            } else {
                if (actual && actual.valor === texto) return;
                await db.empresa(req).query(`
                    INSERT INTO configuracion_valores (idEmpresa, idSucursal, clave, valor, bConfirmado, idUsuarioModifico)
                    VALUES (:idEmpresa, :idSucursal, :clave, :valor, 1, :uid)
                    ON DUPLICATE KEY UPDATE valor = VALUES(valor), idUsuarioModifico = VALUES(idUsuarioModifico)`,
                { replacements: { idSucursal, clave, valor: texto, uid: req.uid }, type: QueryTypes.INSERT, transaction: t });
            }
            await registrar(req, { tipo: 'EXCEPCION', clave, idSucursal, antes: actual?.valor ?? null, despues: texto }, t);
            cambio = true;
        });
        configuracion.invalidar(req.idEmpresa);
        const msg = !cambio ? 'No hubo cambios'
            : quitar ? `${ sucursal.nombre } usa ahora el valor de la empresa`
                : `${ sucursal.nombre } tiene ahora su propio valor`;
        return ok(res, msg, { cambio });
    } catch (error) {
        return falla(res, 'setExcepcionSucursal', error, 'No fue posible guardar el valor de la sucursal');
    }
};

module.exports = {
    getConfiguracion, getConfiguracionSucursal, getBitacoraConfiguracion, getAccesosSoporte,
    setConfiguracion, confirmarConfiguracion, setExcepcionSucursal
};
