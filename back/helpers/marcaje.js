// =============================================================================
// El proceso de marcaje (análisis 005 §1, LP-6)
// =============================================================================
// ÚNICA puerta para crear marcajes. Ninguna forma de checar escribe en
// `marcajes` por su cuenta: arma una SOLICITUD y llama a `registrarMarcaje`.
// `npm run auditar` (scripts/auditar-marcajes.js) falla si algo fuera de este
// archivo hace INSERT o UPDATE sobre `marcajes`.
//
//     const r = await registrarMarcaje(req, {
//         idSucursal, idEmpleado, forma: 'dispositivo',
//         idDispositivo, idUsuarioRegistro,          // quién registra
//         instante,                                   // Date UTC; default: ahora
//         evidencias: [{ tipo, dato, archivo?, vence? }]
//     });
//     // r = { ok, resultado: 'ACEPTADO'|'POR_REVISAR'|'RECHAZADO', motivo, mensaje,
//     //       idMarcaje?, empleado?, instante, fechaNegocio?, zona? }
//
// `req.idEmpresa` es la empresa (de la sesión o de la llave del dispositivo,
// nunca del navegador). Pasos, siempre los mismos:
//   1. el empleado está activo y es de la empresa; la sucursal, activa;
//   2. la forma está permitida para ese empleado en esa sucursal (política);
//   3. corren las verificaciones de la política;
//   4. ACEPTADO, POR_REVISAR (con motivo) o rechazo;
//   5. en transacción: el marcaje con su fecha de negocio (zona de la
//      sucursal) y sus evidencias. Un rechazo no guarda marcaje: queda en
//      `marcajes_intentos`.
// =============================================================================

const { db, QueryTypes } = require('./db');
const fechas = require('./fechas');
const politica = require('./politicaChecado');
const verificaciones = require('./verificaciones');

const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/**
 * Un instante (Date) como texto UTC con milisegundos para MySQL: Sequelize
 * formatea los Date sin milisegundos (DATETIME(3) los perdería) y, en los
 * scripts que no corren con TZ=UTC, en la zona del proceso. Un texto ya
 * formateado se respeta tal cual (UTC).
 */
const instanteSQL = (d) => (typeof d === 'string' ? d : (d instanceof Date ? d : new Date(d)).toISOString().replace('T', ' ').replace('Z', ''));

/** Bitácora de lo que no se guardó como marcaje. Regresa el id del intento. */
const registrarIntento = async (req, i, transaction) => {
    const [id] = await db.empresa(req).query(`
        INSERT INTO marcajes_intentos (idEmpresa, idSucursal, idDispositivo, idEmpleado, forma, motivo,
                                       detalle, datos, folio, instante)
        VALUES (:idEmpresa, :idSucursal, :idDispositivo, :idEmpleado, :forma, :motivo,
                :detalle, :datos, :folio, :instante)`, {
        replacements: {
            idSucursal: i.idSucursal ?? null, idDispositivo: i.idDispositivo ?? null, idEmpleado: i.idEmpleado ?? null,
            forma: i.forma, motivo: i.motivo, detalle: i.detalle ? String(i.detalle).slice(0, 500) : null,
            datos: json(i.datos), folio: i.folio ?? null, instante: instanteSQL(i.instante || fechas.ahora())
        },
        type: QueryTypes.INSERT,
        transaction
    });
    return id;
};

const rechazo = async (req, s, motivo, mensaje, extra = {}) => {
    await registrarIntento(req, {
        idSucursal: s.idSucursal, idDispositivo: s.idDispositivo, idEmpleado: s.idEmpleado, forma: s.forma,
        motivo, detalle: mensaje, datos: s.datosIntento, instante: s.instante
    });
    return { ok: false, resultado: 'RECHAZADO', motivo, mensaje, instante: s.instante, ...extra };
};

const nombreDe = (e) => [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(' ');

const registrarMarcaje = async (req, solicitud) => {
    const s = {
        ...solicitud,
        idSucursal: Number(solicitud.idSucursal),
        idEmpleado: Number(solicitud.idEmpleado),
        idDispositivo: solicitud.idDispositivo ? Number(solicitud.idDispositivo) : null,
        idUsuarioRegistro: solicitud.idUsuarioRegistro ? Number(solicitud.idUsuarioRegistro) : null,
        instante: solicitud.instante instanceof Date ? solicitud.instante : fechas.ahora(),
        evidencias: Array.isArray(solicitud.evidencias) ? solicitud.evidencias : []
    };
    if (!s.forma) throw new Error('[marcaje] La solicitud no trae la forma');

    // 1. Sucursal y empleado, de la empresa.
    const [suc] = await db.empresa(req).query(
        'SELECT idSucursal, nombre, zonaHoraria, bActivo FROM sucursales WHERE idEmpresa = :idEmpresa AND idSucursal = :idSucursal',
        { replacements: { idSucursal: s.idSucursal } });
    if (!suc || !suc.bActivo) return rechazo(req, s, 'SUCURSAL_INACTIVA', 'La sucursal no existe o está inactiva');

    const [emp] = await db.empresa(req).query(`
        SELECT idEmpleado, numeroEmpleado, nombre, apellidoPaterno, apellidoMaterno, estado, idSucursalPrincipal
          FROM empleados WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`,
    { replacements: { idEmpleado: s.idEmpleado } });
    if (!emp) return rechazo(req, { ...s, idEmpleado: null }, 'EMPLEADO_NO_EXISTE', 'El empleado no existe');
    const empleado = { idEmpleado: emp.idEmpleado, numeroEmpleado: emp.numeroEmpleado, nombre: nombreDe(emp) };
    if (emp.estado !== 'ACTIVO') return rechazo(req, s, 'EMPLEADO_BAJA', 'El empleado está dado de baja', { empleado });

    // 2. Política.
    const pol = await politica.formaPermitida(req, { idEmpleado: s.idEmpleado, idSucursal: s.idSucursal, forma: s.forma });
    if (!pol.permitida) return rechazo(req, s, 'FORMA_NO_PERMITIDA', pol.motivo, { empleado });

    const zona = suc.zonaHoraria;
    const fechaNegocio = fechas.diaDe(s.instante, zona);

    // 3 a 5, en transacción. El renglón del empleado se bloquea para que dos
    // checadas simultáneas no pasen juntas el antirrebote.
    const salida = await db.transaccion(async (t) => {
        await db.empresa(req).query(
            'SELECT idEmpleado FROM empleados WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado FOR UPDATE',
            { replacements: { idEmpleado: s.idEmpleado }, transaction: t });

        const vers = await verificaciones.correr(pol.verificaciones, { req, solicitud: s, empleado, zona, t });
        const falla = vers.find(v => v.resultado === 'no_pasa');
        if (falla) return { rechazo: falla };

        const dudas = vers.filter(v => v.resultado === 'dudosa');
        const resultado = dudas.length ? 'POR_REVISAR' : 'ACEPTADO';
        const motivoDuda = dudas.length ? dudas.map(d => d.detalle || d.verificacion).join('. ').slice(0, 250) : null;

        const [idMarcaje] = await db.empresa(req).query(`
            INSERT INTO marcajes (idEmpresa, idSucursal, idEmpleado, instante, fechaNegocio, forma,
                                  idDispositivo, idUsuarioRegistro, resultado, motivoDuda)
            VALUES (:idEmpresa, :idSucursal, :idEmpleado, :instante, :fechaNegocio, :forma,
                    :idDispositivo, :idUsuarioRegistro, :resultado, :motivoDuda)`, {
            replacements: {
                idSucursal: s.idSucursal, idEmpleado: s.idEmpleado, instante: instanteSQL(s.instante), fechaNegocio, forma: s.forma,
                idDispositivo: s.idDispositivo, idUsuarioRegistro: s.idUsuarioRegistro, resultado, motivoDuda
            },
            type: QueryTypes.INSERT,
            transaction: t
        });

        const evidencias = [...s.evidencias, { tipo: 'verificaciones', dato: vers }];
        for (const e of evidencias) {
            await db.empresa(req).query(`
                INSERT INTO marcajes_evidencias (idEmpresa, idMarcaje, tipo, dato, archivo, vence)
                VALUES (:idEmpresa, :idMarcaje, :tipo, :dato, :archivo, :vence)`, {
                replacements: { idMarcaje, tipo: e.tipo, dato: json(e.dato), archivo: e.archivo ?? null, vence: e.vence ? instanteSQL(e.vence) : null },
                type: QueryTypes.INSERT,
                transaction: t
            });
        }

        if (s.idDispositivo) {
            await db.empresa(req).query(`
                UPDATE dispositivos SET ultimoMarcaje = :instante
                 WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo`,
            { replacements: { instante: instanteSQL(s.instante), idDispositivo: s.idDispositivo }, type: QueryTypes.UPDATE, transaction: t });
        }
        return { idMarcaje, resultado, motivoDuda };
    });

    if (salida.rechazo) {
        const motivo = `VERIFICACION_${ salida.rechazo.verificacion.toUpperCase() }`;
        return rechazo(req, s, motivo, salida.rechazo.detalle || 'No pasó una verificación', { empleado });
    }

    return {
        ok: true,
        resultado: salida.resultado,
        motivo: salida.motivoDuda,
        mensaje: salida.resultado === 'ACEPTADO' ? 'Registrado' : 'Registrado; queda por revisar',
        idMarcaje: salida.idMarcaje,
        empleado,
        instante: s.instante,
        fechaNegocio,
        zona
    };
};

module.exports = { registrarMarcaje, registrarIntento, instanteSQL };
