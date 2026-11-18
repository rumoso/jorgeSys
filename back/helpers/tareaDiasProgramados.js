// =============================================================================
// Tarea diaria: red de seguridad de los días programados (análisis 006 §3)
// =============================================================================
// Una vez al día, por empresa activa, asegura que ningún empleado activo se
// quede sin días por delante (`asegurar`: solo crea los que faltan, con "hoy"
// en la zona de la sucursal principal de cada empleado). Un error en una
// empresa (o en un empleado) no detiene a las demás.
//
// La memoria de "esta empresa ya corrió hoy" lleva la empresa en la llave.
// No corre en cada marcaje.
//
// Se programa al arrancar el servidor (models/server.js) y se corre a mano:
//     npm run dias:asegurar
// =============================================================================

const { db } = require('./db');
const fechas = require('./fechas');
const { asegurar } = require('./diasProgramados');

const CADA_MS = 60 * 60 * 1000;          // revisa cada hora; cada empresa corre una vez al día
const PRIMERA_MS = 2 * 60 * 1000;
const corridas = new Map();              // `${ idEmpresa }` → día (UTC) en que ya corrió

/** Asegura los días de los empleados activos de UNA empresa: { empleados, creados, errores }. */
const asegurarEmpresa = async (idEmpresa) => {
    const req = { idEmpresa, uid: null };
    const salida = { empleados: 0, creados: 0, errores: 0 };
    const activos = await db.empresa(req).query(`
        SELECT idEmpleado FROM empleados WHERE idEmpresa = :idEmpresa AND estado = 'ACTIVO' ORDER BY idEmpleado`);
    for (const { idEmpleado } of activos) {
        salida.empleados++;
        try {
            salida.creados += await db.transaccion((t) => asegurar(req, idEmpleado, t));
        } catch (e) {
            salida.errores++;
            console.error(`[diasProgramados] empresa ${ idEmpresa }, empleado ${ idEmpleado }`, e.message);
        }
    }
    return salida;
};

/**
 * Todas las empresas activas. Con `forzar` corre aunque ya haya corrido hoy.
 * Regresa { empresas, empleados, creados, errores, omitidas }.
 */
const asegurarTodas = async ({ forzar = false } = {}) => {
    const dia = fechas.hoy('UTC');
    const empresas = await db.sinEmpresa.query(`
        SELECT idEmpresa FROM empresas WHERE estado = 'ACTIVA' ORDER BY idEmpresa
        /* sin-empresa: tarea del sistema que recorre las empresas activas; cada una se procesa con su idEmpresa */`);
    const total = { empresas: 0, empleados: 0, creados: 0, errores: 0, omitidas: 0 };
    for (const { idEmpresa } of empresas) {
        const llave = String(idEmpresa);
        if (!forzar && corridas.get(llave) === dia) { total.omitidas++; continue; }
        try {
            const r = await asegurarEmpresa(idEmpresa);
            total.empresas++;
            total.empleados += r.empleados;
            total.creados += r.creados;
            total.errores += r.errores;
            if (!r.errores) corridas.set(llave, dia);
        } catch (e) {
            total.errores++;
            console.error(`[diasProgramados] empresa ${ idEmpresa }`, e.message);
        }
    }
    return total;
};

/** La programa: dos minutos después de arrancar y luego cada hora (cada empresa, una vez al día). */
const programar = () => {
    const correr = () => asegurarTodas()
        .then(r => { if (r.creados || r.errores) console.log(`[diasProgramados] ${ r.creados } día(s) creado(s), ${ r.errores } error(es)`); })
        .catch(e => console.error('[diasProgramados]', e.message));
    setTimeout(correr, PRIMERA_MS).unref();
    setInterval(correr, CADA_MS).unref();
};

module.exports = { asegurarEmpresa, asegurarTodas, programar };
