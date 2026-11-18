// Face ID como verificación (análisis 005 §3). La identificación la hace el
// adaptador de la forma (controllers/checador.js con helpers/faceid.js) y
// llega como evidencia de tipo 'faceid'. Aquí solo se interpreta:
//
//   IDENTIFICADO            el mejor pasó el umbral y el segundo quedó lejos → pasa
//   CONFIRMADO_CON_NUMERO   duda entre dos y el número es uno de ellos       → pasa
//   DUDA_NO_RESUELTA        duda entre dos y el número es de otro            → dudosa
//   SOLO_NUMERO             checó con su número tras no ser reconocido       → dudosa
//   cualquier otra cosa o sin evidencia                                      → no pasa
module.exports = async ({ solicitud }) => {
    const ev = (solicitud.evidencias || []).find(e => e.tipo === 'faceid');
    const d = ev?.dato;
    if (!d) return { resultado: 'no_pasa', detalle: 'Falta la identificación del rostro' };
    switch (d.resultado) {
        case 'IDENTIFICADO':
            return { resultado: 'pasa', detalle: null };
        case 'CONFIRMADO_CON_NUMERO':
            return { resultado: 'pasa', detalle: 'Confirmado con el número de empleado' };
        case 'DUDA_NO_RESUELTA':
            return { resultado: 'dudosa', detalle: 'El rostro se parecía a dos personas y el número escrito es de otra' };
        case 'SOLO_NUMERO':
            return { resultado: 'dudosa', detalle: `Checó con su número de empleado tras ${ d.intentos ?? 'varios' } intentos sin reconocer` };
        default:
            return { resultado: 'no_pasa', detalle: 'El rostro no se reconoció' };
    }
};
