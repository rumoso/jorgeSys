// =============================================================================
// Checador → Por revisar (análisis 005 §4)
// =============================================================================
// Los marcajes dudosos, con su evidencia y el motivo. Quien tiene
// `marcajes_Revisar` aprueba o rechaza con motivo. Rechazar NO borra (LP-2):
// el marcaje queda ANULADO y visible, con quién, cuándo y por qué.
//
// Esta es la única escritura sobre `marcajes` fuera de helpers/marcaje.js:
// solo llena las columnas de la revisión y lleva /* revision-marcaje */
// (lo vigila scripts/auditar-marcajes.js).
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const fechas = require('../helpers/fechas');
const evidencias = require('../helpers/evidencias');
const { registrar } = require('../helpers/bitacoraChecador');

const MSG_NO_EXISTE = 'El marcaje no existe';
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Sucursales que el usuario puede ver (o la que pidió, si es suya). */
const sucursalesDe = (req, idSucursal) => {
    const id = Number(idSucursal) || null;
    return id ? req.sucursalesPermitidas.filter(s => s === id) : req.sucursalesPermitidas;
};

/** GET /api/marcajes/getPorRevisar?idSucursal=&estado=pendientes|revisados */
const getPorRevisar = async (req, res) => {
    try {
        const sucursales = sucursalesDe(req, req.query.idSucursal);
        if (!sucursales.length) return res.json({ status_code: 0, message: '0 marcaje(s)', data: [] });
        const revisados = req.query.estado === 'revisados';
        const filas = await db.empresa(req).query(`
            SELECT m.idMarcaje, m.instante, m.fechaNegocio, m.idSucursal, s.nombre AS sucursal, s.zonaHoraria,
                   m.idEmpleado, e.numeroEmpleado, CONCAT_WS(' ', e.nombre, e.apellidoPaterno, e.apellidoMaterno) AS empleado,
                   m.forma, f.nombre AS formaNombre, f.icono AS formaIcono, m.idDispositivo, d.nombre AS dispositivo,
                   m.resultado, m.motivoDuda, m.decisionRevision, m.motivoRevision, m.fechaRevision, u.nombre AS revisadoPor
              FROM marcajes m
              JOIN sucursales s ON s.idEmpresa = m.idEmpresa AND s.idSucursal = m.idSucursal
              JOIN empleados e ON e.idEmpresa = m.idEmpresa AND e.idEmpleado = m.idEmpleado
              JOIN cat_formas_checado f ON f.forma = m.forma
              LEFT JOIN dispositivos d ON d.idEmpresa = m.idEmpresa AND d.idDispositivo = m.idDispositivo
              LEFT JOIN usuarios u ON u.idUsuario = m.idUsuarioReviso
             WHERE m.idEmpresa = :idEmpresa AND m.idSucursal IN (:sucursales)
               AND ${ revisados ? 'm.decisionRevision IS NOT NULL' : "m.resultado = 'POR_REVISAR' AND m.decisionRevision IS NULL" }
             ORDER BY ${ revisados ? 'm.fechaRevision DESC' : 'm.instante' }
             LIMIT 200`, { replacements: { sucursales } });

        const ids = filas.map(f => f.idMarcaje);
        const evs = ids.length ? await db.empresa(req).query(`
            SELECT idMarcaje, tipo, dato, archivo FROM marcajes_evidencias
             WHERE idEmpresa = :idEmpresa AND idMarcaje IN (:ids) AND tipo IN ('foto', 'faceid', 'numero_empleado')`,
        { replacements: { ids } }) : [];

        // Nombres de los candidatos de una duda entre dos.
        const candidatos = new Set();
        for (const ev of evs) if (ev.tipo === 'faceid') for (const c of parse(ev.dato)?.candidatos || []) candidatos.add(Number(c.idEmpleado));
        const nombres = new Map(candidatos.size ? (await db.empresa(req).query(`
            SELECT idEmpleado, numeroEmpleado, CONCAT_WS(' ', nombre, apellidoPaterno) AS nombre FROM empleados
             WHERE idEmpresa = :idEmpresa AND idEmpleado IN (:ids)`, { replacements: { ids: [...candidatos] } }))
            .map(x => [x.idEmpleado, x]) : []);

        const data = filas.map(f => {
            const mias = evs.filter(e => e.idMarcaje === f.idMarcaje);
            const foto = mias.find(e => e.tipo === 'foto');
            const fid = parse(mias.find(e => e.tipo === 'faceid')?.dato || null);
            const num = parse(mias.find(e => e.tipo === 'numero_empleado')?.dato || null);
            return {
                ...f,
                tieneFoto: !!foto?.archivo,
                faceid: fid ? {
                    resultado: fid.resultado,
                    similitud: typeof fid.distancia === 'number' ? Math.round(Math.max(0, 1 - fid.distancia) * 100) / 100 : null,
                    candidatos: (fid.candidatos || []).map(c => ({
                        ...nombres.get(Number(c.idEmpleado)),
                        similitud: Math.round(Math.max(0, 1 - c.distancia) * 100) / 100
                    }))
                } : null,
                numeroEscrito: num?.numero || null
            };
        });
        return res.json({ status_code: 0, message: `${ data.length } marcaje(s)`, data });
    } catch (error) {
        console.error('getPorRevisar', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar los marcajes por revisar', data: null });
    }
};

/** GET /api/marcajes/getContadorPorRevisar → { total } (para el menú) */
const getContadorPorRevisar = async (req, res) => {
    try {
        const sucursales = req.sucursalesPermitidas;
        if (!sucursales.length) return res.json({ status_code: 0, message: '0', data: { total: 0 } });
        const [r] = await db.empresa(req).query(`
            SELECT COUNT(*) AS total FROM marcajes
             WHERE idEmpresa = :idEmpresa AND idSucursal IN (:sucursales)
               AND resultado = 'POR_REVISAR' AND decisionRevision IS NULL`, { replacements: { sucursales } });
        return res.json({ status_code: 0, message: String(r.total), data: { total: Number(r.total) } });
    } catch (error) {
        console.error('getContadorPorRevisar', error);
        return res.json({ status_code: 2, message: 'No fue posible contar los marcajes por revisar', data: null });
    }
};

/** El marcaje de la empresa, en una sucursal del usuario (o undefined). */
const marcajeDe = async (req, idMarcaje, t) => {
    const [m] = await db.empresa(req).query(`
        SELECT m.idMarcaje, m.idSucursal, m.idEmpleado, m.resultado, m.decisionRevision,
               CONCAT_WS(' ', e.nombre, e.apellidoPaterno) AS empleado
          FROM marcajes m JOIN empleados e ON e.idEmpresa = m.idEmpresa AND e.idEmpleado = m.idEmpleado
         WHERE m.idEmpresa = :idEmpresa AND m.idMarcaje = :idMarcaje`,
    { replacements: { idMarcaje: Number(idMarcaje) || 0 }, transaction: t });
    return m && req.sucursalesPermitidas.includes(Number(m.idSucursal)) ? m : undefined;
};

/** GET /api/marcajes/getFotoEvidencia?idMarcaje= — la imagen, solo con sesión y de la empresa. */
const getFotoEvidencia = async (req, res) => {
    try {
        const m = await marcajeDe(req, req.query.idMarcaje);
        if (!m) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        const [ev] = await db.empresa(req).query(`
            SELECT archivo FROM marcajes_evidencias
             WHERE idEmpresa = :idEmpresa AND idMarcaje = :idMarcaje AND tipo = 'foto' AND archivo IS NOT NULL
             LIMIT 1`, { replacements: { idMarcaje: m.idMarcaje } });
        if (!ev || !evidencias.existe(ev.archivo)) return res.json({ status_code: 1, message: 'La foto ya no existe (venció su plazo)', data: null });
        res.set('Cache-Control', 'private, no-store');
        res.type(evidencias.tipoContenido(ev.archivo));
        return res.sendFile(evidencias.ruta(ev.archivo));
    } catch (error) {
        console.error('getFotoEvidencia', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar la foto', data: null });
    }
};

const revisar = (decision) => async (req, res) => {
    const motivo = req.body.motivo ? String(req.body.motivo).trim().slice(0, 250) : null;
    if (decision === 'RECHAZADO' && !motivo) return res.json({ status_code: 1, message: 'Escribe el motivo del rechazo', data: null });
    try {
        const r = await db.transaccion(async (t) => {
            const m = await marcajeDe(req, req.body.idMarcaje, t);
            if (!m) return { error: MSG_NO_EXISTE };
            if (m.resultado !== 'POR_REVISAR' || m.decisionRevision) return { error: 'Ese marcaje ya se revisó' };
            const [, filas] = await db.empresa(req).query(`
                UPDATE marcajes /* revision-marcaje */
                   SET resultado = :resultado, decisionRevision = :decision, motivoRevision = :motivo,
                       idUsuarioReviso = :uid, fechaRevision = :ahora
                 WHERE idEmpresa = :idEmpresa AND idMarcaje = :idMarcaje
                   AND resultado = 'POR_REVISAR' AND decisionRevision IS NULL`, {
                replacements: { resultado: decision === 'APROBADO' ? 'ACEPTADO' : 'ANULADO', decision, motivo,
                    uid: req.uid, ahora: fechas.ahora(), idMarcaje: m.idMarcaje },
                type: QueryTypes.UPDATE, transaction: t
            });
            if (!filas) return { error: 'Ese marcaje ya se revisó' };
            await registrar(req, { tipo: decision === 'APROBADO' ? 'MARCAJE_APROBADO' : 'MARCAJE_RECHAZADO',
                idSucursal: m.idSucursal, idEmpleado: m.idEmpleado, idMarcaje: m.idMarcaje,
                descripcion: `Marcaje de ${ m.empleado } ${ decision === 'APROBADO' ? 'aprobado' : 'rechazado' }${ motivo ? `: ${ motivo }` : '' }`,
                antes: { resultado: 'POR_REVISAR' }, despues: { resultado: decision === 'APROBADO' ? 'ACEPTADO' : 'ANULADO', motivo } }, t);
            return { id: m.idMarcaje, empleado: m.empleado };
        });
        if (r.error) return res.json({ status_code: 1, message: r.error, data: null });
        return res.json({
            status_code: 0,
            message: decision === 'APROBADO' ? `Marcaje de ${ r.empleado } aprobado` : `Marcaje de ${ r.empleado } rechazado; queda anulado y visible`,
            data: { id: r.id }
        });
    } catch (error) {
        console.error('revisarMarcaje', error);
        return res.json({ status_code: 2, message: 'No fue posible guardar la revisión', data: null });
    }
};

/** PUT /api/marcajes/aprobarMarcaje { idMarcaje, motivo? } */
const aprobarMarcaje = revisar('APROBADO');
/** PUT /api/marcajes/rechazarMarcaje { idMarcaje, motivo } — nunca borra. */
const rechazarMarcaje = revisar('RECHAZADO');

module.exports = { getPorRevisar, getContadorPorRevisar, getFotoEvidencia, aprobarMarcaje, rechazarMarcaje };
