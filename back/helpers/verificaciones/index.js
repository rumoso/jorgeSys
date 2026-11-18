// =============================================================================
// Verificaciones enchufables del proceso de marcaje (análisis 005 §3)
// =============================================================================
// Una verificación revisa UNA cosa y responde:
//
//     { resultado: 'pasa' | 'no_pasa' | 'dudosa', detalle: '…', dato?: {…} }
//
// Recibe el contexto del marcaje: { req, solicitud, empleado, zona, t }
// (t = la transacción del marcaje). La política dice cuáles corren para cada
// forma (cat_formas_checado.verificaciones). Una verificación nueva es un
// archivo en esta carpeta y su renglón en el registro de abajo; el proceso
// (helpers/marcaje.js) no cambia.
// =============================================================================

const REGISTRO = {
    antirrebote: require('./antirrebote'),
    faceid: require('./faceid')
};

const RESULTADOS = ['pasa', 'no_pasa', 'dudosa'];

/** Registra una verificación (la usan las pruebas y las formas nuevas). */
const registrar = (nombre, fn) => { REGISTRO[nombre] = fn; };

/**
 * Corre las verificaciones en orden. Se detiene en la primera que no pasa.
 * Regresa [{ verificacion, resultado, detalle, dato }].
 */
const correr = async (nombres, ctx) => {
    const salida = [];
    for (const nombre of nombres) {
        const fn = REGISTRO[nombre];
        if (!fn) throw new Error(`[verificaciones] No existe la verificación "${ nombre }"`);
        const r = await fn(ctx);
        if (!r || !RESULTADOS.includes(r.resultado)) throw new Error(`[verificaciones] "${ nombre }" respondió algo inválido`);
        salida.push({ verificacion: nombre, resultado: r.resultado, detalle: r.detalle || null, dato: r.dato ?? null });
        if (r.resultado === 'no_pasa') break;
    }
    return salida;
};

module.exports = { correr, registrar, existe: (n) => !!REGISTRO[n] };
