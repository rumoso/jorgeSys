import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService } from '../../core/services/notification.service';
import { MODOS, ThemeService } from '../../core/services/theme.service';
import { K_AVISO_PANEL } from '../../core/services/auth.service';
import { PanelAuthService, PanelConstantesService } from '../../core/services/panel';

/** Menú propio del panel (009). No llega del servidor: el panel no tiene roles. */
const MENU_PANEL = [
  { ruta: '/panel/empresas', titulo: 'Empresas', icono: 'domain' },
  { ruta: '/panel/planes', titulo: 'Planes', icono: 'workspace_premium' },
  { ruta: '/panel/cobro', titulo: 'Cobro', icono: 'request_quote' },
  { ruta: '/panel/constantes', titulo: 'Constantes', icono: 'tune' },
  { ruta: '/panel/bitacora', titulo: 'Bitácora', icono: 'history' }
];

/**
 * Marco del panel del superadministrador (009). Va fuera del marco de la
 * empresa: otro menú, otra sesión y sin preferencias en el servidor (el modo
 * claro u oscuro queda solo en este navegador).
 */
@Component({
  selector: 'app-panel-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, MatButtonModule, MatMenuModule, MatSnackBarModule],
  templateUrl: './panel-shell.html',
  styleUrls: ['../shell.scss', './panel-shell.scss']
})
export class PanelShell {
  private readonly bp = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly constantes = inject(PanelConstantesService);
  private readonly avisos = inject(NotificationService);
  readonly panel = inject(PanelAuthService);
  readonly theme = inject(ThemeService);

  readonly MENU = MENU_PANEL;
  readonly MODOS = MODOS;
  readonly celular = toSignal(this.bp.observe('(max-width: 768px)').pipe(map(r => r.matches)), { initialValue: false });
  readonly abierto = signal(false);
  readonly nombre = computed(() => this.panel.superadmin()?.nombre || '');
  readonly iniciales = computed(() => this.nombre().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'SA');

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => { if (this.celular()) this.abierto.set(false); });
    this.panel.refrescar();
    // Las fechas del panel se muestran en la zona del producto.
    this.constantes.getConstantes({ q: 'producto.zona_horaria' }).subscribe(r => {
      const c = r.status_code === 0 ? (r.data as { constantes: { clave: string; valor: unknown }[] }[])
        .flatMap(g => g.constantes).find(x => x.clave === 'producto.zona_horaria') : null;
      if (c && typeof c.valor === 'string' && c.valor) this.panel.zona.set(c.valor);
    });
    // Aviso al regresar de una sesión de soporte.
    try {
      const aviso = sessionStorage.getItem(K_AVISO_PANEL);
      if (aviso) { sessionStorage.removeItem(K_AVISO_PANEL); setTimeout(() => this.avisos.info(aviso)); }
    } catch { /* */ }
  }

  salir(): void { this.panel.cerrar(); }
}
