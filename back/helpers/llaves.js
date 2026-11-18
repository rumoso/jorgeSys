// =============================================================================
// Código de vinculación y llave del dispositivo checador (análisis 005 §5)
// =============================================================================
// - Código: 8 caracteres, sin los que se confunden (0/O, 1/I/L), un solo
//   uso, vence en minutos. Se muestra una vez (con su QR) en la pantalla del
//   administrador; se guarda solo su hash.
// - Llave: 32 bytes aleatorios (base64url). Se entrega una sola vez al
//   dispositivo, viaja en el encabezado `x-dispositivo` (nunca en la URL) y
//   se guarda solo su hash. NO es un JWT (helpers/jwt.js es solo para la
//   sesión): revocar aplica en la siguiente petición y no depende de una
//   vigencia.
// =============================================================================

const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 8;
const RE_CODIGO = new RegExp(`^[${ ALFABETO }]{6,8}$`);

const hash = (texto) => crypto.createHash('sha256').update(String(texto)).digest('hex');

const generarCodigo = () => Array.from({ length: LARGO_CODIGO }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

/** Lo que escribió la persona: sin espacios ni guiones, en mayúsculas. */
const normalizarCodigo = (texto) => String(texto || '').toUpperCase().replace(/[\s-]/g, '');

const codigoConForma = (c) => RE_CODIGO.test(c);

const generarLlave = () => crypto.randomBytes(32).toString('base64url');

module.exports = { hash, generarCodigo, normalizarCodigo, codigoConForma, generarLlave, LARGO_CODIGO };
