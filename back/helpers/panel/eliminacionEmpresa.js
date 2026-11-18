// =============================================================================
// Eliminación definitiva de una empresa (análisis 009 §4, T30, LP-5)
// =============================================================================
// Al vencer el periodo de gracia de la baja (`baja.dias_gracia`):
//   - borra, en UNA transacción y en orden (tablasBaja.ORDEN_BORRADO), todo
//     lo de la empresa, biometría incluida (empleados_rostros);
//   - elimina las cuentas globales que solo pertenecían a esa empresa y
//     conserva las que tienen acceso (activo o no) a otra;
//   - conserva la fila de `empresas` en ELIMINADA, su historial, sus planes y
//     sus conteos (tablasBaja.SE_CONSERVAN): lo del cobro y lo fiscal;
//   - después del commit borra sus carpetas del almacén
//     (almacen/empresas/<id>/ y almacen/evidencias/<id>/).
//
// Solo procede si la empresa está EN_BAJA y su fechaBajaProgramada ya pasó:
// lo valida AQUÍ, no solo quien la llama.
//
// Lo corre el sistema (no un superadministrador): tarea diaria al arrancar el
// servidor (models/server.js) y `npm run bajas:vencidas`. Por eso consulta con
// db.sinEmpresa y deja su renglón ELIMINACION en empresas_historial (sin
// superadministrador); la bitácora del producto es de lo que hace una persona.
// =============================================================================

const { db, QueryTypes } = require('../db');
const { Regla } = require('../permisosEdicion');
const fechas = require('../fechas');
const archivos = require('../archivos');
const evidencias = require('../evidencias');
const { ORDEN_BORRADO } = require('./tablasBaja');

const CADA_MS = 24 * 60 * 60 * 1000;
const PRIMERA_MS = 2 * 60 * 1000;

const q = (sql, opts = {}) => db.sinEmpresa.query(sql, opts);

/**
 * Elimina una empresa en baja vencida. → { idEmpresa, nombre, filas: { tabla: n }, cuentasEliminadas, cuentasConservadas }
 * Lanza Regla si no está EN_BAJA o si su periodo de gracia no ha vencido.
 */
const eliminarEmpresa = async (idEmpresa, { ahora = fechas.ahora() } = {}) => {
    const id = Number(idEmpresa);
    if (!Number.isInteger(id) || id <= 0) throw new Regla('La empresa no existe');
    const r = await db.transaccion(async (t) => {
        const o = { replacements: { idEmpresa: id, ahora }, transaction: t };
        const [e] = await q(`
            SELECT idEmpresa, nombreComercial, estado, fechaBajaProgramada, (fechaBajaProgramada <= :ahora) AS bVencida
              FROM empresas WHERE idEmpresa = :idEmpresa FOR UPDATE
            /* sin-empresa: eliminación de una empresa en baja; la escoge la tarea del sistema */
            /* panel: eliminación definitiva (009) */`, o);
        if (!e) throw new Regla('La empresa no existe');
        if (e.estado !== 'EN_BAJA') throw new Regla(`La empresa ${ e.nombreComercial } no está en baja (${ e.estado }): no se elimina`);
        if (!e.fechaBajaProgramada || !Number(e.bVencida)) {
            throw new Regla(`El periodo de gracia de ${ e.nombreComercial } no ha vencido (vence ${ e.fechaBajaProgramada }): no se elimina`);
        }

        // Cuentas de la empresa que no tienen acceso a ninguna otra.
        const cuentas = await q(`
            SELECT ue.idUsuario,
                   EXISTS (SELECT 1 FROM usuarios_empresa x WHERE x.idUsuario = ue.idUsuario AND x.idEmpresa <> :idEmpresa) AS bOtra
              FROM usuarios_empresa ue WHERE ue.idEmpresa = :idEmpresa
            /* sin-empresa: una cuenta global se elimina solo si no pertenece a otra empresa */
            /* panel: eliminación definitiva (009) */`, o);
        const huerfanas = cuentas.filter(c => !Number(c.bOtra)).map(c => c.idUsuario);

        const filas = {};
        for (const tabla of ORDEN_BORRADO) {
            const n = await q(`DELETE FROM ${ tabla } WHERE idEmpresa = :idEmpresa
                /* sin-empresa: eliminación definitiva de la empresa en baja */ /* panel: eliminación definitiva (009) */`,
            { ...o, type: QueryTypes.BULKDELETE });
            filas[tabla] = Number(n) || 0;
        }

        let cuentasEliminadas = 0;
        if (huerfanas.length) {
            await q(`
                DELETE u FROM usuarios u
                 WHERE u.idUsuario IN (:ids)
                   AND NOT EXISTS (SELECT 1 FROM usuarios_empresa ue WHERE ue.idUsuario = u.idUsuario)
                /* sin-empresa: cuentas que solo pertenecían a la empresa eliminada */
                /* panel: eliminación definitiva (009) */`,
            { ...o, replacements: { ...o.replacements, ids: huerfanas }, type: QueryTypes.BULKDELETE });
            const [quedan] = await db.global.query('SELECT COUNT(*) AS n FROM usuarios WHERE idUsuario IN (:ids)',
                { replacements: { ids: huerfanas }, transaction: t });
            cuentasEliminadas = huerfanas.length - Number(quedan.n);
        }

        await q(`
            UPDATE empresas
               SET estado = 'ELIMINADA', fechaEliminacion = :ahora, fechaEstado = :ahora,
                   motivoEstado = 'Eliminación al vencer el periodo de gracia de la baja'
             WHERE idEmpresa = :idEmpresa
            /* sin-empresa: eliminación definitiva de la empresa en baja */ /* panel: eliminación definitiva (009) */`,
        { ...o, type: QueryTypes.UPDATE });
        const total = Object.values(filas).reduce((s, n) => s + n, 0);
        await q(`
            INSERT INTO empresas_historial (idEmpresa, tipo, detalle, motivo, idSuperadmin)
            VALUES (:idEmpresa, 'ELIMINACION', :detalle, :motivo, NULL)
            /* sin-empresa: historial de la empresa eliminada */ /* panel: eliminación definitiva (009) */`, {
            ...o,
            replacements: {
                ...o.replacements,
                detalle: `Datos eliminados: ${ total } registro(s) en ${ ORDEN_BORRADO.length } tabla(s), biometría incluida; `
                    + `${ cuentasEliminadas } cuenta(s) eliminada(s), ${ cuentas.length - huerfanas.length } conservada(s) por tener otra empresa.`,
                motivo: 'Venció el periodo de gracia de la baja'
            },
            type: QueryTypes.INSERT
        });
        return {
            idEmpresa: id, nombre: e.nombreComercial, filas, cuentasEliminadas,
            cuentasConservadas: cuentas.length - huerfanas.length
        };
    });
    // Archivos (fotos de empleados, exportaciones) y evidencias de marcajes.
    await archivos.borrarEmpresa(id);
    await evidencias.borrarEmpresa(id);
    return r;
};

/** Empresas EN_BAJA cuyo periodo de gracia ya venció. → [{ idEmpresa, nombreComercial, fechaBajaProgramada }] */
const bajasVencidas = (ahora = fechas.ahora()) => q(`
    SELECT idEmpresa, nombreComercial, fechaBajaProgramada
      FROM empresas
     WHERE estado = 'EN_BAJA' AND fechaBajaProgramada <= :ahora
     ORDER BY fechaBajaProgramada, idEmpresa
    /* sin-empresa: tarea del sistema que busca las bajas vencidas de todas las empresas */
    /* panel: eliminación definitiva (009) */`, { replacements: { ahora } });

/** Elimina todas las vencidas; una que falla no detiene a las demás. → { eliminadas: [...], errores: [...] } */
const eliminarVencidas = async (ahora = fechas.ahora()) => {
    const salida = { eliminadas: [], errores: [] };
    for (const e of await bajasVencidas(ahora)) {
        try {
            salida.eliminadas.push(await eliminarEmpresa(e.idEmpresa, { ahora }));
        } catch (error) {
            salida.errores.push({ idEmpresa: e.idEmpresa, nombre: e.nombreComercial, error: error.message });
            console.error(`[bajasVencidas] empresa ${ e.idEmpresa }`, error.message);
        }
    }
    return salida;
};

/** La programa: dos minutos después de arrancar y luego cada 24 horas. */
const programar = () => {
    const correr = () => eliminarVencidas()
        .then(r => { if (r.eliminadas.length) console.log(`[bajasVencidas] ${ r.eliminadas.length } empresa(s) eliminada(s)`); })
        .catch(e => console.error('[bajasVencidas]', e.message));
    setTimeout(correr, PRIMERA_MS).unref();
    setInterval(correr, CADA_MS).unref();
};

module.exports = { eliminarEmpresa, bajasVencidas, eliminarVencidas, programar };
