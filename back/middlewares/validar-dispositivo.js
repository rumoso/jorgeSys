const { db } = require('../helpers/db');
const { hash } = require('../helpers/llaves');

// =============================================================================
// Llave del dispositivo checador (análisis 005 §5, LP-1)
// =============================================================================
// Para los endpoints SIN sesión del dispositivo (routes/checador.js). La
// llave viaja en el encabezado `x-dispositivo`, nunca en la URL ni en el body.
// Se busca su hash y se exige: dispositivo VINCULADO, sucursal activa y
// empresa activa. Deja en `req`:
//     idEmpresa, idSucursal, idDispositivo (y `dispositivo` con sus nombres)
// La empresa y la sucursal salen SOLO de aquí: lo que mande el navegador en
// el body o el query no tiene efecto.
//
// Rechazo con HTTP 200 y `data.codigo` (nunca 401: el dispositivo no tiene
// sesión y el interceptor del Front no debe tocarlo):
//     DISPOSITIVO_DESCONOCIDO, DISPOSITIVO_REVOCADO, SUCURSAL_INACTIVA, EMPRESA_SUSPENDIDA,
//     EMPRESA_EN_BAJA (009: en baja o eliminada)
// =============================================================================

const rechazo = (res, codigo, message) => res.json({ status_code: 1, message, data: { codigo } });
const NO_VINCULADO = 'Este dispositivo no está vinculado. Vincúlalo con el código que te da el administrador.';

const validarDispositivo = async (req, res, next) => {
    const llave = req.header('x-dispositivo');
    if (!llave || llave.length < 20 || llave.length > 200) return rechazo(res, 'DISPOSITIVO_DESCONOCIDO', NO_VINCULADO);
    try {
        const [d] = await db.sinEmpresa.query(`
            SELECT d.idDispositivo, d.idEmpresa, d.idSucursal, d.nombre, d.estado,
                   s.nombre AS sucursal, s.bActivo AS sucursalActiva, s.zonaHoraria,
                   e.nombreComercial AS empresa, e.estado AS estadoEmpresa
              FROM dispositivos d
              JOIN sucursales s ON s.idEmpresa = d.idEmpresa AND s.idSucursal = d.idSucursal
              JOIN empresas e ON e.idEmpresa = d.idEmpresa
             WHERE d.llaveHash = :llaveHash
             /* sin-empresa: la llave del dispositivo es la que dice de qué empresa y sucursal es */`,
        { replacements: { llaveHash: hash(llave) } });

        if (!d) return rechazo(res, 'DISPOSITIVO_DESCONOCIDO', NO_VINCULADO);
        if (d.estado !== 'VINCULADO') {
            return rechazo(res, 'DISPOSITIVO_REVOCADO', 'Este dispositivo fue revocado. Pide al administrador un código nuevo para vincularlo.');
        }
        if (['EN_BAJA', 'ELIMINADA'].includes(d.estadoEmpresa)) {
            return rechazo(res, 'EMPRESA_EN_BAJA', 'La empresa fue dada de baja: no se puede checar.');
        }
        if (d.estadoEmpresa !== 'ACTIVA') return rechazo(res, 'EMPRESA_SUSPENDIDA', 'La empresa está suspendida: no se puede checar.');
        if (!d.sucursalActiva) return rechazo(res, 'SUCURSAL_INACTIVA', `La sucursal ${ d.sucursal } está inactiva: no se puede checar aquí.`);

        req.idEmpresa = Number(d.idEmpresa);
        req.idSucursal = Number(d.idSucursal);
        req.idDispositivo = Number(d.idDispositivo);
        req.dispositivo = { nombre: d.nombre, sucursal: d.sucursal, empresa: d.empresa, zonaHoraria: d.zonaHoraria };
        next();
    } catch (error) {
        console.error('validarDispositivo', error);
        return res.json({ status_code: 2, message: 'No fue posible validar el dispositivo', data: null });
    }
};

module.exports = { validarDispositivo };
