// =============================================================================
// Lista central de tablas (ARQUITECTURA §3, LP-1)
// =============================================================================
// Toda tabla del sistema está en UNA de las tres listas (la del panel, 009,
// solo la usa `db.panel`). El ayudante de
// consultas (helpers/db.js) y el guardián (scripts/auditar-empresa.js) leen
// de aquí: una tabla de empresa exige `:idEmpresa` en cada consulta, y una
// tabla que no está en ninguna lista hace fallar al guardián.
//
// Cada análisis que crea tablas las agrega aquí en la misma entrega.
// =============================================================================

/** Datos de una empresa: llevan `idEmpresa` y toda consulta filtra por él. */
const TABLAS_EMPRESA = [
    'empresas',
    'sucursales',
    'usuarios_empresa',
    'usuarios_empresa_sucursales',
    // 002
    'empresas_modulos',
    'roles',
    'roles_menus',
    'roles_acciones',
    'usuarios_empresa_roles',
    'usuarios_empresa_menus',
    'usuarios_empresa_acciones',
    'bitacora_permisos',
    // 003a
    'usuarios_preferencias',
    // 003b
    'configuracion_valores',
    'constantes_valores',
    'bitacora_configuracion',
    // 004
    'puestos',
    'departamentos',
    'empleados',
    'empleados_periodos',
    'empleados_precios',
    'bitacora_empleados',
    // 005
    'formas_sucursal',
    'formas_empleado',
    'dispositivos',
    'marcajes',
    'marcajes_evidencias',
    'marcajes_intentos',
    'consentimientos_texto',
    'empleados_consentimientos',
    'empleados_rostros',
    'bitacora_checador',
    // 006
    'empleados_horario',
    'sucursales_horario',
    'dias_programados',
    'bitacora_horarios',
    // 009: lo de cada empresa que administra el panel
    'empresas_planes',
    'empresas_historial',
    'empresas_conteo_diario',
    'empresas_exportaciones',
    'soporte_sesiones'
];

/** Del producto: no llevan `idEmpresa` (o lo llevan solo como dato). */
const TABLAS_GLOBALES = [
    'usuarios',             // la cuenta es global (ARQUITECTURA §4)
    'cat_zonas_horarias',
    'bitacora_sesiones',    // bitácora del producto; idEmpresa es un dato, nulo si falló
    // 002: catálogo del producto
    'cat_modulos',
    'cat_menus',
    'cat_acciones',
    'cat_roles_plantilla',
    'cat_roles_plantilla_menus',
    'cat_roles_plantilla_acciones',
    // 003b: catálogos de ajustes y constantes del sistema
    'cat_configuracion_ajustes',
    'cat_constantes',
    // 005: catálogo de formas de checar
    'cat_formas_checado'
];

/**
 * Del panel del superadministrador (009, única excepción a LP-1): solo las
 * toca `db.panel(req)`; db.empresa, db.global y db.sinEmpresa fallan si las
 * mencionan.
 */
const TABLAS_PANEL = [
    'superadmins',
    'cat_planes',
    'bitacora_producto'     // idEmpresa es un dato; no se edita ni se borra
];

// `ON DUPLICATE KEY UPDATE col = …` no es una tabla.
const RE_TABLAS = /(?<!key\s+)\b(?:from|join|into|update)\s+`?([a-z_][a-z0-9_]*)`?/gi;

/** Tablas que menciona un SQL (FROM, JOIN, INTO, UPDATE). */
const tablasDe = (sql) => {
    const out = new Set();
    for (const m of String(sql).matchAll(RE_TABLAS)) out.add(m[1].toLowerCase());
    return [...out];
};

module.exports = { TABLAS_EMPRESA, TABLAS_GLOBALES, TABLAS_PANEL, tablasDe };
