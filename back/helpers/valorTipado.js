// =============================================================================
// Valores con tipo (análisis 003)
// =============================================================================
// Los ajustes de la empresa y las constantes del sistema se guardan como
// texto y se describen en su catálogo con `tipoDato`, `opciones` y
// `validacion`. Esta es la ÚNICA pieza que convierte y valida: la usan
// helpers/configuracion.js, helpers/constantes.js y sus controladores. La
// validación del Front solo es ayuda.
//
//   validar(def, entrada)  → { ok: true, texto } | { ok: false, mensaje }
//       `texto` es lo que se guarda. El mensaje dice el rango o las opciones.
//   convertir(tipoDato, texto) → el valor en su tipo (número, booleano…)
//
// `validacion` admite: min, max (números; en fecha y hora, del mismo
// formato), unidad (solo para el mensaje), maxLength, patron (texto) y
// multiple (lista con varias opciones; se guarda como JSON).
// =============================================================================

const TIPOS = ['entero', 'decimal', 'texto', 'booleano', 'fecha', 'hora', 'lista'];

const json = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return null; }
};

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

const fechaValida = (s) => {
    const m = RE_FECHA.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** El valor guardado (texto) en su tipo. `null` se queda en `null`. */
const convertir = (tipoDato, texto) => {
    if (texto === null || texto === undefined) return null;
    switch (tipoDato) {
        case 'entero': return parseInt(texto, 10);
        case 'decimal': return Number(texto);
        case 'booleano': return texto === '1' || texto === 'true';
        case 'lista': {
            const v = json(texto);
            return Array.isArray(v) ? v.map(String) : String(texto);
        }
        default: return String(texto);   // texto, fecha (YYYY-MM-DD), hora (HH:mm)
    }
};

const rango = (v) => {
    const u = v.unidad ? ` ${ v.unidad }` : '';
    if (v.min !== undefined && v.max !== undefined) return `entre ${ v.min } y ${ v.max }${ u }`;
    if (v.min !== undefined) return `de al menos ${ v.min }${ u }`;
    return `de máximo ${ v.max }${ u }`;
};

/**
 * Revisa `entrada` contra la definición de un ajuste o constante
 * ({ etiqueta, tipoDato, opciones, validacion }) y regresa el texto a guardar.
 */
const validar = (def, entrada) => {
    const nombre = `"${ def.etiqueta || def.clave }"`;
    const v = json(def.validacion) || {};
    const opciones = json(def.opciones);
    const mal = (mensaje) => ({ ok: false, mensaje });

    if (!TIPOS.includes(def.tipoDato)) return mal(`${ nombre } tiene un tipo desconocido`);
    if (entrada === null || entrada === undefined || (typeof entrada === 'string' && entrada.trim() === '')) {
        return mal(`Escribe un valor para ${ nombre }`);
    }
    if (typeof entrada === 'object' && !(def.tipoDato === 'lista' && Array.isArray(entrada))) {
        return mal(`${ nombre } no admite ese tipo de valor`);
    }

    let texto;
    switch (def.tipoDato) {
        case 'entero': {
            const s = String(entrada).trim();
            if (!/^-?\d+$/.test(s)) return mal(`${ nombre } debe ser un número entero`);
            texto = String(parseInt(s, 10));
            break;
        }
        case 'decimal': {
            const s = String(entrada).trim();
            if (!/^-?\d+(\.\d+)?$/.test(s)) return mal(`${ nombre } debe ser un número`);
            texto = String(Number(s));
            break;
        }
        case 'booleano': {
            if ([true, 1, '1', 'true'].includes(entrada)) texto = '1';
            else if ([false, 0, '0', 'false'].includes(entrada)) texto = '0';
            else return mal(`${ nombre } debe ser sí o no`);
            break;
        }
        case 'fecha': {
            texto = String(entrada).trim();
            if (!fechaValida(texto)) return mal(`${ nombre } debe ser una fecha válida (AAAA-MM-DD)`);
            break;
        }
        case 'hora': {
            texto = String(entrada).trim();
            if (!RE_HORA.test(texto)) return mal(`${ nombre } debe ser una hora válida (HH:MM, de 00:00 a 23:59)`);
            break;
        }
        case 'lista': {
            if (v.multiple) {
                if (!Array.isArray(entrada)) return mal(`${ nombre } debe ser una lista`);
                texto = JSON.stringify([...new Set(entrada.map(String))]);
            } else {
                if (Array.isArray(entrada)) return mal(`${ nombre } admite una sola opción`);
                texto = String(entrada);
            }
            break;
        }
        default: {
            texto = String(entrada).trim();
        }
    }

    // Opciones fijas (radio, combo, lista): solo valen las del catálogo.
    if (Array.isArray(opciones) && opciones.length) {
        const validas = new Set(opciones.map(o => String(o.valor)));
        const escogidas = def.tipoDato === 'lista' && v.multiple ? JSON.parse(texto) : [texto];
        const fuera = escogidas.filter(x => !validas.has(x));
        if (fuera.length) return mal(`${ nombre } debe ser una de: ${ opciones.map(o => o.texto).join(', ') }`);
    }

    // Rangos.
    if (['entero', 'decimal'].includes(def.tipoDato)) {
        const n = Number(texto);
        if ((v.min !== undefined && n < v.min) || (v.max !== undefined && n > v.max)) {
            return mal(`${ nombre } debe estar ${ rango(v) }`);
        }
    }
    if (['fecha', 'hora'].includes(def.tipoDato)) {
        if ((v.min && texto < v.min) || (v.max && texto > v.max)) return mal(`${ nombre } debe estar ${ rango(v) }`);
    }
    if (def.tipoDato === 'texto') {
        if (v.maxLength && texto.length > v.maxLength) return mal(`${ nombre } admite hasta ${ v.maxLength } caracteres`);
        if (v.patron && !new RegExp(v.patron).test(texto)) return mal(`${ nombre } no tiene el formato correcto`);
    }
    if (texto.length > 2000) return mal(`${ nombre } es demasiado largo`);

    return { ok: true, texto };
};

module.exports = { validar, convertir, TIPOS };
