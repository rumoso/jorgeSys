// =============================================================================
// Panel → Constantes del sistema (análisis 009 §9, T31 a T33)
// =============================================================================
// /api/panel/constantes, con validarPanel. La tabla, la lectura por clave y la
// caché ya existen desde el 003 (helpers/constantes.js); aquí se administran:
//   - valores: el global (cat_constantes.valor) y el de cada empresa
//     (constantes_valores), validados SOLO con helpers/valorTipado.js;
//   - catálogo: alta, definición (todo menos la clave y el tipo de dato, que
//     el código ya lee así), desactivar (con la clave escrita igual) y activar.
// Toda escritura invalida la caché de lectura (todas las empresas o solo la
// afectada) y deja bitácora del producto con el antes y el después.
// =============================================================================

const { db, QueryTypes } = require('../../helpers/db');
const { Regla } = require('../../helpers/permisosEdicion');
const { validar, convertir, TIPOS } = require('../../helpers/valorTipado');
const constantes = require('../../helpers/constantes');
const bitacoraProducto = require('../../helpers/panel/bitacoraProducto');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(`panel/${ donde }`, error);
    return res.json({ status_code: 2, message, data: null });
};

const CONTROLES = ['input', 'checkbox', 'switch', 'radio', 'combo'];
const LLAVES_VALIDACION = ['min', 'max', 'unidad', 'maxLength', 'patron', 'multiple'];
const RE_CLAVE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

const json = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return null; }
};
const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const texto = (v, max) => {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    return s ? s.slice(0, max) : null;
};
const like = (q) => `%${ q.replace(/[\\%_]/g, (c) => '\\' + c) }%`;

/** La definición como la ve el Front (opciones y validación ya como objetos). */
const publica = (c) => ({
    clave: c.clave, grupo: c.grupo, orden: Number(c.orden), etiqueta: c.etiqueta, ayuda: c.ayuda,
    tipoDato: c.tipoDato, control: c.control, opciones: json(c.opciones), validacion: json(c.validacion),
    valor: convertir(c.tipoDato, c.valor), bActivo: !!c.bActivo
});

const agrupar = (lista) => {
    const grupos = new Map();
    for (const c of lista) {
        if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
        grupos.get(c.grupo).push(c);
    }
    return [...grupos].map(([grupo, items]) => ({ grupo, constantes: items }));
};

/** La constante del catálogo (bloqueada si se va a escribir), o lanza. */
const constanteDe = async (req, clave, transaction, bloquear = false) => {
    const k = String(clave ?? '').trim();
    const [c] = k ? await db.panel(req).query(`
        SELECT clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion, valor, bActivo
          FROM cat_constantes WHERE clave = :clave ${ bloquear ? 'FOR UPDATE' : '' }`, { replacements: { clave: k }, transaction }) : [];
    if (!c) throw new Regla(`La constante "${ k }" no existe`);
    return c;
};

/** Empresa (no eliminada) a la que se le fija un valor, o lanza. */
const empresaDe = async (req, idEmpresa, transaction) => {
    const id = idValido(idEmpresa);
    const [e] = id ? await db.panel(req).query(`
        SELECT /* panel: empresa a la que se le fija una constante */ idEmpresa, nombreComercial, estado
          FROM empresas WHERE idEmpresa = :id`, { replacements: { id }, transaction }) : [];
    if (!e) throw new Regla('La empresa no existe');
    if (e.estado === 'ELIMINADA') throw new Regla(`La empresa ${ e.nombreComercial } fue eliminada`);
    return e;
};

/** Valida un valor contra la definición; regresa el texto a guardar o lanza con el mensaje. */
const valorValido = (def, valor) => {
    const r = validar(def, valor);
    if (!r.ok) throw new Regla(r.mensaje, { clave: def.clave });
    return r.texto;
};

// ── Consultas (T31) ──────────────────────────────────────────────────────────

/**
 * GET /api/panel/constantes/getConstantes?q=&grupo=&incluirInactivas=1
 * Agrupadas por grupo (en orden), con cuántas empresas tienen valor propio.
 * data: [{ grupo, constantes: [{ clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion,
 *          valor (global, en su tipo), bActivo, empresasConValor }] }]
 */
const getConstantes = async (req, res) => {
    try {
        const q = texto(req.query.q, 100);
        const grupo = texto(req.query.grupo, 60);
        const inactivas = ['1', 'true'].includes(String(req.query.incluirInactivas));
        const filas = await db.panel(req).query(`
            SELECT /* panel: constantes con el número de empresas con valor propio */
                   c.clave, c.grupo, c.orden, c.etiqueta, c.ayuda, c.tipoDato, c.control, c.opciones, c.validacion, c.valor, c.bActivo,
                   (SELECT COUNT(*) FROM constantes_valores v JOIN empresas e ON e.idEmpresa = v.idEmpresa
                     WHERE v.clave = c.clave AND e.estado <> 'ELIMINADA') AS empresasConValor
              FROM cat_constantes c
             WHERE (:inactivas = 1 OR c.bActivo = 1)
               AND (:grupo IS NULL OR c.grupo = :grupo)
               AND (:like IS NULL OR c.clave LIKE :like OR c.etiqueta LIKE :like)
             ORDER BY c.grupo, c.orden, c.clave`, {
            replacements: { inactivas: inactivas ? 1 : 0, grupo, like: q ? like(q) : null }
        });
        const lista = filas.map(f => ({ ...publica(f), empresasConValor: Number(f.empresasConValor) }));
        return ok(res, `${ lista.length } constante(s)`, agrupar(lista));
    } catch (error) {
        return falla(res, 'getConstantes', error, 'No fue posible consultar las constantes');
    }
};

/**
 * GET /api/panel/constantes/getValoresEmpresas?clave=
 * data: { constante, valores: [{ idEmpresa, empresa, estado, valor (en su tipo), fechaModificacion }] }
 */
const getValoresEmpresas = async (req, res) => {
    try {
        const c = await constanteDe(req, req.query.clave);
        const filas = await db.panel(req).query(`
            SELECT /* panel: empresas con valor propio de una constante */
                   v.idEmpresa, e.nombreComercial AS empresa, e.estado, v.valor, v.fechaModificacion
              FROM constantes_valores v JOIN empresas e ON e.idEmpresa = v.idEmpresa
             WHERE v.clave = :clave AND e.estado <> 'ELIMINADA'
             ORDER BY e.nombreComercial`, { replacements: { clave: c.clave } });
        return ok(res, `${ filas.length } empresa(s) con valor propio`, {
            constante: publica(c),
            valores: filas.map(f => ({ ...f, valor: convertir(c.tipoDato, f.valor) }))
        });
    } catch (error) {
        return falla(res, 'getValoresEmpresas', error, 'No fue posible consultar los valores de las empresas');
    }
};

/**
 * GET /api/panel/constantes/getConstantesDeEmpresa?idEmpresa= (pestaña Constantes de la ficha)
 * data: [{ grupo, constantes: [{ ...definición, valor (global), valorEmpresa (o null), bPropio, valorEfectivo }] }]
 */
const getConstantesDeEmpresa = async (req, res) => {
    try {
        const e = await empresaDe(req, req.query.idEmpresa);
        const filas = await db.panel(req).query(`
            SELECT /* panel: constantes de una empresa (ficha) */
                   c.clave, c.grupo, c.orden, c.etiqueta, c.ayuda, c.tipoDato, c.control, c.opciones, c.validacion, c.valor, c.bActivo,
                   v.valor AS valorEmpresa, (v.clave IS NOT NULL) AS bPropio
              FROM cat_constantes c
              LEFT JOIN constantes_valores v ON v.clave = c.clave AND v.idEmpresa = :idEmpresa
             WHERE c.bActivo = 1
             ORDER BY c.grupo, c.orden, c.clave`, { replacements: { idEmpresa: e.idEmpresa } });
        const lista = filas.map(f => {
            const bPropio = !!Number(f.bPropio);
            const valorEmpresa = bPropio ? convertir(f.tipoDato, f.valorEmpresa) : null;
            const def = publica(f);
            return { ...def, valorEmpresa, bPropio, valorEfectivo: bPropio ? valorEmpresa : def.valor };
        });
        return ok(res, `${ lista.length } constante(s) de ${ e.nombreComercial }`, agrupar(lista));
    } catch (error) {
        return falla(res, 'getConstantesDeEmpresa', error, 'No fue posible consultar las constantes de la empresa');
    }
};

/**
 * GET /api/panel/constantes/getImpactoGlobal?clave=
 * Cuántas empresas (no eliminadas) usan el valor global: las que no tienen valor propio.
 * data: { clave, empresas, conValorPropio, usanGlobal }
 */
const getImpactoGlobal = async (req, res) => {
    try {
        const c = await constanteDe(req, req.query.clave);
        const [r] = await db.panel(req).query(`
            SELECT /* panel: impacto de cambiar el valor global de una constante */
                   COUNT(*) AS empresas,
                   SUM(EXISTS (SELECT 1 FROM constantes_valores v WHERE v.idEmpresa = e.idEmpresa AND v.clave = :clave)) AS conValorPropio
              FROM empresas e WHERE e.estado <> 'ELIMINADA'`, { replacements: { clave: c.clave } });
        const empresas = Number(r.empresas), conValorPropio = Number(r.conValorPropio || 0);
        const usanGlobal = empresas - conValorPropio;
        return ok(res, `Cambiar el valor global afecta a ${ usanGlobal } empresa(s)`, { clave: c.clave, empresas, conValorPropio, usanGlobal });
    } catch (error) {
        return falla(res, 'getImpactoGlobal', error, 'No fue posible calcular el impacto');
    }
};

// ── Valores (T31 y T33) ──────────────────────────────────────────────────────

/** POST /api/panel/constantes/setValorGlobal { clave, valor } → data: { clave, valor } */
const setValorGlobal = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const c = await constanteDe(req, req.body.clave, t, true);
            const nuevo = valorValido(c, req.body.valor);
            if (nuevo === c.valor) return { c, nuevo, cambio: false };
            await db.panel(req).query('UPDATE cat_constantes SET valor = :valor WHERE clave = :clave',
                { replacements: { valor: nuevo, clave: c.clave }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_VALOR_GLOBAL', objeto: c.clave,
                antes: convertir(c.tipoDato, c.valor), despues: convertir(c.tipoDato, nuevo) }, t);
            return { c, nuevo, cambio: true };
        });
        if (r.cambio) constantes.invalidar();
        return ok(res, r.cambio ? `Valor global de ${ r.c.clave } guardado` : 'Sin cambios que guardar',
            { clave: r.c.clave, valor: convertir(r.c.tipoDato, r.nuevo) });
    } catch (error) {
        return falla(res, 'setValorGlobal', error, 'No fue posible guardar el valor global');
    }
};

/** POST /api/panel/constantes/setValorEmpresa { clave, idEmpresa, valor } → data: { clave, idEmpresa, valor } */
const setValorEmpresa = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const c = await constanteDe(req, req.body.clave, t, true);
            const e = await empresaDe(req, req.body.idEmpresa, t);
            const nuevo = valorValido(c, req.body.valor);
            const [actual] = await db.panel(req).query(`
                SELECT /* panel: valor propio de la empresa antes de cambiarlo */ valor FROM constantes_valores
                 WHERE idEmpresa = :idEmpresa AND clave = :clave FOR UPDATE`,
            { replacements: { idEmpresa: e.idEmpresa, clave: c.clave }, transaction: t });
            if (actual && actual.valor === nuevo) return { c, e, nuevo, cambio: false };
            await db.panel(req).query(`
                INSERT INTO constantes_valores (idEmpresa, clave, valor, idUsuarioModifico)
                VALUES (:idEmpresa, :clave, :valor, NULL)
                ON DUPLICATE KEY UPDATE valor = VALUES(valor), idUsuarioModifico = NULL /* panel: valor propio de una empresa */`,
            { replacements: { idEmpresa: e.idEmpresa, clave: c.clave, valor: nuevo }, type: QueryTypes.INSERT, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_VALOR_EMPRESA', idEmpresa: e.idEmpresa, objeto: c.clave,
                antes: actual ? convertir(c.tipoDato, actual.valor) : null, despues: convertir(c.tipoDato, nuevo) }, t);
            return { c, e, nuevo, cambio: true };
        });
        if (r.cambio) constantes.invalidar(r.e.idEmpresa);
        return ok(res, r.cambio ? `${ r.e.nombreComercial } tiene ahora su propio valor de ${ r.c.clave }` : 'Sin cambios que guardar',
            { clave: r.c.clave, idEmpresa: r.e.idEmpresa, valor: convertir(r.c.tipoDato, r.nuevo) });
    } catch (error) {
        return falla(res, 'setValorEmpresa', error, 'No fue posible guardar el valor de la empresa');
    }
};

/** POST /api/panel/constantes/quitarValorEmpresa { clave, idEmpresa } → data: { clave, idEmpresa }. La empresa regresa al global. */
const quitarValorEmpresa = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const c = await constanteDe(req, req.body.clave, t, true);
            const e = await empresaDe(req, req.body.idEmpresa, t);
            const [actual] = await db.panel(req).query(`
                SELECT /* panel: valor propio de la empresa que se quita */ valor FROM constantes_valores
                 WHERE idEmpresa = :idEmpresa AND clave = :clave FOR UPDATE`,
            { replacements: { idEmpresa: e.idEmpresa, clave: c.clave }, transaction: t });
            if (!actual) return { c, e, cambio: false };
            await db.panel(req).query(`
                DELETE FROM constantes_valores WHERE idEmpresa = :idEmpresa AND clave = :clave /* panel: quita el valor propio de una empresa */`,
            { replacements: { idEmpresa: e.idEmpresa, clave: c.clave }, type: QueryTypes.BULKDELETE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_VALOR_EMPRESA_QUITADO', idEmpresa: e.idEmpresa, objeto: c.clave,
                antes: convertir(c.tipoDato, actual.valor), despues: null }, t);
            return { c, e, cambio: true };
        });
        if (r.cambio) constantes.invalidar(r.e.idEmpresa);
        return ok(res, r.cambio ? `${ r.e.nombreComercial } usa ahora el valor global de ${ r.c.clave }` : 'La empresa ya usaba el valor global',
            { clave: r.c.clave, idEmpresa: r.e.idEmpresa });
    } catch (error) {
        return falla(res, 'quitarValorEmpresa', error, 'No fue posible quitar el valor de la empresa');
    }
};

// ── Catálogo (T32 y T33) ─────────────────────────────────────────────────────

/** Revisa y normaliza la definición (sin clave ni tipo). Lanza Regla si algo está mal. */
const definicionDe = (body, tipoDato) => {
    const grupo = texto(body.grupo, 60);
    if (!grupo) throw new Regla('Escribe el grupo');
    const etiqueta = texto(body.etiqueta, 120);
    if (!etiqueta) throw new Regla('Escribe la etiqueta');
    const ayuda = texto(body.ayuda, 500);
    const orden = body.orden === undefined || body.orden === null || body.orden === '' ? 0 : Number(body.orden);
    if (!Number.isInteger(orden) || orden < -100000 || orden > 100000) throw new Regla('El orden debe ser un número entero');
    const control = String(body.control ?? '');
    if (!CONTROLES.includes(control)) throw new Regla(`El control debe ser uno de: ${ CONTROLES.join(', ') }`);

    let opciones = json(body.opciones);
    if (opciones !== null) {
        if (!Array.isArray(opciones)) throw new Regla('Las opciones deben ser una lista de { valor, texto }');
        opciones = opciones.map((o) => {
            if (!o || typeof o !== 'object' || o.valor === undefined || o.valor === null || String(o.valor) === '' || !texto(o.texto, 120)) {
                throw new Regla('Cada opción lleva su valor y su texto');
            }
            return { valor: String(o.valor), texto: texto(o.texto, 120) };
        });
        if (new Set(opciones.map(o => o.valor)).size !== opciones.length) throw new Regla('Hay opciones con el mismo valor');
        if (!opciones.length) opciones = null;
    }
    let validacion = json(body.validacion);
    if (validacion !== null) {
        if (typeof validacion !== 'object' || Array.isArray(validacion)) throw new Regla('La validación debe ser un objeto');
        const otras = Object.keys(validacion).filter(k => !LLAVES_VALIDACION.includes(k));
        if (otras.length) throw new Regla(`La validación solo admite: ${ LLAVES_VALIDACION.join(', ') } (sobra ${ otras.join(', ') })`);
        if (validacion.patron !== undefined) {
            try { new RegExp(validacion.patron); } catch { throw new Regla('El patrón de la validación no es una expresión válida'); }
        }
        for (const k of ['min', 'max', 'maxLength']) {
            if (validacion[k] !== undefined && ['entero', 'decimal', 'texto'].includes(tipoDato) && !Number.isFinite(Number(validacion[k]))) {
                throw new Regla(`"${ k }" de la validación debe ser un número`);
            }
        }
        if (!Object.keys(validacion).length) validacion = null;
    }
    if (['checkbox', 'switch'].includes(control) && tipoDato !== 'booleano') throw new Regla(`El control ${ control } es para un dato sí/no (booleano)`);
    if (['radio', 'combo'].includes(control) && !opciones) throw new Regla(`El control ${ control } necesita opciones`);
    if (tipoDato === 'lista' && !opciones) throw new Regla('Una lista necesita opciones');
    return { grupo, orden, etiqueta, ayuda, control, opciones, validacion };
};

/**
 * POST /api/panel/constantes/insertConstante
 * { clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion, valor } → data: { clave }
 */
const insertConstante = async (req, res) => {
    try {
        const clave = String(req.body.clave ?? '').trim();
        if (!RE_CLAVE.test(clave) || clave.length > 80) {
            throw new Regla('La clave va en minúsculas, con puntos y guion bajo (p. ej. "grupo.nombre_corto"), hasta 80 caracteres');
        }
        const tipoDato = String(req.body.tipoDato ?? '');
        if (!TIPOS.includes(tipoDato)) throw new Regla(`El tipo de dato debe ser uno de: ${ TIPOS.join(', ') }`);
        const def = { clave, tipoDato, ...definicionDe(req.body, tipoDato) };
        const valor = valorValido(def, req.body.valor);
        await db.transaccion(async (t) => {
            const [existe] = await db.panel(req).query('SELECT clave FROM cat_constantes WHERE clave = :clave FOR UPDATE',
                { replacements: { clave }, transaction: t });
            if (existe) throw new Regla(`Ya existe la constante "${ clave }"`);
            await db.panel(req).query(`
                INSERT INTO cat_constantes (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion, valor)
                VALUES (:clave, :grupo, :orden, :etiqueta, :ayuda, :tipoDato, :control, :opciones, :validacion, :valor)`, {
                replacements: { ...def, opciones: def.opciones ? JSON.stringify(def.opciones) : null,
                    validacion: def.validacion ? JSON.stringify(def.validacion) : null, valor },
                type: QueryTypes.INSERT, transaction: t
            });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_ALTA', objeto: clave,
                despues: { ...def, valor: convertir(tipoDato, valor) } }, t);
        });
        constantes.invalidar();
        return ok(res, `Constante ${ clave } creada. No hace nada hasta que el código la lea.`, { clave });
    } catch (error) {
        return falla(res, 'insertConstante', error, 'No fue posible crear la constante');
    }
};

/**
 * POST /api/panel/constantes/updateDefinicionConstante
 * { clave, grupo, orden, etiqueta, ayuda, control, opciones, validacion } (tipoDato, si viene, debe ser el mismo)
 * Si la definición nueva deja inválido el valor global o el de alguna empresa, no guarda:
 * status_code 1, data: { codigo: 'VALORES_INVALIDOS', invalidos: [{ idEmpresa (null = global), empresa, valor, mensaje }] }.
 * data: { clave }
 */
const updateDefinicionConstante = async (req, res) => {
    try {
        const r = await db.transaccion(async (t) => {
            const c = await constanteDe(req, req.body.clave, t, true);
            if (req.body.tipoDato !== undefined && req.body.tipoDato !== c.tipoDato) {
                throw new Regla(`El tipo de dato de ${ c.clave } no se cambia (es ${ c.tipoDato }): el código ya la lee así`);
            }
            const nueva = { clave: c.clave, tipoDato: c.tipoDato, ...definicionDe(req.body, c.tipoDato) };
            const antes = publica(c);
            const iguales = ['grupo', 'orden', 'etiqueta', 'ayuda', 'control'].every(k => (nueva[k] ?? null) === (antes[k] ?? null))
                && JSON.stringify(nueva.opciones) === JSON.stringify(antes.opciones)
                && JSON.stringify(nueva.validacion) === JSON.stringify(antes.validacion);
            if (iguales) return { c, cambio: false };

            // Los valores actuales tienen que seguir siendo válidos con la definición nueva.
            const invalidos = [];
            const revisar = (idEmpresa, empresa, valor) => {
                if (valor === null || valor === undefined) return;
                const v = validar(nueva, convertir(c.tipoDato, valor));
                if (!v.ok) invalidos.push({ idEmpresa, empresa, valor: convertir(c.tipoDato, valor), mensaje: v.mensaje });
            };
            revisar(null, 'Valor global', c.valor);
            const deEmpresas = await db.panel(req).query(`
                SELECT /* panel: valores de las empresas que la definición nueva debe seguir aceptando */
                       v.idEmpresa, e.nombreComercial AS empresa, v.valor
                  FROM constantes_valores v JOIN empresas e ON e.idEmpresa = v.idEmpresa
                 WHERE v.clave = :clave ORDER BY e.nombreComercial`, { replacements: { clave: c.clave }, transaction: t });
            for (const f of deEmpresas) revisar(f.idEmpresa, f.empresa, f.valor);
            if (invalidos.length) {
                throw new Regla(`La definición nueva deja inválido(s) ${ invalidos.length } valor(es): `
                    + `${ invalidos.map(x => `${ x.empresa } (${ x.valor })`).join(', ') }. Corrígelos antes de cambiarla.`,
                { codigo: 'VALORES_INVALIDOS', invalidos });
            }

            await db.panel(req).query(`
                UPDATE cat_constantes
                   SET grupo = :grupo, orden = :orden, etiqueta = :etiqueta, ayuda = :ayuda, control = :control,
                       opciones = :opciones, validacion = :validacion
                 WHERE clave = :clave`, {
                replacements: { ...nueva, opciones: nueva.opciones ? JSON.stringify(nueva.opciones) : null,
                    validacion: nueva.validacion ? JSON.stringify(nueva.validacion) : null },
                type: QueryTypes.UPDATE, transaction: t
            });
            const quitar = ({ grupo, orden, etiqueta, ayuda, control, opciones, validacion }) => ({ grupo, orden, etiqueta, ayuda, control, opciones, validacion });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_DEFINICION', objeto: c.clave, antes: quitar(antes), despues: quitar(nueva) }, t);
            return { c, cambio: true };
        });
        if (r.cambio) constantes.invalidar();
        return ok(res, r.cambio ? `Definición de ${ r.c.clave } guardada` : 'Sin cambios que guardar', { clave: r.c.clave });
    } catch (error) {
        return falla(res, 'updateDefinicionConstante', error, 'No fue posible guardar la definición');
    }
};

/**
 * PUT /api/panel/constantes/disableConstante { clave, claveConfirmacion }
 * El código que todavía la lea fallará (003 §4): por eso se confirma escribiendo la clave igual. data: { clave }
 */
const disableConstante = async (req, res) => {
    try {
        const c = await db.transaccion(async (t) => {
            const c = await constanteDe(req, req.body.clave, t, true);
            if (String(req.body.claveConfirmacion ?? '').trim() !== c.clave) {
                throw new Regla(`Escribe la clave ${ c.clave } exactamente igual para desactivarla`);
            }
            if (!c.bActivo) throw new Regla(`La constante ${ c.clave } ya está desactivada`);
            await db.panel(req).query('UPDATE cat_constantes SET bActivo = 0 WHERE clave = :clave',
                { replacements: { clave: c.clave }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_DESACTIVADA', objeto: c.clave, antes: { bActivo: true }, despues: { bActivo: false } }, t);
            return c;
        });
        constantes.invalidar();
        return ok(res, `Constante ${ c.clave } desactivada: el código que la lea fallará hasta que la actives`, { clave: c.clave });
    } catch (error) {
        return falla(res, 'disableConstante', error, 'No fue posible desactivar la constante');
    }
};

/** PUT /api/panel/constantes/enableConstante { clave } → data: { clave } */
const enableConstante = async (req, res) => {
    try {
        const c = await db.transaccion(async (t) => {
            const c = await constanteDe(req, req.body.clave, t, true);
            if (c.bActivo) throw new Regla(`La constante ${ c.clave } ya está activa`);
            await db.panel(req).query('UPDATE cat_constantes SET bActivo = 1 WHERE clave = :clave',
                { replacements: { clave: c.clave }, type: QueryTypes.UPDATE, transaction: t });
            await bitacoraProducto.registrar(req, { accion: 'CONSTANTE_ACTIVADA', objeto: c.clave, antes: { bActivo: false }, despues: { bActivo: true } }, t);
            return c;
        });
        constantes.invalidar();
        return ok(res, `Constante ${ c.clave } activada`, { clave: c.clave });
    } catch (error) {
        return falla(res, 'enableConstante', error, 'No fue posible activar la constante');
    }
};

module.exports = {
    getConstantes, getValoresEmpresas, getConstantesDeEmpresa, getImpactoGlobal,
    setValorGlobal, setValorEmpresa, quitarValorEmpresa,
    insertConstante, updateDefinicionConstante, disableConstante, enableConstante
};
