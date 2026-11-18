import { Injectable, computed, inject, signal } from '@angular/core';

import { PreferenciasService } from './preferencias.service';

export type Tema = 'auto' | 'light' | 'dark';
export type Paleta = 'indigo' | 'esmeralda' | 'oceano' | 'terracota';

export interface PaletaInfo {
  clave: Paleta; nombre: string; descripcion: string; icono: string;
  /** Muestras para el selector: menú lateral, principal y fondo suave. */
  muestra: { lado: string; principal: string; suave: string };
  /** Color de la barra del navegador en el celular. */
  barra: string;
}

/** Para agregar una paleta: un renglón aquí y su bloque en `styles/_paletas.scss`. */
export const PALETAS: PaletaInfo[] = [
  { clave: 'indigo', nombre: 'Índigo', descripcion: 'Moderno y sobrio', icono: 'palette',
    muestra: { lado: '#26215C', principal: '#3C3489', suave: '#EEEDFE' }, barra: '#26215C' },
  { clave: 'esmeralda', nombre: 'Esmeralda', descripcion: 'Verde y sereno', icono: 'eco',
    muestra: { lado: '#04342C', principal: '#0F6E56', suave: '#E1F5EE' }, barra: '#04342C' },
  { clave: 'oceano', nombre: 'Océano', descripcion: 'Azul y corporativo', icono: 'water_drop',
    muestra: { lado: '#042C53', principal: '#185FA5', suave: '#E6F1FB' }, barra: '#042C53' },
  { clave: 'terracota', nombre: 'Terracota', descripcion: 'Cálido y cercano', icono: 'local_fire_department',
    muestra: { lado: '#4A1B0C', principal: '#993C1D', suave: '#FAECE7' }, barra: '#4A1B0C' }
];

export const MODOS: { clave: Tema; nombre: string; icono: string }[] = [
  { clave: 'auto', nombre: 'Automático', icono: 'brightness_auto' },
  { clave: 'light', nombre: 'Claro', icono: 'light_mode' },
  { clave: 'dark', nombre: 'Oscuro', icono: 'dark_mode' }
];

const AMBITO = 'apariencia';

/**
 * Apariencia: paleta (Índigo, Esmeralda, Océano, Terracota) y modo (claro,
 * oscuro o según el sistema), independientes.
 *
 * La que manda es la preferencia del usuario en el servidor (por usuario y
 * por empresa). El navegador guarda una copia para pintar desde el primer
 * instante (`index.html`) y para la pantalla de entrar.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefs = inject(PreferenciasService);

  readonly tema = signal<Tema>('auto');
  readonly paleta = signal<Paleta>('indigo');
  readonly paletaInfo = computed(() => PALETAS.find(p => p.clave === this.paleta()) ?? PALETAS[0]);

  constructor() {
    this.pintar(this.leer('rh_tema', 'auto') as Tema, this.leer('rh_paleta', 'indigo') as Paleta);
  }

  /**
   * Lo que el usuario escoge: se pinta y se guarda en el servidor. El panel
   * del superadministrador (009) no tiene preferencias en el servidor: pasa
   * `guardar = false` y queda solo en el navegador.
   */
  aplicar(t: Tema, guardar = true): void {
    this.pintar(t, this.paleta());
    if (guardar) this.prefs.guardar(AMBITO, 'modo', t);
  }

  escogerPaleta(p: Paleta): void {
    this.pintar(this.tema(), p);
    this.prefs.guardar(AMBITO, 'paleta', p);
  }

  /** Al entrar o cambiar de empresa: aplica lo que el usuario tiene guardado. */
  desdePreferencias(): void {
    const t = this.prefs.get<Tema>(AMBITO, 'modo');
    const p = this.prefs.get<Paleta>(AMBITO, 'paleta');
    this.pintar(MODOS.some(m => m.clave === t) ? t! : this.tema(), PALETAS.some(x => x.clave === p) ? p! : this.paleta());
  }

  private pintar(t: Tema, p: Paleta): void {
    if (!PALETAS.some(x => x.clave === p)) p = 'indigo';
    this.tema.set(t);
    this.paleta.set(p);
    const html = document.documentElement;
    if (t === 'auto') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', t);
    if (p === 'indigo') html.removeAttribute('data-paleta'); else html.setAttribute('data-paleta', p);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.paletaInfo().barra);
    try {
      localStorage.setItem('rh_tema', t);
      localStorage.setItem('rh_paleta', p);
    } catch { /* sin storage */ }
  }

  private leer(k: string, porDefecto: string): string {
    try { return localStorage.getItem(k) || porDefecto; } catch { return porDefecto; }
  }
}
