import { Routes } from '@angular/router';
import { authGuard, menuGuard, noAuthGuard, noSoporteGuard } from './core/guards/auth.guard';
import { PANTALLAS } from './core/navegacion';

/** Pantallas que ya existen; el resto muestra "Próximamente". */
const IMPLEMENTADAS: Record<string, () => Promise<any>> = {
  hoy: () => import('./features/hoy/hoy').then(c => c.Hoy),
  sucursales: () => import('./features/empresa/sucursales/sucursales').then(c => c.Sucursales),
  usuarios: () => import('./features/empresa/usuarios/usuarios').then(c => c.Usuarios),
  roles: () => import('./features/empresa/roles/roles').then(c => c.Roles),
  configuracion: () => import('./features/empresa/configuracion/configuracion').then(c => c.Configuracion),
  empleados: () => import('./features/personas/empleados/empleados').then(c => c.Empleados),
  // Puestos y Departamentos comparten pantalla (004): la ruta dice cuál es.
  puestos: () => import('./features/personas/catalogo-simple/catalogo-simple').then(c => c.CatalogoSimple),
  departamentos: () => import('./features/personas/catalogo-simple/catalogo-simple').then(c => c.CatalogoSimple),
  // 005: proceso de marcaje y dispositivo checador
  dispositivos: () => import('./features/checador/dispositivos/dispositivos').then(c => c.Dispositivos),
  formas_checar: () => import('./features/checador/formas-checar/formas-checar').then(c => c.FormasChecar),
  por_revisar: () => import('./features/checador/por-revisar/por-revisar').then(c => c.PorRevisar),
  // 006: horarios y días programados
  horarios: () => import('./features/checador/horarios/horarios').then(c => c.Horarios)
};

// Cada pantalla se protege por su menú. Hoy es del módulo General: la tiene
// todo usuario, así que no lleva guard (y es a donde se manda lo demás).
const pantallas = PANTALLAS.map(p => ({
  path: p.ruta.replace('/app/', ''),
  canActivate: p.menu === 'hoy' || p.bloqueado ? [] : [menuGuard(p.menu)],
  loadComponent: IMPLEMENTADAS[p.menu] ?? (() => import('./features/proximamente/proximamente').then(c => c.Proximamente)),
  data: { titulo: p.titulo, icono: p.icono, bloqueado: !!p.bloqueado },
  title: `${p.titulo} · Truck Manager`
}));

export const routes: Routes = [
  { path: '', redirectTo: '/app/hoy', pathMatch: 'full' },
  { path: 'auth/login', canActivate: [noAuthGuard], loadComponent: () => import('./features/auth/login').then(c => c.Login), title: 'Entrar · Truck Manager' },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/shell').then(c => c.Shell),
    children: [
      ...pantallas,
      { path: 'cuenta', canActivate: [noSoporteGuard], loadComponent: () => import('./features/cuenta/mi-cuenta').then(c => c.MiCuenta), title: 'Mi cuenta · Truck Manager' },
      { path: '', redirectTo: 'hoy', pathMatch: 'full' }
    ]
  },
  // 005: el dispositivo checador. Fuera del marco con sesión y sin authGuard:
  // lo identifica su llave, no un usuario.
  { path: 'checador', loadComponent: () => import('./features/checador/kiosco/kiosco').then(c => c.Kiosco), title: 'Checador · Truck Manager' },
  // 009: panel del superadministrador, fuera del marco de la empresa y con su propia sesión.
  { path: 'panel', loadChildren: () => import('./features/panel/panel.routes').then(m => m.PANEL_ROUTES) },
  { path: '**', redirectTo: '/app/hoy' }
];
