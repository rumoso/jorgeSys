// =============================================================================
// Checador → Formas de checar (análisis 005 §2): la política de la empresa.
// =============================================================================
// Por sucursal, qué formas se permiten; por empleado, la excepción. Cada
// cambio va a la bitácora y vacía la caché de helpers/politicaChecado.js.
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const politica = require('../helpers/politicaChecado');
const { registrar } = require('../helpers/bitacoraChecador');

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

const catalogoLista = async () => [...(await politica.catalogo()).values()].map(f => ({
    forma: f.forma, nombre: f.nombre, descripcion: f.descripcion, icono: f.icono, estado: f.estado,
    evidencias: f.evidencias, verificaciones: f.verificaciones
}));

/** GET /api/formasChecado/getFormasSucursal → { formas, sucursales: [{ idSucursal, nombre, formas: { forma: { bActiva } } }] } */
const getFormasSucursal = async (req, res) => {
    try {
        const sucursales = req.sucursalesPermitidas;
        const formas = await catalogoLista();
        const filas = sucursales.length ? await db.empresa(req).query(`
            SELECT s.idSucursal, s.nombre, s.zonaHoraria, f.forma, f.bActiva, f.configuracion, f.fechaModificacion
              FROM sucursales s
              LEFT JOIN formas_sucursal f ON f.idEmpresa = s.idEmpresa AND f.idSucursal = s.idSucursal
             WHERE s.idEmpresa = :idEmpresa AND s.idSucursal IN (:sucursales)
             ORDER BY s.nombre`, { replacements: { sucursales } }) : [];
        const porSucursal = new Map();
        for (const f of filas) {
            if (!porSucursal.has(f.idSucursal)) porSucursal.set(f.idSucursal, { idSucursal: f.idSucursal, nombre: f.nombre, zonaHoraria: f.zonaHoraria, formas: {} });
            if (f.forma) porSucursal.get(f.idSucursal).formas[f.forma] = { bActiva: !!f.bActiva, configuracion: parse(f.configuracion), fechaModificacion: f.fechaModificacion };
        }
        return res.json({ status_code: 0, message: 'Formas de checar', data: { formas, sucursales: [...porSucursal.values()] } });
    } catch (error) {
        console.error('getFormasSucursal', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar las formas de checar', data: null });
    }
};

const formaDisponible = async (forma) => {
    const def = (await politica.catalogo()).get(String(forma));
    if (!def) return { error: 'La forma de checar no existe' };
    if (def.estado !== 'DISPONIBLE') return { error: `"${ def.nombre }" estará disponible próximamente` };
    return { def };
};

/** POST /api/formasChecado/setFormaSucursal { idSucursal, forma, bActiva } */
const setFormaSucursal = async (req, res) => {
    const idSucursal = Number(req.body.idSucursal);
    const bActiva = req.body.bActiva === true;
    try {
        if (!req.sucursalesPermitidas.includes(idSucursal)) return res.json({ status_code: 1, message: 'La sucursal no existe', data: null });
        const { def, error } = await formaDisponible(req.body.forma);
        if (error) return res.json({ status_code: 1, message: error, data: null });
        await db.transaccion(async (t) => {
            const [antes] = await db.empresa(req).query(`
                SELECT bActiva FROM formas_sucursal WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal AND forma = :forma`,
            { replacements: { idSucursal, forma: def.forma }, transaction: t });
            await db.empresa(req).query(`
                INSERT INTO formas_sucursal (idEmpresa, idSucursal, forma, bActiva, idUsuarioModifico)
                VALUES (:idEmpresa, :idSucursal, :forma, :bActiva, :uid)
                ON DUPLICATE KEY UPDATE bActiva = VALUES(bActiva), idUsuarioModifico = VALUES(idUsuarioModifico)`,
            { replacements: { idSucursal, forma: def.forma, bActiva: bActiva ? 1 : 0, uid: req.uid }, type: QueryTypes.INSERT, transaction: t });
            await registrar(req, { tipo: 'FORMA_SUCURSAL', idSucursal,
                descripcion: `${ def.nombre }: ${ bActiva ? 'activada' : 'desactivada' } en la sucursal`,
                antes: antes ? { bActiva: !!antes.bActiva } : null, despues: { bActiva } }, t);
        });
        politica.invalidar(req.idEmpresa);
        return res.json({ status_code: 0, message: `${ def.nombre } ${ bActiva ? 'activada' : 'desactivada' }`, data: { id: idSucursal } });
    } catch (error) {
        console.error('setFormaSucursal', error);
        return res.json({ status_code: 2, message: 'No fue posible guardar la forma de checar', data: null });
    }
};

/** El empleado de la empresa, dentro de las sucursales del usuario. */
const empleadoDe = async (req, idEmpleado) => {
    const [e] = await db.empresa(req).query(`
        SELECT e.idEmpleado, CONCAT_WS(' ', e.nombre, e.apellidoPaterno) AS nombre, e.idSucursalPrincipal, e.idSucursalOperativa,
               s.nombre AS sucursalPrincipal
          FROM empleados e JOIN sucursales s ON s.idEmpresa = e.idEmpresa AND s.idSucursal = e.idSucursalPrincipal
         WHERE e.idEmpresa = :idEmpresa AND e.idEmpleado = :idEmpleado`,
    { replacements: { idEmpleado: Number(idEmpleado) || 0 } });
    if (!e) return undefined;
    if (!req.todasSucursales && ![e.idSucursalPrincipal, e.idSucursalOperativa].some(s => req.sucursalesPermitidas.includes(Number(s)))) return undefined;
    return e;
};

/** GET /api/formasChecado/getFormasEmpleado?idEmpleado= → por forma: la de su sucursal principal y su excepción. */
const getFormasEmpleado = async (req, res) => {
    try {
        const e = await empleadoDe(req, req.query.idEmpleado);
        if (!e) return res.json({ status_code: 1, message: 'El empleado no existe', data: null });
        const formas = (await catalogoLista()).filter(f => f.estado === 'DISPONIBLE');
        const suc = await db.empresa(req).query(
            'SELECT forma, bActiva FROM formas_sucursal WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
            { replacements: { idSucursal: e.idSucursalPrincipal } });
        const exc = await db.empresa(req).query(
            'SELECT forma, bPermitida FROM formas_empleado WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado',
            { replacements: { idEmpleado: e.idEmpleado } });
        const data = formas.map(f => {
            const s = suc.find(x => x.forma === f.forma);
            const x = exc.find(y => y.forma === f.forma);
            return { ...f, sucursal: !!s?.bActiva, excepcion: x ? !!x.bPermitida : null };
        });
        return res.json({ status_code: 0, message: `Formas de ${ e.nombre }`, data: { sucursalPrincipal: e.sucursalPrincipal, formas: data } });
    } catch (error) {
        console.error('getFormasEmpleado', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar las formas del empleado', data: null });
    }
};

/** POST /api/formasChecado/setFormaEmpleado { idEmpleado, forma, bPermitida: true | false | null } — null quita la excepción. */
const setFormaEmpleado = async (req, res) => {
    const bPermitida = req.body.bPermitida === null ? null : req.body.bPermitida === true;
    try {
        const e = await empleadoDe(req, req.body.idEmpleado);
        if (!e) return res.json({ status_code: 1, message: 'El empleado no existe', data: null });
        const { def, error } = await formaDisponible(req.body.forma);
        if (error) return res.json({ status_code: 1, message: error, data: null });
        await db.transaccion(async (t) => {
            const [antes] = await db.empresa(req).query(
                'SELECT bPermitida FROM formas_empleado WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND forma = :forma',
                { replacements: { idEmpleado: e.idEmpleado, forma: def.forma }, transaction: t });
            if (bPermitida === null) {
                await db.empresa(req).query(
                    'DELETE FROM formas_empleado WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND forma = :forma',
                    { replacements: { idEmpleado: e.idEmpleado, forma: def.forma }, type: QueryTypes.DELETE, transaction: t });
            } else {
                await db.empresa(req).query(`
                    INSERT INTO formas_empleado (idEmpresa, idEmpleado, forma, bPermitida, idUsuarioModifico)
                    VALUES (:idEmpresa, :idEmpleado, :forma, :bPermitida, :uid)
                    ON DUPLICATE KEY UPDATE bPermitida = VALUES(bPermitida), idUsuarioModifico = VALUES(idUsuarioModifico)`,
                { replacements: { idEmpleado: e.idEmpleado, forma: def.forma, bPermitida: bPermitida ? 1 : 0, uid: req.uid }, type: QueryTypes.INSERT, transaction: t });
            }
            await registrar(req, { tipo: 'FORMA_EMPLEADO', idEmpleado: e.idEmpleado,
                descripcion: `${ def.nombre } para ${ e.nombre }: ${ bPermitida === null ? 'usa la de su sucursal' : bPermitida ? 'permitida' : 'no permitida' }`,
                antes: antes ? { bPermitida: !!antes.bPermitida } : null, despues: { bPermitida } }, t);
        });
        politica.invalidar(req.idEmpresa);
        return res.json({ status_code: 0, message: bPermitida === null ? 'El empleado usa la regla de su sucursal' : 'Excepción guardada', data: { id: e.idEmpleado } });
    } catch (error) {
        console.error('setFormaEmpleado', error);
        return res.json({ status_code: 2, message: 'No fue posible guardar la excepción', data: null });
    }
};

module.exports = { getFormasSucursal, setFormaSucursal, getFormasEmpleado, setFormaEmpleado };
