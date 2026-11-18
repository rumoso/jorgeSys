// =============================================================================
// Baja definitiva de una empresa: qué se exporta y en qué orden se borra
// (análisis 009 §4, T28 y T30)
// =============================================================================
// Toda tabla de TABLAS_EMPRESA (helpers/tablasEmpresa.js) tiene que estar:
//   - en SE_EXPORTAN o en NO_SE_EXPORTAN (con su motivo), y
//   - en ORDEN_BORRADO o en SE_CONSERVAN (con su motivo).
// `node scripts/auditar-baja.js` (en `npm run auditar`) falla si una tabla
// nueva no está: quien agrega una tabla de empresa decide aquí si se entrega
// al cliente y cómo se borra.
//
// Sin dependencias de la base: lo lee el guardián sin conexión.
// =============================================================================

/**
 * Hojas del libro de la exportación, en orden. `orden`: columnas para paginar
 * de forma estable; `omitir`: columnas que no salen (secretos y rutas de
 * archivos del servidor); `select`: consulta propia (sin `:idEmpresa` no vale).
 */
const SE_EXPORTAN = [
    { tabla: 'empresas', orden: 'idEmpresa', omitir: ['fechaBajaProgramada', 'fechaEliminacion'] },
    { tabla: 'empresas_historial', orden: 'idHistorial' },
    { tabla: 'empresas_planes', orden: 'idEmpresaPlan', omitir: ['vigente'] },
    { tabla: 'empresas_conteo_diario', orden: 'fecha' },
    { tabla: 'empresas_modulos', orden: 'modulo' },
    { tabla: 'sucursales', orden: 'idSucursal' },
    {
        tabla: 'usuarios_empresa', orden: 'ue.idUsuario',
        // La cuenta es global: de ella solo el nombre y el correo (nunca la contraseña).
        select: `SELECT /* panel: exportación de la baja de la empresa */ ue.idUsuario, u.nombre, u.correo, ue.bActivo, ue.bTodasSucursales, ue.fechaAlta, ue.fechaModificacion
                   FROM usuarios_empresa ue JOIN usuarios u ON u.idUsuario = ue.idUsuario
                  WHERE ue.idEmpresa = :idEmpresa`,
        omitir: ['versionSesion']
    },
    { tabla: 'usuarios_empresa_sucursales', orden: 'idUsuario, idSucursal' },
    { tabla: 'roles', orden: 'idRol' },
    { tabla: 'roles_menus', orden: 'idRol, menu' },
    { tabla: 'roles_acciones', orden: 'idRol, accion' },
    { tabla: 'usuarios_empresa_roles', orden: 'idUsuario, idRol' },
    { tabla: 'usuarios_empresa_menus', orden: 'idUsuario, menu' },
    { tabla: 'usuarios_empresa_acciones', orden: 'idUsuario, accion' },
    { tabla: 'bitacora_permisos', orden: 'idBitacora' },
    { tabla: 'configuracion_valores', orden: 'idConfiguracionValor', omitir: ['idSucursalUnica'] },
    { tabla: 'bitacora_configuracion', orden: 'idBitacora' },
    { tabla: 'puestos', orden: 'idPuesto' },
    { tabla: 'departamentos', orden: 'idDepartamento' },
    { tabla: 'empleados', orden: 'idEmpleado', omitir: ['foto'] },
    { tabla: 'empleados_periodos', orden: 'idPeriodo' },
    { tabla: 'empleados_precios', orden: 'idPrecio' },
    { tabla: 'bitacora_empleados', orden: 'idBitacora' },
    { tabla: 'empleados_horario', orden: 'idEmpleado, diaSemana' },
    { tabla: 'sucursales_horario', orden: 'idSucursal, diaSemana' },
    { tabla: 'dias_programados', orden: 'idDia' },
    { tabla: 'bitacora_horarios', orden: 'idBitacora' },
    { tabla: 'formas_sucursal', orden: 'idSucursal, forma' },
    { tabla: 'formas_empleado', orden: 'idEmpleado, forma' },
    { tabla: 'dispositivos', orden: 'idDispositivo', omitir: ['codigoHash', 'llaveHash'] },
    { tabla: 'marcajes', orden: 'idMarcaje' },
    { tabla: 'marcajes_evidencias', orden: 'idEvidencia', omitir: ['archivo'] },
    { tabla: 'marcajes_intentos', orden: 'idIntento' },
    { tabla: 'consentimientos_texto', orden: 'idTexto' },
    { tabla: 'empleados_consentimientos', orden: 'idConsentimiento' },
    { tabla: 'bitacora_checador', orden: 'idBitacora' },
    { tabla: 'soporte_sesiones', orden: 'idSesionSoporte' }
];

/** Tablas de empresa que NO van en la exportación, con su motivo. */
const NO_SE_EXPORTAN = {
    empleados_rostros: 'Biometría (LP-5): el descriptor facial nunca sale del servidor',
    usuarios_preferencias: 'Preferencias de pantalla de cada usuario (tema, vista de tablas): no son datos del negocio',
    constantes_valores: 'Constantes técnicas del producto que fija el proveedor, no datos de la empresa',
    empresas_exportaciones: 'El registro de las propias exportaciones; el archivo es esta exportación'
};

/**
 * Orden de borrado de la eliminación: primero lo que referencia a otras
 * tablas de la empresa (bitácoras, marcajes, empleados…), al final lo que
 * todos referencian (sucursales). Todas por `idEmpresa`.
 */
const ORDEN_BORRADO = [
    'bitacora_checador',
    'bitacora_configuracion',
    'bitacora_empleados',
    'bitacora_horarios',
    'bitacora_permisos',
    'soporte_sesiones',
    'marcajes_evidencias',
    'marcajes_intentos',
    'marcajes',
    'empleados_rostros',
    'empleados_consentimientos',
    'consentimientos_texto',
    'formas_empleado',
    'formas_sucursal',
    'dias_programados',
    'empleados_horario',
    'sucursales_horario',
    'empleados_precios',
    'empleados_periodos',
    'dispositivos',
    'empleados',
    'usuarios_preferencias',
    'usuarios_empresa_acciones',
    'usuarios_empresa_menus',
    'usuarios_empresa_roles',
    'usuarios_empresa_sucursales',
    'usuarios_empresa',
    'roles_acciones',
    'roles_menus',
    'roles',
    'configuracion_valores',
    'constantes_valores',
    'puestos',
    'departamentos',
    'sucursales',
    'empresas_modulos',
    'empresas_exportaciones'
];

/** Tablas de empresa que la eliminación conserva, con su motivo. */
const SE_CONSERVAN = {
    empresas: 'Queda el registro de que existió (nombre, razón social, RFC y fechas) en estado ELIMINADA',
    empresas_historial: 'Lo que le pasó a la empresa (alta, suspensiones, baja, eliminación): parte del registro',
    empresas_planes: 'Sus planes y precios: lo necesario para lo fiscal y el cobro',
    empresas_conteo_diario: 'Empleados activos por día: la base del cobro de cada mes'
};

/** Errores de cobertura de las listas contra `tablasEmpresa` (vacío = todo bien). */
const revisarListas = (tablasEmpresa) => {
    const errores = [];
    const exportan = SE_EXPORTAN.map(x => x.tabla);
    const repetidas = (lista) => lista.filter((t, i) => lista.indexOf(t) !== i);
    for (const t of repetidas(exportan)) errores.push(`SE_EXPORTAN repite ${ t }`);
    for (const t of repetidas(ORDEN_BORRADO)) errores.push(`ORDEN_BORRADO repite ${ t }`);
    for (const t of tablasEmpresa) {
        const enExporta = exportan.includes(t), enNoExporta = t in NO_SE_EXPORTAN;
        if (!enExporta && !enNoExporta) errores.push(`${ t }: no está en SE_EXPORTAN ni en NO_SE_EXPORTAN`);
        if (enExporta && enNoExporta) errores.push(`${ t }: está en SE_EXPORTAN y en NO_SE_EXPORTAN`);
        const enBorra = ORDEN_BORRADO.includes(t), enConserva = t in SE_CONSERVAN;
        if (!enBorra && !enConserva) errores.push(`${ t }: no está en ORDEN_BORRADO ni en SE_CONSERVAN`);
        if (enBorra && enConserva) errores.push(`${ t }: está en ORDEN_BORRADO y en SE_CONSERVAN`);
    }
    const todas = [...exportan, ...Object.keys(NO_SE_EXPORTAN), ...ORDEN_BORRADO, ...Object.keys(SE_CONSERVAN)];
    for (const t of new Set(todas)) if (!tablasEmpresa.includes(t)) errores.push(`${ t }: no es una tabla de empresa (helpers/tablasEmpresa.js)`);
    for (const t of Object.values(NO_SE_EXPORTAN).concat(Object.values(SE_CONSERVAN))) if (!String(t).trim()) errores.push('Una tabla sin motivo');
    if (!('empleados_rostros' in NO_SE_EXPORTAN)) errores.push('empleados_rostros nunca se exporta (LP-5)');
    if (!ORDEN_BORRADO.includes('empleados_rostros')) errores.push('empleados_rostros se borra en la eliminación (LP-5)');
    return errores;
};

module.exports = { SE_EXPORTAN, NO_SE_EXPORTAN, ORDEN_BORRADO, SE_CONSERVAN, revisarListas };
