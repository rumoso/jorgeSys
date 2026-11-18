import { Component, computed, effect, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ModuloCatalogo, Otorgables, PermisosMarcados } from '../../../models/permisos.models';

/**
 * Matriz de permisos (análisis 002): por módulo y por menú, una casilla para
 * ver el menú y una por cada acción. La usan los roles y los permisos
 * directos de un usuario.
 *
 * - Marcar una acción marca su menú; desmarcar el menú desmarca sus acciones.
 * - Lo que el usuario de la sesión no puede otorgar se ve deshabilitado (el
 *   servidor también lo rechaza: sin escalada).
 * - Cada módulo es un bloque desplegable: en el celular se lee como lista.
 * - `heredados` (permisos directos de un usuario): lo que ya le dan sus roles
 *   se ve marcado, deshabilitado y con "por su rol"; no se vuelve a otorgar.
 */
@Component({
  selector: 'app-matriz-permisos',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './matriz-permisos.html',
  styleUrl: './matriz-permisos.scss'
})
export class MatrizPermisos {
  readonly catalogo = input.required<ModuloCatalogo[]>();
  readonly marcados = input.required<PermisosMarcados>();
  readonly otorgables = input<Otorgables | null>(null);
  readonly soloLectura = input(false);
  readonly heredados = input<PermisosMarcados | null>(null);

  private readonly hMenus = computed(() => new Set(this.heredados()?.menus ?? []));
  private readonly hAcciones = computed(() => new Set(this.heredados()?.acciones ?? []));
  menuHeredado(menu: string): boolean { return this.hMenus().has(menu); }
  accionHeredada(accion: string): boolean { return this.hAcciones().has(accion); }
  readonly cambio = output<PermisosMarcados>();

  readonly menus = signal<Set<string>>(new Set());
  readonly acciones = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      const m = this.marcados();
      this.menus.set(new Set(m.menus));
      this.acciones.set(new Set(m.acciones));
    });
  }

  readonly totales = computed(() => {
    const out: Record<string, string> = {};
    for (const mo of this.catalogo()) {
      const total = mo.menus.length + mo.menus.reduce((n, m) => n + m.acciones.length, 0);
      // Cuenta también lo que ya da el rol, para que coincida con lo que se ve marcado.
      const marcados = mo.menus.filter(m => this.menus().has(m.menu) || this.menuHeredado(m.menu)).length
        + mo.menus.reduce((n, m) => n + m.acciones.filter(a => this.acciones().has(a.accion) || this.accionHeredada(a.accion)).length, 0);
      out[mo.modulo] = `${marcados} de ${total}`;
    }
    return out;
  });

  puedeMenu(menu: string): boolean {
    const o = this.otorgables();
    return !this.soloLectura() && !this.menuHeredado(menu) && (!o || o.admin || o.menus.includes(menu));
  }
  puedeAccion(accion: string): boolean {
    const o = this.otorgables();
    return !this.soloLectura() && !this.accionHeredada(accion) && (!o || o.admin || o.acciones.includes(accion));
  }

  alternarMenu(menu: string, acciones: string[], marcar: boolean): void {
    const menus = new Set(this.menus());
    const acc = new Set(this.acciones());
    if (marcar) menus.add(menu);
    else {
      menus.delete(menu);
      acciones.forEach(a => acc.delete(a));
    }
    this.emitir(menus, acc);
  }

  alternarAccion(menu: string, accion: string, marcar: boolean): void {
    const menus = new Set(this.menus());
    const acc = new Set(this.acciones());
    if (marcar) { acc.add(accion); if (!this.menuHeredado(menu)) menus.add(menu); } else acc.delete(accion);
    this.emitir(menus, acc);
  }

  private emitir(menus: Set<string>, acciones: Set<string>): void {
    this.menus.set(menus);
    this.acciones.set(acciones);
    this.cambio.emit({ menus: [...menus].sort(), acciones: [...acciones].sort() });
  }

  accionesDe(acciones: { accion: string }[]): string[] { return acciones.map(a => a.accion); }
}
