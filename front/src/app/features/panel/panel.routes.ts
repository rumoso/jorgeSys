import { Routes } from '@angular/router';
import { noPanelGuard, panelGuard } from '../../core/guards/auth.guard';

/** Panel del superadministrador (009): carga diferida, su propio marco y su propia sesión. */
export const PANEL_ROUTES: Routes = [
  { path: 'entrar', canActivate: [noPanelGuard], loadComponent: () => import('./entrar/panel-entrar').then(c => c.PanelEntrar), title: 'Panel · Truck Manager' },
  {
    path: '',
    canActivate: [panelGuard],
    loadComponent: () => import('../../layouts/panel-shell/panel-shell').then(c => c.PanelShell),
    children: [
      { path: 'empresas', loadComponent: () => import('./empresas/panel-empresas').then(c => c.PanelEmpresas), title: 'Empresas · Panel' },
      { path: 'empresas/:idEmpresa', loadComponent: () => import('./empresas/ficha/empresa-ficha').then(c => c.EmpresaFicha), title: 'Empresa · Panel' },
      { path: 'planes', loadComponent: () => import('./planes/panel-planes').then(c => c.PanelPlanes), title: 'Planes · Panel' },
      { path: 'cobro', loadComponent: () => import('./cobro/panel-cobro').then(c => c.PanelCobro), title: 'Cobro · Panel' },
      { path: 'constantes', loadComponent: () => import('./constantes/panel-constantes').then(c => c.PanelConstantes), title: 'Constantes · Panel' },
      { path: 'bitacora', loadComponent: () => import('./bitacora/panel-bitacora').then(c => c.PanelBitacora), title: 'Bitácora · Panel' },
      { path: '', redirectTo: 'empresas', pathMatch: 'full' },
      { path: '**', redirectTo: 'empresas' }
    ]
  }
];
