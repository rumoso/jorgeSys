// =============================================================================
// Subida de archivos (análisis 004: foto del empleado y Excel de la alta masiva)
// =============================================================================
// Toda subida pasa por aquí:
//   - en memoria (multer.memoryStorage): nada se escribe sin validar;
//   - un solo archivo por petición, en el campo `archivo`;
//   - tope de tamaño leído de una constante del sistema (helpers/constantes.js);
//   - el TIPO se decide por el contenido (firma del archivo), no por la
//     extensión ni por el Content-Type que manda el navegador.
//
//     router.post('/setFotoEmpleado', [validarJWT, validarAccion('…'),
//         subirArchivo('imagen'), check(…), validarCamposStatusCode], ctrl);
//
// Deja `req.archivo = { buffer, ext, mime, nombreOriginal, bytes }`. Los
// errores responden { status_code: 1 } con HTTP 200, como todo el API.
// =============================================================================

const multer = require('multer');
const constantes = require('../helpers/constantes');

const TIPOS = {
    imagen: {
        constante: 'archivos.foto_max_mb', porDefecto: 5,
        descripcion: 'una imagen JPG, PNG o WebP',
        detectar: (b) => {
            if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
            if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', mime: 'image/png' };
            if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
            return null;
        }
    },
    excel: {
        constante: 'archivos.excel_max_mb', porDefecto: 5,
        descripcion: 'un archivo de Excel (.xlsx)',
        // .xlsx es un ZIP: empieza con "PK\x03\x04". El contenido lo revisa exceljs al leerlo.
        detectar: (b) => (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04
            ? { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : null)
    }
};

const no = (res, message) => res.json({ status_code: 1, message, data: { codigo: 'ARCHIVO_INVALIDO' } });

/** Middleware que recibe UN archivo del tipo indicado ('imagen' o 'excel'). */
const subirArchivo = (tipo) => {
    const def = TIPOS[tipo];
    if (!def) throw new Error(`[multer-config] Tipo de archivo desconocido: ${ tipo }`);
    return async (req, res, next) => {
        let maxMb;
        try {
            maxMb = await constantes.valorSeguro(def.constante, def.porDefecto, req);
        } catch {
            maxMb = def.porDefecto;
        }
        const recibir = multer({
            storage: multer.memoryStorage(),
            limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 20 }
        }).single('archivo');

        recibir(req, res, (error) => {
            if (error) {
                if (error.code === 'LIMIT_FILE_SIZE') return no(res, `El archivo pesa más de ${ maxMb } MB`);
                if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') return no(res, 'Manda un solo archivo, en el campo "archivo"');
                console.error('subirArchivo', error);
                return no(res, 'No fue posible recibir el archivo');
            }
            if (!req.file?.buffer?.length) return no(res, `Escoge ${ def.descripcion }`);
            const detectado = def.detectar(req.file.buffer);
            if (!detectado) return no(res, `El archivo no es ${ def.descripcion }`);
            req.archivo = {
                buffer: req.file.buffer, ...detectado,
                nombreOriginal: String(req.file.originalname || '').slice(0, 200), bytes: req.file.size
            };
            return next();
        });
    };
};

module.exports = { subirArchivo };
