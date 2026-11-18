// =============================================================================
// Constantes del sistema (análisis 003 §3 y §4)
// =============================================================================
// Lo técnico y del producto (límites, umbrales, vigencias). El cliente no las
// ve ni las cambia: las administra el superadministrador (009) o un script.
// Los secretos NO van aquí: viven en la configuración del servidor (.env).
//
//     const max = await constantes.valor('sesion.intentos_por_ip');        // global
//     const umbral = await constantes.valor('faceid.umbral', req);          // la de la empresa, si tiene
//
// Con `req` (y su idEmpresa de la sesión) regresa el valor fijado para esa
// empresa, si existe; si no, el global. Ya convertido a su tipo. Una clave
// que no existe o está inactiva lanza.
// =============================================================================

const { db } = require('./db');
const { convertir } = require('./valorTipado');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const definicion = async (clave) => {
    const [def] = await db.global.query(
        'SELECT clave, tipoDato, valor, bActivo FROM cat_constantes WHERE clave = :clave', { replacements: { clave } });
    if (!def) throw new Error(`[constantes] La constante "${ clave }" no existe en cat_constantes`);
    if (!def.bActivo) throw new Error(`[constantes] La constante "${ clave }" está inactiva`);
    return def;
};

const valor = async (clave, req = null) => {
    const idEmpresa = Number(req?.idEmpresa) || 0;
    const k = `${ idEmpresa }:${ clave }`;
    const guardado = cache.get(k);
    if (guardado && guardado.vence > Date.now()) return guardado.valor;

    const def = await definicion(clave);
    let texto = def.valor;
    if (idEmpresa) {
        const [propio] = await db.empresa(req).query(
            'SELECT valor FROM constantes_valores WHERE idEmpresa = :idEmpresa AND clave = :clave',
            { replacements: { clave } });
        if (propio) texto = propio.valor;
    }
    const v = convertir(def.tipoDato, texto);
    cache.set(k, { valor: v, vence: Date.now() + TTL_MS });
    return v;
};

/**
 * Para lo que no debe caerse si la base no responde (el límite de intentos
 * del login): si la lectura falla, regresa `porDefecto` y lo registra.
 */
const valorSeguro = async (clave, porDefecto, req = null) => {
    try {
        return await valor(clave, req);
    } catch (error) {
        console.error(`constantes.valorSeguro(${ clave })`, error.message);
        return porDefecto;
    }
};

/** Al cambiar una constante (global: sin idEmpresa; de una empresa: con él). */
const invalidar = (idEmpresa = null) => {
    if (!idEmpresa) return cache.clear();
    for (const k of cache.keys()) if (k.startsWith(`${ idEmpresa }:`)) cache.delete(k);
};

module.exports = { valor, valorSeguro, invalidar };
