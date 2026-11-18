import { ChangeDetectorRef, Directive, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { MatTabGroup } from '@angular/material/tabs';

/**
 * Pestañas que se deslizan, para cualquier <mat-tab-group>, en celular y en
 * computadora:
 *  - La barra de pestañas se arrastra (dedo o mouse, sin las flechitas de
 *    Material); en computadora también se mueve con la rueda. La pestaña
 *    elegida se acomoda sola al centro.
 *  - Deslizar el contenido a la izquierda o a la derecha (dedo, o arrastrar
 *    con el mouse) cambia de pestaña.
 *
 * Para no cambiar de pestaña por accidente: solo cuenta un gesto claramente
 * horizontal (más de 70 px y el doble que lo vertical) y no se activa si
 * empieza en un campo, un botón, en la propia barra (que tiene su arrastre),
 * en una tabla que ya se desplaza de lado o dentro de otro grupo de
 * pestañas anidado. Con el mouse, en cuanto el arrastre se ve horizontal se
 * quita la selección de texto, para que no se "pinte" la columna; un
 * arrastre vertical sigue seleccionando texto normal.
 *
 * Los estilos de la barra están en `styles/components/_tabs-deslizables.scss`.
 *
 * Uso: <mat-tab-group appTabsDeslizables ...>
 */
@Directive({
  selector: 'mat-tab-group[appTabsDeslizables]',
  standalone: true,
  host: { class: 'tabs-deslizables' }
})
export class TabsDeslizablesDirective implements OnInit, OnDestroy {
  private readonly tabGroup = inject(MatTabGroup);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);

  private static readonly NO_DESLIZAR =
    '.mat-mdc-tab-header, input, textarea, select, button, a, [contenteditable], .mat-mdc-slider, cdk-virtual-scroll-viewport';

  /**
   * true si el gesto empieza dentro de algo que ya se desplaza de lado (una
   * tabla ancha): ahí el arrastre es para recorrerla, no para cambiar de
   * pestaña. Una tabla vista como tarjetas no se desplaza, así que sí cuenta.
   */
  private enScrollHorizontal(target: HTMLElement): boolean {
    for (let n: HTMLElement | null = target; n && n !== this.el.nativeElement; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 2) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  }

  private noDeslizar(target: HTMLElement): boolean {
    return !!target.closest(TabsDeslizablesDirective.NO_DESLIZAR) || this.enScrollHorizontal(target);
  }

  // Gesto sobre el contenido (dedo o mouse)
  private gesto: { x: number; y: number; mouse: boolean; horizontal: boolean } | null = null;

  // Arrastre de la barra con el mouse
  private barra: { x: number; scroll: number; movio: boolean; cont: HTMLElement } | null = null;
  private suprimirClick = false;

  private readonly onMove = (ev: PointerEvent) => this.moverMouse(ev);
  private readonly onUp = (ev: PointerEvent) => this.soltarMouse(ev);
  private readonly onClickCaptura = (ev: MouseEvent) => {
    if (this.suprimirClick) {
      ev.stopPropagation();
      ev.preventDefault();
      this.suprimirClick = false;
    }
  };

  ngOnInit(): void {
    this.tabGroup.disablePagination = true;
    this.tabGroup.selectedIndexChange.subscribe(() => this.centrarActiva());
    // Un arrastre de la barra no debe contar como clic en la pestaña.
    this.el.nativeElement.addEventListener('click', this.onClickCaptura, true);
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('click', this.onClickCaptura, true);
    this.quitarListenersMouse();
  }

  private header(): HTMLElement | null {
    return this.el.nativeElement.querySelector(':scope > .mat-mdc-tab-header');
  }

  private centrarActiva(): void {
    setTimeout(() => this.header()?.querySelector('.mdc-tab--active')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }), 0);
  }

  private esDeEsteGrupo(target: HTMLElement | null): boolean {
    return !!target && target.closest('mat-tab-group') === this.el.nativeElement;
  }

  private irA(dx: number): void {
    const total = this.tabGroup._tabs?.length ?? 0;
    const paso = dx < 0 ? 1 : -1;
    let sig = (this.tabGroup.selectedIndex ?? 0) + paso;
    while (sig >= 0 && sig < total && this.tabGroup._tabs.get(sig)?.disabled) sig += paso;
    if (sig < 0 || sig >= total) return;
    // MatTabGroup emite selectedIndexChange al aplicar el cambio: las
    // pantallas que guardan la pestaña activa se enteran igual que con un clic.
    this.tabGroup.selectedIndex = sig;
    this.cdr.markForCheck();
  }

  private esSwipe(dx: number, dy: number): boolean {
    return Math.abs(dx) >= 70 && Math.abs(dx) >= Math.abs(dy) * 2;
  }

  // ── Dedo ──
  @HostListener('touchstart', ['$event'])
  touchInicio(ev: TouchEvent): void {
    const t = ev.touches[0];
    const target = ev.target as HTMLElement;
    if (!t || !this.esDeEsteGrupo(target) || this.noDeslizar(target)) {
      this.gesto = null;
      return;
    }
    this.gesto = { x: t.clientX, y: t.clientY, mouse: false, horizontal: false };
  }

  @HostListener('touchend', ['$event'])
  touchFin(ev: TouchEvent): void {
    const ini = this.gesto;
    this.gesto = null;
    const t = ev.changedTouches[0];
    if (!ini || ini.mouse || !t) return;
    const dx = t.clientX - ini.x;
    if (this.esSwipe(dx, t.clientY - ini.y)) this.irA(dx);
  }

  // ── Mouse ──
  @HostListener('pointerdown', ['$event'])
  mouseInicio(ev: PointerEvent): void {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (!this.esDeEsteGrupo(target)) return;

    // Sobre la barra: arrastrar para desplazarla.
    const cont = target.closest<HTMLElement>('.mat-mdc-tab-label-container');
    if (cont && this.header()?.contains(cont)) {
      if (cont.scrollWidth <= cont.clientWidth) return;   // todas caben: nada que arrastrar
      this.barra = { x: ev.clientX, scroll: cont.scrollLeft, movio: false, cont };
      this.ponerListenersMouse();
      return;
    }

    // Sobre el contenido: posible deslizamiento para cambiar de pestaña.
    if (this.noDeslizar(target)) return;
    this.gesto = { x: ev.clientX, y: ev.clientY, mouse: true, horizontal: false };
    this.ponerListenersMouse();
  }

  private moverMouse(ev: PointerEvent): void {
    if (this.barra) {
      const dx = ev.clientX - this.barra.x;
      if (!this.barra.movio && Math.abs(dx) > 5) {
        this.barra.movio = true;
        this.el.nativeElement.classList.add('tabs-arrastrando');
      }
      if (this.barra.movio) {
        this.barra.cont.style.scrollBehavior = 'auto';
        this.barra.cont.scrollLeft = this.barra.scroll - dx;
        ev.preventDefault();
      }
      return;
    }
    const g = this.gesto;
    if (!g?.mouse) return;
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    // En cuanto se ve horizontal, deja de seleccionar texto.
    if (!g.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 2) {
      g.horizontal = true;
      this.el.nativeElement.classList.add('tabs-arrastrando');
    }
    if (g.horizontal) {
      window.getSelection()?.removeAllRanges();
      ev.preventDefault();
    }
  }

  private soltarMouse(ev: PointerEvent): void {
    this.quitarListenersMouse();
    this.el.nativeElement.classList.remove('tabs-arrastrando');

    if (this.barra) {
      this.barra.cont.style.scrollBehavior = '';
      this.suprimirClick = this.barra.movio;
      this.barra = null;
      return;
    }
    const g = this.gesto;
    this.gesto = null;
    if (!g?.mouse || !g.horizontal) return;
    const dx = ev.clientX - g.x;
    if (this.esSwipe(dx, ev.clientY - g.y)) {
      window.getSelection()?.removeAllRanges();
      this.suprimirClick = true;
      this.irA(dx);
      // Si no hay clic después del arrastre, que no se coma el siguiente.
      setTimeout(() => (this.suprimirClick = false), 0);
    }
  }

  private ponerListenersMouse(): void {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private quitarListenersMouse(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  // Rueda del mouse sobre la barra: la mueve de lado (si no caben las pestañas).
  @HostListener('wheel', ['$event'])
  rueda(ev: WheelEvent): void {
    const target = ev.target as HTMLElement;
    if (!this.esDeEsteGrupo(target)) return;
    const cont = target.closest<HTMLElement>('.mat-mdc-tab-label-container');
    if (!cont || !this.header()?.contains(cont) || cont.scrollWidth <= cont.clientWidth) return;
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
      cont.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }
  }
}
