// =============================================================================
// Segundo factor del panel (análisis 009): TOTP, RFC 6238
// =============================================================================
// Sin dependencias: solo `crypto`. Códigos de 6 dígitos, pasos de 30 s y un
// paso de tolerancia hacia cada lado (reloj del celular adelantado o atrasado).
//
//   const secreto = totp.generarSecreto();          // base32, para la app
//   totp.direccion(secreto, correo)                 // otpauth://… (QR)
//   const guardado = totp.cifrar(secreto);          // lo que va a superadmins.totpSecreto
//   const paso = totp.verificar(totp.descifrar(guardado), codigo, cuenta.totpUltimoPaso);
//
// `verificar` regresa el paso aceptado (para guardarlo en totpUltimoPaso) o
// null. Un paso igual o anterior al último aceptado no se acepta: el mismo
// código no sirve dos veces. Quien lo guarda debe hacerlo con
// `WHERE totpUltimoPaso IS NULL OR totpUltimoPaso < :paso` para que dos
// peticiones al mismo tiempo no entren con el mismo código.
//
// El secreto se guarda cifrado con AES-256-GCM y la llave PANEL_TOTP_KEY del
// .env (32 bytes en hexadecimal o base64).
// =============================================================================

const crypto = require('crypto');

const PERIODO_S = 30;
const DIGITOS = 6;
const TOLERANCIA = 1;
const EMISOR = 'Truck Manager Panel';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const aBase32 = (buf) => {
    let bits = 0, valor = 0, out = '';
    for (const byte of buf) {
        valor = ((valor << 8) | byte) & 0xffff;
        bits += 8;
        while (bits >= 5) {
            out += BASE32[(valor >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += BASE32[(valor << (5 - bits)) & 31];
    return out;
};

const deBase32 = (texto) => {
    const limpio = String(texto || '').toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0, valor = 0;
    const out = [];
    for (const c of limpio) {
        const i = BASE32.indexOf(c);
        if (i < 0) throw new Error('[totp] Secreto base32 inválido');
        valor = ((valor << 5) | i) & 0xffff;
        bits += 5;
        if (bits >= 8) {
            out.push((valor >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
};

/** Secreto nuevo de 160 bits en base32 (lo que se escribe en la app). */
const generarSecreto = () => aBase32(crypto.randomBytes(20));

/** Dirección otpauth:// para el código QR de la app de autenticación. */
const direccion = (secreto, cuenta, emisor = EMISOR) =>
    `otpauth://totp/${ encodeURIComponent(`${ emisor }:${ cuenta }`) }?secret=${ secreto }`
    + `&issuer=${ encodeURIComponent(emisor) }&algorithm=SHA1&digits=${ DIGITOS }&period=${ PERIODO_S }`;

/** Paso de 30 s de un instante (milisegundos UTC). */
const pasoDe = (ms = Date.now()) => Math.floor(ms / 1000 / PERIODO_S);

/** Código de 6 dígitos de un paso (RFC 4226 sobre el contador del RFC 6238). */
const codigoDe = (secreto, paso) => {
    const contador = Buffer.alloc(8);
    contador.writeBigUInt64BE(BigInt(paso));
    const hmac = crypto.createHmac('sha1', deBase32(secreto)).update(contador).digest();
    const o = hmac[hmac.length - 1] & 0x0f;
    const n = ((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3];
    return String(n % 10 ** DIGITOS).padStart(DIGITOS, '0');
};

/** Código vigente ahora (para el script de instalación y las pruebas). */
const codigoActual = (secreto, ms = Date.now()) => codigoDe(secreto, pasoDe(ms));

const iguales = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Paso aceptado o null. `ultimoPaso` (totpUltimoPaso) evita aceptar dos
 * veces el mismo código o uno anterior.
 */
const verificar = (secreto, codigo, ultimoPaso = null, ms = Date.now()) => {
    const limpio = String(codigo ?? '').replace(/\s+/g, '');
    if (!new RegExp(`^\\d{${ DIGITOS }}$`).test(limpio) || !secreto) return null;
    const actual = pasoDe(ms);
    const minimo = ultimoPaso === null || ultimoPaso === undefined ? -Infinity : Number(ultimoPaso) + 1;
    for (let d = -TOLERANCIA; d <= TOLERANCIA; d++) {
        const paso = actual + d;
        if (paso < minimo) continue;
        if (iguales(codigoDe(secreto, paso), limpio)) return paso;
    }
    return null;
};

// ── Cifrado del secreto ──────────────────────────────────────────────────────

const llave = () => {
    const texto = String(process.env.PANEL_TOTP_KEY || '').trim();
    const buf = /^[0-9a-f]{64}$/i.test(texto) ? Buffer.from(texto, 'hex') : Buffer.from(texto, 'base64');
    if (buf.length !== 32) throw new Error('[totp] PANEL_TOTP_KEY debe ser de 32 bytes (64 caracteres hex o base64)');
    return buf;
};

/** `v1:iv:etiqueta:cifrado` (base64url). */
const cifrar = (secreto) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', llave(), iv);
    const cifrado = Buffer.concat([c.update(String(secreto), 'utf8'), c.final()]);
    return ['v1', iv, c.getAuthTag(), cifrado].map(x => (Buffer.isBuffer(x) ? x.toString('base64url') : x)).join(':');
};

const descifrar = (guardado) => {
    const [version, iv, etiqueta, cifrado] = String(guardado || '').split(':');
    if (version !== 'v1' || !iv || !etiqueta || !cifrado) throw new Error('[totp] Secreto guardado con formato desconocido');
    const d = crypto.createDecipheriv('aes-256-gcm', llave(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(cifrado, 'base64url')), d.final()]).toString('utf8');
};

module.exports = { generarSecreto, direccion, verificar, codigoActual, pasoDe, cifrar, descifrar, PERIODO_S };
