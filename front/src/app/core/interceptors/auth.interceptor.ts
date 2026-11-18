import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { PanelAuthService } from '../services/panel/panel-auth.service';
import { environment } from '../../../environments/environment';

/**
 * Cabeceras de sesión. Dos sesiones que nunca se cruzan (009):
 *  - `/api/panel/...` lleva SOLO `x-token-panel` (el panel del
 *    superadministrador); un 401 regresa a /panel/entrar.
 *  - el resto del API lleva SOLO `x-token` (la empresa, o la sesión de
 *    soporte si esta pestaña trae una); un 401 termina la sesión. En soporte
 *    (`SESION_SOPORTE_INVALIDA`) se regresa al panel.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const alApi = req.url.startsWith(environment.apiUrl);
  if (!alApi) return next(req);

  if (req.url.startsWith(`${environment.apiUrl}/panel/`)) {
    const panel = inject(PanelAuthService);
    // El segundo paso del login manda su propio token (panel2fa): no se toca.
    const propio = req.headers.has('x-token-panel');
    const token = panel.token();
    const r = token && !propio ? req.clone({ setHeaders: { 'x-token-panel': token } }) : req;
    return next(r).pipe(tap({ error: (e) => {
      // Todo 401 del panel es SESION_PANEL_INVALIDA (en una descarga el cuerpo es un Blob).
      if (e?.status === 401 && !propio) panel.cerrar();
    } }));
  }

  const auth = inject(AuthService);
  const token = auth.token();
  const r = token ? req.clone({ setHeaders: { 'x-token': token } }) : req;
  return next(r).pipe(tap({ error: (e) => {
    if (e?.status !== 401 || !token) return;
    if (auth.modoSoporte() || e?.error?.data?.codigo === 'SESION_SOPORTE_INVALIDA') {
      auth.terminarSoporte(e?.error?.message || 'La sesión de soporte terminó.');
    } else {
      auth.logout();
    }
  } }));
};
