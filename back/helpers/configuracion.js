// =============================================================================
// Configuración de la empresa (análisis 003 §4)
// =============================================================================
// La ÚNICA forma de leer un ajuste de negocio (tolerancia, días de cierre…):
//
//     const tolerancia = await configuracion.valor(req, 'asistencia.tolerancia_retardo', idSucursal);
//
//   1. si el ajuste admite excepción y la sucursal tiene valor propio, ese;
//   2. si no, el valor general de la empresa;
//   3. si la empresa no tiene valor guardado, el valor inicial del catálogo.
//
// - La empresa sale de la sesión (req.idEmpresa). Una sucursal de otra
//   empresa no encuentra nada suyo: cae en el general de la empresa de la
//   sesión.
// - Sin sucursal regresa el general (cálculos de toda la empresa).
// - Regresa el valor YA convertido a su tipo (helpers/valorTipado.js).
// - Una clave que no existe o está inactiva es error de programación: lanza.
//
// Caché en memoria con empresa, sucursal y clave en la llave; quien cambia un
// valor llama `invalidar(idEmpresa)`.
// =============================================================================

const { db } = require('./db');
const { convertir } = require('./valorTipado');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();
let catalogoCache = null;

/** Catálogo de ajustes, por clave (incluye inactivos, para poder fallar claro). */
const catalogo = async () => {
    if (catalogoCache && catalogoCache.vence > Date.now()) return catalogoCache.porClave;
    const filas = await db.global.query(`
        SELECT clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion,
               valorInicial, bExcepcionSucursal, bAdvierteCalculos, bActivo
          FROM cat_configuracion_ajustes`);
    const porClave = new Map(filas.map(f => [f.clave, f]));
    catalogoCache = { porClave, vence: Date.now() + TTL_MS };
    return porClave;
};

/** Definición de un ajuste activo; lanza si no existe o está inactivo. */
const definicion = async (clave) => {
    const def = (await catalogo()).get(clave);
    if (!def) throw new Error(`[configuracion] El ajuste "${ clave }" no existe en cat_configuracion_ajustes`);
    if (!def.bActivo) throw new Error(`[configuracion] El ajuste "${ clave }" está inactivo`);
    return def;
};

const calcular = async (req, def, idSucursal) => {
    const filas = await db.empresa(req).query(`
        SELECT idSucursal, valor
          FROM configuracion_valores
         WHERE idEmpresa = :idEmpresa AND clave = :clave
           AND (idSucursal IS NULL OR idSucursal = :idSucursal)`,
    { replacements: { clave: def.clave, idSucursal: idSucursal || 0 } });
    const propio = def.bExcepcionSucursal && idSucursal ? filas.find(f => f.idSucursal === idSucursal) : null;
    const general = filas.find(f => f.idSucursal === null);
    const texto = propio ? propio.valor : general ? general.valor : def.valorInicial;
    return convertir(def.tipoDato, texto);
};

/**
 * Valor de un ajuste para la empresa de la sesión y, si se da, la sucursal.
 * @param {object} req   con `idEmpresa` (de la sesión)
 * @param {string} clave 'asistencia.tolerancia_retardo'
 * @param {number} [idSucursal]
 */
const valor = async (req, clave, idSucursal = null) => {
    const def = await definicion(clave);
    const suc = idSucursal ? Number(idSucursal) : null;
    const k = `${ req.idEmpresa }:${ suc || 0 }:${ clave }`;
    const guardado = cache.get(k);
    if (guardado && guardado.vence > Date.now()) return guardado.valor;
    const v = await calcular(req, def, suc);
    cache.set(k, { valor: v, vence: Date.now() + TTL_MS });
    return v;
};

/** Al cambiar cualquier valor de la empresa. */
const invalidar = (idEmpresa) => {
    const prefijo = `${ idEmpresa }:`;
    for (const k of cache.keys()) if (k.startsWith(prefijo)) cache.delete(k);
};

/** Después de cargar un ajuste nuevo por script sin reiniciar. */
const invalidarCatalogo = () => { catalogoCache = null; cache.clear(); };

module.exports = { valor, definicion, catalogo, invalidar, invalidarCatalogo };
