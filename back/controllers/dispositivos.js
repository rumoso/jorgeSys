// =============================================================================
// Checador → Dispositivos (análisis 005 §5), con sesión del administrador.
// =============================================================================
// El dispositivo nunca escoge su sucursal: la escoge aquí el administrador,
// entre las que tiene permitidas, y el código solo le entrega esa decisión.
// Un dispositivo no se mueve de sucursal: se revoca y se vincula otro.
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const fechas = require('../helpers/fechas');
const constantes = require('../helpers/constantes');
const { hash, generarCodigo } = require('../helpers/llaves');
const { registrar } = require('../helpers/bitacoraChecador');

const MSG_NO_EXISTE = 'El dispositivo no existe';

const permitida = (req, idSucursal) => req.sucursalesPermitidas.includes(Number(idSucursal));

/** El dispositivo de la empresa, dentro de las sucursales del usuario (o undefined). */
const dispositivoDe = async (req, idDispositivo) => {
    const [d] = await db.empresa(req).query(`
        SELECT d.idDispositivo, d.idSucursal, d.nombre, d.estado, s.nombre AS sucursal
          FROM dispositivos d
          JOIN sucursales s ON s.idEmpresa = d.idEmpresa AND s.idSucursal = d.idSucursal
         WHERE d.idEmpresa = :idEmpresa AND d.idDispositivo = :idDispositivo`,
    { replacements: { idDispositivo: Number(idDispositivo) } });
    return d && permitida(req, d.idSucursal) ? d : undefined;
};

/** Código nuevo para un pendiente: lo regresa en claro una sola vez. */
const nuevoCodigo = async (req, idDispositivo, t) => {
    const minutos = await constantes.valor('checador.codigo_vigencia_min', req);
    const vence = new Date(fechas.ahora().getTime() + minutos * 60 * 1000);
    for (let intento = 0; intento < 5; intento++) {
        const codigo = generarCodigo();
        try {
            await db.empresa(req).query(`
                UPDATE dispositivos SET codigoHash = :codigoHash, codigoVence = :vence
                 WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo AND estado = 'PENDIENTE'`,
            { replacements: { codigoHash: hash(codigo), vence, idDispositivo }, type: QueryTypes.UPDATE, transaction: t });
            return { codigo, vence: vence.toISOString(), segundosVigencia: minutos * 60 };
        } catch (e) {
            if (e?.original?.errno !== 1062) throw e;   // choque de código (rarísimo): otro
        }
    }
    throw new Error('No fue posible generar un código único');
};

/** GET /api/dispositivos/getDispositivos?idSucursal= */
const getDispositivos = async (req, res) => {
    try {
        const idSucursal = req.query.idSucursal ? Number(req.query.idSucursal) : null;
        const sucursales = idSucursal ? req.sucursalesPermitidas.filter(s => s === idSucursal) : req.sucursalesPermitidas;
        if (!sucursales.length) return res.json({ status_code: 0, message: '0 dispositivo(s)', data: [] });
        const ahora = fechas.ahora();
        const minSinConexion = await constantes.valor('checador.sin_conexion_min', req);
        const limite = new Date(ahora.getTime() - minSinConexion * 60 * 1000);
        const data = await db.empresa(req).query(`
            SELECT d.idDispositivo, d.idSucursal, s.nombre AS sucursal, s.zonaHoraria, d.nombre, d.estado,
                   d.codigoVence, d.fechaVinculacion, d.ultimaConexion, d.ultimoMarcaje, d.versionFront,
                   d.fechaRevocacion, d.fechaAlta,
                   (d.estado = 'PENDIENTE' AND d.codigoVence > :ahora) AS bCodigoVigente,
                   (d.estado = 'VINCULADO' AND (d.ultimaConexion IS NULL OR d.ultimaConexion < :limite)) AS bSinConexion
              FROM dispositivos d
              JOIN sucursales s ON s.idEmpresa = d.idEmpresa AND s.idSucursal = d.idSucursal
             WHERE d.idEmpresa = :idEmpresa AND d.idSucursal IN (:sucursales)
             ORDER BY s.nombre, FIELD(d.estado, 'VINCULADO', 'PENDIENTE', 'REVOCADO'), d.nombre`,
        { replacements: { ahora, limite, sucursales } });
        return res.json({ status_code: 0, message: `${ data.length } dispositivo(s)`, data: data.map(d => ({
            ...d, bCodigoVigente: !!Number(d.bCodigoVigente), bSinConexion: !!Number(d.bSinConexion)
        })) });
    } catch (error) {
        console.error('getDispositivos', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar los dispositivos', data: null });
    }
};

/** POST /api/dispositivos/insertDispositivo { idSucursal, nombre } → { id, codigo, vence, segundosVigencia } */
const insertDispositivo = async (req, res) => {
    const idSucursal = Number(req.body.idSucursal);
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    try {
        if (!permitida(req, idSucursal)) return res.json({ status_code: 1, message: 'La sucursal no existe', data: null });
        const data = await db.transaccion(async (t) => {
            const [id] = await db.empresa(req).query(`
                INSERT INTO dispositivos (idEmpresa, idSucursal, nombre, estado, idUsuarioCreo)
                VALUES (:idEmpresa, :idSucursal, :nombre, 'PENDIENTE', :uid)`,
            { replacements: { idSucursal, nombre, uid: req.uid }, type: QueryTypes.INSERT, transaction: t });
            const codigo = await nuevoCodigo(req, id, t);
            await registrar(req, { tipo: 'DISPOSITIVO_CREADO', idSucursal, idDispositivo: id,
                descripcion: `Dispositivo "${ nombre }" creado; pendiente de vincular`, despues: { nombre, idSucursal } }, t);
            return { id, ...codigo };
        });
        return res.json({ status_code: 0, message: 'Dispositivo agregado. Vincúlalo con el código antes de que venza.', data });
    } catch (error) {
        console.error('insertDispositivo', error);
        return res.json({ status_code: 2, message: 'No fue posible agregar el dispositivo', data: null });
    }
};

/** POST /api/dispositivos/regenerarCodigo { idDispositivo } */
const regenerarCodigo = async (req, res) => {
    try {
        const d = await dispositivoDe(req, req.body.idDispositivo);
        if (!d) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        if (d.estado !== 'PENDIENTE') return res.json({ status_code: 1, message: 'Solo un dispositivo pendiente recibe un código nuevo', data: null });
        const data = await db.transaccion(async (t) => {
            const codigo = await nuevoCodigo(req, d.idDispositivo, t);
            await registrar(req, { tipo: 'CODIGO_REGENERADO', idSucursal: d.idSucursal, idDispositivo: d.idDispositivo,
                descripcion: `Código nuevo para "${ d.nombre }"` }, t);
            return { id: d.idDispositivo, ...codigo };
        });
        return res.json({ status_code: 0, message: 'Código nuevo generado; el anterior ya no sirve', data });
    } catch (error) {
        console.error('regenerarCodigo', error);
        return res.json({ status_code: 2, message: 'No fue posible generar el código', data: null });
    }
};

/** DELETE /api/dispositivos/deleteDispositivoPendiente { idDispositivo } — solo pendientes: nunca checaron. */
const deleteDispositivoPendiente = async (req, res) => {
    try {
        const d = await dispositivoDe(req, req.body.idDispositivo);
        if (!d) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        if (d.estado !== 'PENDIENTE') {
            return res.json({ status_code: 1, message: 'Solo se elimina un dispositivo pendiente; uno vinculado se revoca', data: null });
        }
        await db.transaccion(async (t) => {
            await db.empresa(req).query(
                "DELETE FROM dispositivos WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo AND estado = 'PENDIENTE'",
                { replacements: { idDispositivo: d.idDispositivo }, type: QueryTypes.DELETE, transaction: t });
            await registrar(req, { tipo: 'DISPOSITIVO_ELIMINADO', idSucursal: d.idSucursal,
                descripcion: `Dispositivo pendiente "${ d.nombre }" eliminado`, antes: { idDispositivo: d.idDispositivo, nombre: d.nombre } }, t);
        });
        return res.json({ status_code: 0, message: `Dispositivo "${ d.nombre }" eliminado`, data: { id: d.idDispositivo } });
    } catch (error) {
        if (error?.original?.errno === 1451) {
            return res.json({ status_code: 1, message: 'No es posible eliminar porque se utiliza en otras tablas', data: null });
        }
        console.error('deleteDispositivoPendiente', error);
        return res.json({ status_code: 2, message: 'No fue posible eliminar el dispositivo', data: null });
    }
};

/** PUT /api/dispositivos/revocarDispositivo { idDispositivo } — deja de servir en el siguiente intento. */
const revocarDispositivo = async (req, res) => {
    try {
        const d = await dispositivoDe(req, req.body.idDispositivo);
        if (!d) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        if (d.estado !== 'VINCULADO') return res.json({ status_code: 1, message: 'Solo se revoca un dispositivo vinculado', data: null });
        await db.transaccion(async (t) => {
            await db.empresa(req).query(`
                UPDATE dispositivos SET estado = 'REVOCADO', fechaRevocacion = :ahora, idUsuarioRevoco = :uid
                 WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo`,
            { replacements: { ahora: fechas.ahora(), uid: req.uid, idDispositivo: d.idDispositivo }, type: QueryTypes.UPDATE, transaction: t });
            await registrar(req, { tipo: 'DISPOSITIVO_REVOCADO', idSucursal: d.idSucursal, idDispositivo: d.idDispositivo,
                descripcion: `Dispositivo "${ d.nombre }" revocado` }, t);
        });
        return res.json({ status_code: 0, message: `Dispositivo "${ d.nombre }" revocado: ya no puede checar`, data: { id: d.idDispositivo } });
    } catch (error) {
        console.error('revocarDispositivo', error);
        return res.json({ status_code: 2, message: 'No fue posible revocar el dispositivo', data: null });
    }
};

/** GET /api/dispositivos/getEstadoVinculacion?idDispositivo= — consulta corta mientras el código está en pantalla. */
const getEstadoVinculacion = async (req, res) => {
    try {
        const d = await dispositivoDe(req, req.query.idDispositivo);
        if (!d) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        const [x] = await db.empresa(req).query(`
            SELECT estado, codigoVence, fechaVinculacion FROM dispositivos
             WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo`,
        { replacements: { idDispositivo: d.idDispositivo } });
        return res.json({ status_code: 0, message: x.estado === 'VINCULADO' ? 'Vinculado' : 'Pendiente', data: { id: d.idDispositivo, ...x } });
    } catch (error) {
        console.error('getEstadoVinculacion', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar el dispositivo', data: null });
    }
};

module.exports = { getDispositivos, insertDispositivo, regenerarCodigo, deleteDispositivoPendiente, revocarDispositivo, getEstadoVinculacion };
