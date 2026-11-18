import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { GlobalService } from '../services/global.service';
import { PanelAuthService } from '../services/panel/panel-auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? true : inject(Router).createUrlTree(['/auth/login']);
};

export const noAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token() ? inject(Router).createUrlTree(['/app/hoy']) : true;
};

/** 009: lo personal (Mi cuenta) no aplica en una sesión de soporte. */
export const noSoporteGuard: CanActivateFn = () =>
  inject(AuthService).modoSoporte() ? inject(Router).createUrlTree(['/app/hoy']) : true;

/** 009: el panel del superadministrador, solo con su propia sesión (nunca la de la empresa). */
export const panelGuard: CanActivateFn = () =>
  inject(PanelAuthService).autenticado() ? true : inject(Router).createUrlTree(['/panel/entrar']);

export const noPanelGuard: CanActivateFn = () =>
  inject(PanelAuthService).autenticado() ? inject(Router).createUrlTree(['/panel/empresas']) : true;

/**
 * Pantalla protegida por su menú (análisis 002). Solo decide si se muestra;
 * el servidor vuelve a validar en cada endpoint.
 */
export const menuGuard = (menu: string): CanActivateFn => async () => {
  const global = inject(GlobalService);
  const router = inject(Router);
  await global.asegurar();
  return global.tieneMenu(menu) ? true : router.createUrlTree(['/app/hoy']);
};
