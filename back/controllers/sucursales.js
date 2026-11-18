const { db, QueryTypes } = require('../helpers/db');
const { registrar } = require('../helpers/bitacoraConfiguracion');
const { invalidarZona } = require('../helpers/fechas');
const { leerUbicacion, numero, textoUbicacion } = require('../helpers/ubicacion');

const MSG_NO_EXISTE = 'La sucursal no existe';

/** GET /api/sucursales/getSucursales?estado=activas|todas */
const getSucursales = async (req, res) => {
    try {
        const soloActivas = req.query.estado !== 'todas';
        const data = await db.empresa(req).query(`
            SELECT s.idSucursal, s.nombre, s.direccion, s.latitud, s.longitud, s.zonaHoraria, z.nombre AS zonaNombre,
                   s.bActivo, s.fechaAlta
              FROM sucursales s
              JOIN cat_zonas_horarias z ON z.zona = s.zonaHoraria
             WHERE s.idEmpresa = :idEmpresa
               AND (:soloActivas = 0 OR s.bActivo = 1)
             ORDER BY s.bActivo DESC, s.nombre`, { replacements: { soloActivas: soloActivas ? 1 : 0 } });
        // El DECIMAL llega como texto: al navegador va como número (o null).
        for (const s of data) { s.latitud = numero(s.latitud); s.longitud = numero(s.longitud); }
        return res.json({ status_code: 0, message: `${ data.length } sucursal(es)`, data });
    } catch (error) {
        console.error('getSucursales', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar las sucursales', data: null });
    }
};

/** GET /api/sucursales/getZonasHorarias (catálogo global) */
const getZonasHorarias = async (req, res) => {
    try {
        const data = await db.global.query('SELECT zona, nombre FROM cat_zonas_horarias ORDER BY orden, nombre');
        return res.json({ status_code: 0, message: 'Zonas horarias', data });
    } catch (error) {
        console.error('getZonasHorarias', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar las zonas horarias', data: null });
    }
};

/**
 * POST /api/sucursales/insertUpdateSucursal { idSucursal?, nombre, direccion?, latitud?, longitud?, zonaHoraria, confirmarZona? }
 *
 * La ubicación (análisis 015) va completa en cada guardado: vacía o `null`
 * la quita. Su cambio queda en la bitácora (UBICACION).
 *
 * Cambiar la zona de una sucursal existente (análisis 003 §5) exige
 * `confirmarZona: true`: aplica de ese momento en adelante y NO recalcula
 * nada de lo ya registrado (LP-3). Sin la confirmación responde
 * `data.codigo = 'CONFIRMAR_ZONA'` con la explicación.
 */
const insertUpdateSucursal = async (req, res) => {
    const idSucursal = req.body.idSucursal ? Number(req.body.idSucursal) : null;
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    const direccion = String(req.body.direccion || '').trim() || null;
    const zonaHoraria = String(req.body.zonaHoraria || '');
    const confirmarZona = req.body.confirmarZona === true;
    const ubicacion = leerUbicacion(req.body.latitud, req.body.longitud);
    if (!ubicacion.ok) return res.json({ status_code: 1, message: ubicacion.mensaje, data: null });
    const { latitud, longitud } = ubicacion;
    try {
        const [zona] = await db.global.query('SELECT zona, nombre FROM cat_zonas_horarias WHERE zona = :zonaHoraria',
            { replacements: { zonaHoraria } });
        if (!zona) return res.json({ status_code: 1, message: 'Escoge una zona horaria de la lista', data: null });

        let actual = null;
        if (idSucursal) {
            [actual] = await db.empresa(req).query(`
                SELECT s.idSucursal, s.zonaHoraria, z.nombre AS zonaNombre, s.latitud, s.longitud
                  FROM sucursales s JOIN cat_zonas_horarias z ON z.zona = s.zonaHoraria
                 WHERE s.idEmpresa = :idEmpresa AND s.idSucursal = :idSucursal`,
            { replacements: { idSucursal } });
            if (!actual) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        }
        const cambiaZona = !!actual && actual.zonaHoraria !== zonaHoraria;
        if (cambiaZona && !confirmarZona) {
            return res.json({
                status_code: 1,
                message: `Vas a cambiar la zona horaria de "${ actual.zonaNombre }" a "${ zona.nombre }". `
                    + 'Aplica de este momento en adelante: lo que ya está registrado conserva su fecha y no se recalcula.',
                data: { codigo: 'CONFIRMAR_ZONA', zonaAnterior: actual.zonaHoraria, zonaNueva: zonaHoraria }
            });
        }

        const [repetida] = await db.empresa(req).query(`
            SELECT idSucursal FROM sucursales
             WHERE idEmpresa = :idEmpresa AND nombre = :nombre AND idSucursal <> :idSucursal`,
        { replacements: { nombre, idSucursal: idSucursal || 0 } });
        if (repetida) return res.json({ status_code: 1, message: `Ya existe una sucursal llamada "${ nombre }"`, data: null });

        const ubicacionNueva = textoUbicacion(latitud, longitud);

        if (idSucursal) {
            const ubicacionAntes = textoUbicacion(numero(actual.latitud), numero(actual.longitud));
            await db.transaccion(async (t) => {
                await db.empresa(req).query(`
                    UPDATE sucursales SET nombre = :nombre, direccion = :direccion, zonaHoraria = :zonaHoraria,
                           latitud = :latitud, longitud = :longitud
                     WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal`,
                { replacements: { nombre, direccion, zonaHoraria, latitud, longitud, idSucursal }, type: QueryTypes.UPDATE, transaction: t });
                // Solo la sucursal cambia: ninguna fecha guardada se toca.
                if (cambiaZona) {
                    await registrar(req, { tipo: 'ZONA', clave: 'sucursal.zona_horaria', idSucursal,
                        antes: actual.zonaHoraria, despues: zonaHoraria }, t);
                }
                if (ubicacionAntes !== ubicacionNueva) {
                    await registrar(req, { tipo: 'UBICACION', clave: 'sucursal.ubicacion', idSucursal,
                        antes: ubicacionAntes, despues: ubicacionNueva }, t);
                }
            });
            if (cambiaZona) invalidarZona(req.idEmpresa, idSucursal);
            return res.json({ status_code: 0, message: 'Sucursal actualizada correctamente', data: { id: idSucursal } });
        }

        const id = await db.transaccion(async (t) => {
            const [nuevo] = await db.empresa(req).query(`
                INSERT INTO sucursales (idEmpresa, nombre, direccion, latitud, longitud, zonaHoraria)
                VALUES (:idEmpresa, :nombre, :direccion, :latitud, :longitud, :zonaHoraria)`,
            { replacements: { nombre, direccion, latitud, longitud, zonaHoraria }, type: QueryTypes.INSERT, transaction: t });
            if (ubicacionNueva) {
                await registrar(req, { tipo: 'UBICACION', clave: 'sucursal.ubicacion', idSucursal: nuevo,
                    antes: null, despues: ubicacionNueva }, t);
            }
            // Análisis 005: la sucursal nueva arranca con el dispositivo checador permitido.
            await require('../helpers/empresaAlta').prepararChecador(req.idEmpresa, t);
            return nuevo;
        });
        return res.json({ status_code: 0, message: 'Sucursal creada correctamente', data: { id } });
    } catch (error) {
        if (error?.original?.errno === 1062) {
            return res.json({ status_code: 1, message: `Ya existe una sucursal llamada "${ nombre }"`, data: null });
        }
        console.error('insertUpdateSucursal', error);
        return res.json({ status_code: 2, message: 'No fue posible guardar la sucursal', data: null });
    }
};

/** PUT /api/sucursales/disableSucursal { idSucursal, bActivo } — nunca se borra. */
const disableSucursal = async (req, res) => {
    const idSucursal = Number(req.body.idSucursal);
    const bActivo = req.body.bActivo ? 1 : 0;
    try {
        const [actual] = await db.empresa(req).query(
            'SELECT idSucursal, nombre FROM sucursales WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
            { replacements: { idSucursal } });
        if (!actual) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });

        await db.empresa(req).query(
            'UPDATE sucursales SET bActivo = :bActivo WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
            { replacements: { bActivo, idSucursal }, type: QueryTypes.UPDATE });
        return res.json({
            status_code: 0,
            message: bActivo ? `Sucursal ${ actual.nombre } activada` : `Sucursal ${ actual.nombre } desactivada`,
            data: { id: idSucursal }
        });
    } catch (error) {
        console.error('disableSucursal', error);
        return res.json({ status_code: 2, message: 'No fue posible cambiar el estado de la sucursal', data: null });
    }
};

module.exports = { getSucursales, getZonasHorarias, insertUpdateSucursal, disableSucursal };
