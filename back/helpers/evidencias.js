// =============================================================================
// Fotos de evidencia de los marcajes (análisis 005 §3)
// =============================================================================
// Se guardan fuera de `public/`, en `almacen/evidencias/<idEmpresa>/`, con
// nombre aleatorio, y se entregan solo con sesión y dentro de la empresa
// (controllers/marcajes.js). Duran `evidencia.dias_foto` días: la tarea
// diaria (helpers/tareaFotosVencidas.js) borra el archivo y deja el marcaje.
// =============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(process.env.ALMACEN_DIR || path.join(__dirname, '..', 'almacen'));
const MAX_BYTES = 400 * 1024;

/** JPEG o WebP, revisando el contenido (no la extensión). Regresa la extensión o null. */
const tipoFoto = (buf) => {
    if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.length > MAX_BYTES) return null;
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
};

const ruta = (archivo) => {
    const abs = path.resolve(RAIZ, archivo);
    if (!abs.startsWith(RAIZ + path.sep)) throw new Error('[evidencias] ruta fuera del almacén');
    return abs;
};

/** Guarda la foto y regresa el nombre relativo ('evidencias/12/ab…cd.jpg'), o null si no es válida. */
const guardarFoto = async (idEmpresa, buf) => {
    const ext = tipoFoto(buf);
    if (!ext) return null;
    const archivo = `evidencias/${ Number(idEmpresa) }/${ crypto.randomBytes(16).toString('hex') }.${ ext }`;
    const abs = ruta(archivo);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, buf, { flag: 'wx' });
    return archivo;
};

/** Borra el archivo; si ya no existe, no es error. */
const borrarFoto = async (archivo) => {
    if (!archivo) return;
    try { await fs.promises.unlink(ruta(archivo)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
};

/** Baja definitiva de la empresa (009, LP-5): borra toda su carpeta de evidencias. */
const borrarEmpresa = async (idEmpresa) => {
    const id = Number(idEmpresa);
    if (!Number.isInteger(id) || id <= 0) throw new Error('[evidencias] idEmpresa inválido');
    await fs.promises.rm(ruta(`evidencias/${ id }`), { recursive: true, force: true });
};

const existe = (archivo) => !!archivo && fs.existsSync(ruta(archivo));

const tipoContenido = (archivo) => (String(archivo).endsWith('.webp') ? 'image/webp' : 'image/jpeg');

module.exports = { RAIZ, MAX_BYTES, tipoFoto, ruta, guardarFoto, borrarFoto, borrarEmpresa, existe, tipoContenido };
