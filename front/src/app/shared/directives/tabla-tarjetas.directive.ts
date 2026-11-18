import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Una <table mat-table> que puede verse como tarjetas (celular) sin
 * reescribir su plantilla: copia el título de cada columna a sus celdas
 * (`data-label`), y los estilos de `styles/components/_tabla-tarjetas.scss`
 * acomodan cada renglón como tarjeta con "Etiqueta: valor" cuando un
 * contenedor de arriba tiene la clase `vista-cards`.
 *
 * - La primera columna es el título de la tarjeta (sin etiqueta).
 * - Las columnas `.col-acciones` van al pie de la tarjeta (sin etiqueta).
 * - Una fila de detalle (`.vp-detalle-row`) ocupa todo el ancho.
 *
 * Se vuelve a etiquetar sola cuando la tabla cambia (paginar, buscar,
 * mostrar u ocultar columnas).
 *
 * Uso: <table mat-table appTablaTarjetas ...> dentro de un
 * <div [class.vista-cards]="vista() === 'cards'">.
 */
@Directive({
  selector: 'table[appTablaTarjetas]',
  standalone: true,
  host: { class: 'tabla-tarjetas' }
})
export class TablaTarjetasDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLTableElement>>(ElementRef);
  private observer?: MutationObserver;
  private pendiente = false;

  ngAfterViewInit(): void {
    this.etiquetar();
    this.observer = new MutationObserver(() => this.programar());
    this.observer.observe(this.el.nativeElement, { childList: true, subtree: true, characterData: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private programar(): void {
    if (this.pendiente) return;
    this.pendiente = true;
    requestAnimationFrame(() => {
      this.pendiente = false;
      this.etiquetar();
    });
  }

  private columna(celda: Element): string | null {
    for (const c of Array.from(celda.classList)) {
      if (c.startsWith('mat-column-')) return c;
    }
    return null;
  }

  private etiquetar(): void {
    const tabla = this.el.nativeElement;
    const titulos = new Map<string, string>();
    tabla.querySelectorAll(':scope > thead th, :scope > thead td').forEach(th => {
      const col = this.columna(th);
      if (col) titulos.set(col, (th.textContent || '').trim());
    });
    tabla.querySelectorAll(':scope > tbody > tr > td, :scope > tfoot > tr > td').forEach(td => {
      const col = this.columna(td);
      const titulo = col ? titulos.get(col) ?? '' : '';
      if (td.getAttribute('data-label') !== titulo) td.setAttribute('data-label', titulo);
    });
  }
}
