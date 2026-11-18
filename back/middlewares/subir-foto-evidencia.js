const multer = require('multer');
const { MAX_BYTES } = require('../helpers/evidencias');

// Foto del momento de checar (análisis 005): multipart con el campo `foto`
// (JPEG o WebP, en memoria, con tope) y el campo `datos` (JSON de la
// captura). Va aparte de middlewares/multer-config.js (fotos de empleados,
// análisis 004) porque el tope y el formato son otros. El contenido se
// revisa en helpers/evidencias.js (tipoFoto), no por la extensión.

const subir = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1, fields: 4, fieldSize: 900 * 1024 }
}).single('foto');

const subirFotoEvidencia = (req, res, next) => subir(req, res, (error) => {
    if (error) {
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'La foto es demasiado grande' : 'La captura no es válida';
        return res.json({ status_code: 1, message, data: null });
    }
    try {
        req.datos = req.body?.datos ? JSON.parse(req.body.datos) : {};
    } catch {
        return res.json({ status_code: 1, message: 'La captura no es válida', data: null });
    }
    return next();
});

module.exports = { subirFotoEvidencia };
