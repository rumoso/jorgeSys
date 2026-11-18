// =============================================================================
// Almacén de archivos de las empresas (análisis 004)
// =============================================================================
// Fuera de `public/`: nada de aquí se sirve como estático. Cada archivo se
// entrega por un endpoint que valida sesión, empresa y alcance.
//
//   back/almacen/empresas/<idEmpresa>/<carpeta>/<nombre aleatorio>.<ext>
//
// La carpeta de la empresa sale SIEMPRE de req.idEmpresa (LP-1) y el nombre
// lo genera el servidor; lo que viene del navegador nunca arma una ruta.
// =============================================================================

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const RAIZ = process.env.ALMACEN_DIR || path.join(__dirname, '..', 'almacen');
const RE_NOMBRE = /^[a-f0-9]{32}\.(jpg|png|webp|xlsx)$/;
// 009: 'exportaciones' guarda la exportación completa de la baja.
const CARPETAS = new Set(['empleados', 'exportaciones']);

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

const carpeta = (req, nombreCarpeta) => {
    const idEmpresa = Number(req.idEmpresa);
    if (!Number.isInteger(idEmpresa) || idEmpresa <= 0) throw new Error('[archivos] sin req.idEmpresa');
    if (!CARPETAS.has(nombreCarpeta)) throw new Error(`[archivos] carpeta desconocida: ${ nombreCarpeta }`);
    return path.join(RAIZ, 'empresas', String(idEmpresa), nombreCarpeta);
};

const ruta = (req, nombreCarpeta, nombre) => {
    if (!RE_NOMBRE.test(String(nombre))) throw new Error('[archivos] nombre de archivo inválido');
    return path.join(carpeta(req, nombreCarpeta), nombre);
};

/** Guarda el buffer con un nombre aleatorio y regresa ese nombre. */
const guardar = async (req, nombreCarpeta, buffer, ext) => {
    const dir = carpeta(req, nombreCarpeta);
    await fs.mkdir(dir, { recursive: true });
    const nombre = `${ crypto.randomBytes(16).toString('hex') }.${ ext }`;
    await fs.writeFile(path.join(dir, nombre), buffer, { flag: 'wx' });
    return nombre;
};

/**
 * Para escribir en flujo (archivos grandes, 009): crea la carpeta y regresa
 * { nombre, ruta } con un nombre aleatorio.
 */
const rutaNueva = async (req, nombreCarpeta, ext) => {
    await fs.mkdir(carpeta(req, nombreCarpeta), { recursive: true });
    const nombre = `${ crypto.randomBytes(16).toString('hex') }.${ ext }`;
    return { nombre, ruta: ruta(req, nombreCarpeta, nombre) };
};

/** Lee un archivo: { buffer, mime } o null si no existe. */
const leer = async (req, nombreCarpeta, nombre) => {
    try {
        const buffer = await fs.readFile(ruta(req, nombreCarpeta, nombre));
        return { buffer, mime: MIME[nombre.split('.').pop()] || 'application/octet-stream' };
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
};

/** Borra un archivo; si ya no estaba, no pasa nada. */
const borrar = async (req, nombreCarpeta, nombre) => {
    if (!nombre) return;
    try {
        await fs.unlink(ruta(req, nombreCarpeta, nombre));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('archivos.borrar', e.message);
    }
};

/** Tamaño en bytes de un archivo guardado (o null si no existe). */
const tamano = async (req, nombreCarpeta, nombre) => {
    try {
        return (await fs.stat(ruta(req, nombreCarpeta, nombre))).size;
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
};

/**
 * Baja definitiva de la empresa (009, LP-5): borra TODA su carpeta,
 * almacen/empresas/<idEmpresa>/. Si no existía, no pasa nada.
 */
const borrarEmpresa = async (idEmpresa) => {
    const id = Number(idEmpresa);
    if (!Number.isInteger(id) || id <= 0) throw new Error('[archivos] idEmpresa inválido');
    await fs.rm(path.join(RAIZ, 'empresas', String(id)), { recursive: true, force: true });
};

module.exports = { guardar, rutaNueva, rutaDe: ruta, leer, tamano, borrar, borrarEmpresa, RAIZ };
