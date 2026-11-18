/**
 * Pantallas del Front (análisis 002). El MENÚ ya no vive aquí: llega del
 * servidor según los roles y los módulos contratados (global/getMenu).
 * Aquí solo se relaciona cada clave de menú con su ruta, para registrar las
 * rutas y proteger cada una por su menú. Las que todavía no tienen pantalla
 * muestran "Próximamente" hasta su análisis.
 */
export interface Pantalla { menu: string; ruta: string; titulo: string; icono: string; bloqueado?: boolean; }

export const PANTALLAS: Pantalla[] = [
  { menu: 'hoy', ruta: '/app/hoy', titulo: 'Hoy', icono: 'space_dashboard' },
  { menu: 'asistencia', ruta: '/app/asistencia', titulo: 'Asistencia', icono: 'event_available' },
  { menu: 'ausencias', ruta: '/app/ausencias', titulo: 'Ausencias', icono: 'event_busy' },
  { menu: 'horarios', ruta: '/app/horarios', titulo: 'Horarios', icono: 'schedule' },
  { menu: 'dispositivos', ruta: '/app/dispositivos', titulo: 'Dispositivos', icono: 'tablet_android' },
  { menu: 'por_revisar', ruta: '/app/por-revisar', titulo: 'Por revisar', icono: 'fact_check' },
  { menu: 'formas_checar', ruta: '/app/formas-checar', titulo: 'Formas de checar', icono: 'rule' },
  { menu: 'empleados', ruta: '/app/empleados', titulo: 'Empleados', icono: 'groups' },
  { menu: 'puestos', ruta: '/app/puestos', titulo: 'Puestos', icono: 'work_outline' },
  { menu: 'departamentos', ruta: '/app/departamentos', titulo: 'Departamentos', icono: 'account_tree' },
  { menu: 'sucursales', ruta: '/app/empresa/sucursales', titulo: 'Sucursales', icono: 'storefront' },
  { menu: 'usuarios', ruta: '/app/empresa/usuarios', titulo: 'Usuarios', icono: 'manage_accounts' },
  { menu: 'roles', ruta: '/app/empresa/roles', titulo: 'Roles y permisos', icono: 'admin_panel_settings' },
  { menu: 'configuracion', ruta: '/app/empresa/configuracion', titulo: 'Configuración', icono: 'settings' },
  { menu: 'nomina', ruta: '/app/nomina', titulo: 'Nómina', icono: 'payments', bloqueado: true },
  { menu: 'desempeno', ruta: '/app/desempeno', titulo: 'Desempeño', icono: 'insights', bloqueado: true }
];
