import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../core/services/auth.service';
import { GlobalService } from '../core/services/global.service';
import { NotificationService } from '../core/services/notification.service';
import { MODOS, PALETAS, ThemeService } from '../core/services/theme.service';
import { ContadorRevisarService } from '../core/services/contador-revisar.service';
import { PanelSoporteService } from '../core/services/panel/panel-soporte.service';

/**
 * Marco del sistema (diseño aprobado 2026-11-10).
 *  - Escritorio: barra lateral fija por módulo + barra superior con empresa,
 *    sucursal, buscar, avisos y usuario.
 *  - Celular (≤768px): barra superior compacta, menú lateral como cajón (con
 *    empresa y sucursal) y barra inferior con los accesos más usados.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatTooltipModule, MatSnackBarModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss'
})
export class Shell {
  private readonly bp = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly avisos = inject(NotificationService);
  readonly auth = inject(AuthService);
  readonly global = inject(GlobalService);
  readonly theme = inject(ThemeService);
  /** Marcajes por revisar (005): contador en el menú lateral y en la barra inferior. */
  readonly porRevisar = inject(ContadorRevisarService).total;
  private readonly contador = inject(ContadorRevisarService);

  readonly celular = toSignal(this.bp.observe('(max-width: 768px)').pipe(map(r => r.matches)), { initialValue: false });
  readonly abierto = signal(false);
  readonly cambiando = signal(false);

  /** Menú de la sesión: llega del servidor según roles y módulos contratados (002). */
  readonly menu = this.global.menu;
  /** Barra inferior del celular: los accesos marcados en el catálogo. */
  readonly inferior = this.global.inferior;

  readonly empresa = computed(() => this.auth.empresa()?.nombre || '');
  readonly variasEmpresas = computed(() => this.auth.empresas().length > 1);
  readonly nombreUsuario = computed(() => this.auth.usuario()?.nombre || '');
  readonly iniciales = computed(() => this.nombreUsuario().split(/[ ,]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase());
  readonly sucursal = computed(() => {
    const id = this.auth.sucursalActiva();
    const s = this.auth.sucursales().find(x => x.idSucursal === id);
    if (s) return s.nombre;
    return this.auth.sesion()?.todasSucursales ? 'Todas las sucursales' : 'Todas mis sucursales';
  });

  readonly PALETAS = PALETAS;
  readonly MODOS = MODOS;

  // ── 009: sesión de soporte ──
  private readonly soporteApi = inject(PanelSoporteService);
  readonly soporte = this.auth.soporte;
  readonly saliendo = signal(false);
  private readonly ahora = signal(Date.now());
  /** Lo que queda de la sesión de soporte ("52:07" o "1:02:07"). */
  readonly restante = computed(() => {
    const vence = Date.parse(this.soporte()?.vence ?? '');
    if (isNaN(vence)) return '';
    const s = Math.max(0, Math.floor((vence - this.ahora()) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
    const dos = (n: number) => String(n).padStart(2, '0');
    return h ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
  });

  constructor() {
    // Al navegar en el celular se cierra el cajón.
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => { if (this.celular()) this.abierto.set(false); });
    // La sesión guardada en el navegador puede ser vieja (le cambiaron los
    // roles o las sucursales): se vuelve a leer al entrar, con el menú.
    this.auth.refrescarSesion();
    // 005: el contador de Por revisar, al tener los permisos y cada minuto.
    effect(() => { if (this.global.cargado()) untracked(() => void this.contador.refrescar()); });
    const t = setInterval(() => void this.contador.refrescar(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
    // 009: cuenta regresiva de la sesión de soporte; al vencer, se sale sola.
    if (this.auth.modoSoporte()) {
      const reloj = setInterval(() => {
        this.ahora.set(Date.now());
        const vence = Date.parse(this.soporte()?.vence ?? '');
        if (!isNaN(vence) && Date.now() >= vence) this.salir('La sesión de soporte venció.');
      }, 1000);
      inject(DestroyRef).onDestroy(() => clearInterval(reloj));
    }
  }

  async cambiarEmpresa(idEmpresa: number): Promise<void> {
    if (idEmpresa === this.auth.empresa()?.idEmpresa || this.cambiando()) return;
    this.cambiando.set(true);
    const r = await this.auth.cambiarEmpresa(idEmpresa);
    // Con éxito la página se recarga; aquí solo llega el rechazo, y la lista
    // de empresas ya se actualizó para volver a escoger.
    if (!r.ok) { this.cambiando.set(false); this.avisos.error(r.texto); }
  }

  /**
   * Salir. En soporte (009) cierra la sesión de soporte en el servidor con el
   * token del panel y regresa al panel; la sesión normal de la empresa, si
   * había, no se toca.
   */
  salir(aviso?: string): void {
    const s = this.soporte();
    if (!s) { this.auth.logout(); return; }
    if (this.saliendo()) return;
    this.saliendo.set(true);
    this.soporteApi.salirEmpresa(s.idSesionSoporte).subscribe({
      next: r => this.auth.terminarSoporte(aviso ?? r.message),
      error: () => this.auth.terminarSoporte(aviso ?? 'Saliste de la sesión de soporte.')
    });
  }
}
