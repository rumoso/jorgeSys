// =============================================================================
// Conteo diario de empleados activos (análisis 009 §7, T21)
// =============================================================================
// Guarda cuántos empleados activos (`empleados.estado = 'ACTIVO'`) tiene cada
// empresa, con el día de `producto.zona_horaria` (helpers/fechas.js). Es
// repetible: correrlo otra vez el mismo día conserva el MAYOR número del día,
// para no cobrar de menos si se dan de baja empleados después del conteo.
// El número del mes es el máximo del mes (`usoDelMes`).
//
// Corre sola al arrancar el servidor (models/server.js) y luego cada hora, y a
// mano con `npm run conteo:empleados`.
// =============================================================================

const { DateTime } = require('luxon');
const { db, QueryTypes } = require('../db');
const { hoyProducto } = require('../empresaAlta');

const CADA_MS = 60 * 60 * 1000;
const PRIMERA_MS = 60 * 1000;
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Primer y último día de un mes 'AAAA-MM' (días de negocio, texto). */
const limitesMes = (mes) => {
    if (!RE_MES.test(String(mes))) throw new Error(`[conteo] Mes inválido: "${ mes }" (AAAA-MM)`);
    const inicio = DateTime.fromFormat(`${ mes }-01`, 'yyyy-MM-dd', { zone: 'utc' });
    return { inicio: inicio.toFormat('yyyy-MM-dd'), fin: inicio.endOf('month').toFormat('yyyy-MM-dd') };
};

/** Cuenta todas las empresas (menos las eliminadas) en `fecha` (default: hoy del producto). */
const contarEmpleados = async (fecha = null) => {
    const dia = fecha || await hoyProducto();
    await db.sinEmpresa.query(`
        INSERT INTO empresas_conteo_diario (idEmpresa, fecha, empleadosActivos)
        SELECT e.idEmpresa, :dia,
               (SELECT COUNT(*) FROM empleados x WHERE x.idEmpresa = e.idEmpresa AND x.estado = 'ACTIVO')
          FROM empresas e
         WHERE e.estado <> 'ELIMINADA'
        ON DUPLICATE KEY UPDATE empleadosActivos = GREATEST(empleadosActivos, VALUES(empleadosActivos))
        /* sin-empresa: tarea del sistema que cuenta los empleados de cada empresa; cada renglón conserva su idEmpresa */
        /* panel: conteo diario para el cobro (009) */`,
    { replacements: { dia }, type: QueryTypes.INSERT });
    const [r] = await db.sinEmpresa.query(`
        SELECT COUNT(*) AS empresas, COALESCE(SUM(empleadosActivos), 0) AS empleados
          FROM empresas_conteo_diario WHERE fecha = :dia
        /* sin-empresa: resumen del conteo del día de todas las empresas */
        /* panel: conteo diario para el cobro (009) */`, { replacements: { dia } });
    return { fecha: dia, empresas: Number(r.empresas), empleados: Number(r.empleados) };
};

/** Empleados del mes de una empresa: el MÁXIMO de sus conteos diarios del mes (0 si no hay). */
const usoDelMes = async (idEmpresa, mes) => {
    const { inicio, fin } = limitesMes(mes);
    const [r] = await db.empresa({ idEmpresa }).query(`
        SELECT /* panel: uso del mes de una empresa para la ficha y el cobro */
               MAX(empleadosActivos) AS maximo, COUNT(*) AS dias
          FROM empresas_conteo_diario
         WHERE idEmpresa = :idEmpresa AND fecha BETWEEN :inicio AND :fin`, { replacements: { inicio, fin } });
    return { mes, maximo: Number(r?.maximo || 0), dias: Number(r?.dias || 0) };
};

/** La programa: un minuto después de arrancar y luego cada hora (repetible el mismo día). */
const programar = () => {
    const correr = () => contarEmpleados()
        .catch(e => console.error('[conteoEmpleados]', e.message));
    setTimeout(correr, PRIMERA_MS).unref();
    setInterval(correr, CADA_MS).unref();
};

module.exports = { contarEmpleados, usoDelMes, limitesMes, programar, RE_MES };
