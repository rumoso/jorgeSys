// =============================================================================
// Sesión de soporte (análisis 009 §5, T24 y T25)
// =============================================================================
// El superadministrador entra a una empresa con motivo y por tiempo corto. Su
// token (`soporte` { sa, e, ss }) viaja en `x-token` como una sesión de
// empresa: validarJWT lo acepta solo si, en cada petición:
//   - la fila de soporte_sesiones existe, es de ESA empresa y de ESE
//     superadministrador, no venció y no se cerró;
//   - la empresa está ACTIVA o SUSPENDIDA (soporte sí entra a una suspendida);
//   - el superadministrador sigue activo.
// =============================================================================

const { db } = require('../db');
const fechas = require('../fechas');

/** Estados de empresa en los que soporte puede entrar (y seguir dentro). */
const ESTADOS_SOPORTE = ['ACTIVA', 'SUSPENDIDA'];

/** 'AAAA-MM-DD HH:mm:ss' (UTC, como lo regresa MySQL) → ISO con zona. */
const iso = (v) => (v ? `${ String(v).replace(' ', 'T') }Z` : null);

/**
 * La sesión de soporte del token, si sigue vigente; si no, null.
 * Regresa { idSesionSoporte, idEmpresa, idSuperadmin, nombre, motivo, vence, empresa, estado, sucursales }.
 */
const sesionVigente = async (p) => {
    const idSuperadmin = Number(p?.sa), idEmpresa = Number(p?.e), idSesionSoporte = Number(p?.ss);
    if (![idSuperadmin, idEmpresa, idSesionSoporte].every(n => Number.isInteger(n) && n > 0)) return null;
    const q = db.panel({ idSuperadmin });
    const [s] = await q.query(`
        SELECT /* panel: valida la sesión de soporte del token en cada petición */
               ss.idSesionSoporte, ss.idEmpresa, ss.idSuperadmin, ss.nombreSuperadmin, ss.motivo, ss.vence,
               e.nombreComercial, e.estado,
               (SELECT GROUP_CONCAT(s.idSucursal) FROM sucursales s
                 WHERE s.idEmpresa = ss.idEmpresa AND s.bActivo = 1) AS sucursales
          FROM soporte_sesiones ss
          JOIN empresas e ON e.idEmpresa = ss.idEmpresa
         WHERE ss.idSesionSoporte = :idSesionSoporte AND ss.idEmpresa = :idEmpresa AND ss.idSuperadmin = :idSuperadmin
           AND ss.fin IS NULL AND ss.vence > :ahora`,
    { replacements: { idSesionSoporte, idEmpresa, idSuperadmin, ahora: fechas.ahora() } });
    if (!s || !ESTADOS_SOPORTE.includes(s.estado)) return null;
    const [cuenta] = await q.query('SELECT bActivo FROM superadmins WHERE idSuperadmin = :idSuperadmin',
        { replacements: { idSuperadmin } });
    if (!cuenta || !cuenta.bActivo) return null;
    return {
        idSesionSoporte: Number(s.idSesionSoporte),
        idEmpresa: Number(s.idEmpresa),
        idSuperadmin: Number(s.idSuperadmin),
        nombre: s.nombreSuperadmin,
        motivo: s.motivo,
        vence: iso(s.vence),
        empresa: s.nombreComercial,
        estado: s.estado,
        sucursales: s.sucursales ? String(s.sucursales).split(',').map(Number) : []
    };
};

module.exports = { ESTADOS_SOPORTE, sesionVigente, iso };
