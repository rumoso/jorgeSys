// Antirrebote (análisis 005 §3): el mismo empleado no checa dos veces en
// menos de `checador.antirrebote_seg` segundos. Cuenta cualquier marcaje que
// no esté anulado, en cualquier sucursal de la empresa.
const { db } = require('../db');
const constantes = require('../constantes');

const sqlMs = (d) => d.toISOString().replace('T', ' ').replace('Z', '');

module.exports = async ({ req, solicitud, t }) => {
    const segundos = await constantes.valor('checador.antirrebote_seg', req);
    const desde = new Date(solicitud.instante.getTime() - segundos * 1000);
    const [previo] = await db.empresa(req).query(`
        SELECT idMarcaje, instante FROM marcajes
         WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado
           AND resultado <> 'ANULADO' AND instante > :desde AND instante <= :hasta
         ORDER BY instante DESC LIMIT 1`,
    { replacements: { idEmpleado: solicitud.idEmpleado, desde: sqlMs(desde), hasta: sqlMs(solicitud.instante) }, transaction: t });
    if (!previo) return { resultado: 'pasa', detalle: null };
    return {
        resultado: 'no_pasa',
        detalle: `Ya había un registro hace menos de ${ segundos } segundos`,
        dato: { idMarcajePrevio: previo.idMarcaje, segundos }
    };
};
