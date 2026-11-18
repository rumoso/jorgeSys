import { Directive, ElementRef, HostListener, Input, Output, EventEmitter, AfterViewInit, inject } from '@angular/core';

/**
 * Navegación por Enter entre campos de un formulario compacto (catálogos):
 * Enter avanza al siguiente input/select/textarea visible en orden de DOM
 * dentro del elemento donde se aplica la directiva (normalmente el <form>),
 * y en el último campo dispara `appEnterSecuencialFin` (el modal lo conecta
 * a `guardar()`).
 *
 * Con `appEnterSecuencialFocoPrimero` en true, al iniciar pone el foco (y
 * selecciona el texto) en el primer campo — úsalo solo en modo creación;
 * en edición/detalle el usuario debe elegir dónde empezar, así que se deja
 * en false (o se omite el input).
 *
 * No intercepta Enter dentro de un <textarea> (deja el salto de línea), ni
 * mientras un mat-autocomplete tiene el panel abierto (aria-expanded=true)
 * — ahí Enter debe confirmar la opción resaltada, no saltar de campo — ni
 * en campos marcados `data-enter-secuencial-skip` (mini-formularios propios
 * con su Enter ya cableado a mano, ej. "agregar precio especial").
 *
 * Uso:
 * <form [formGroup]="form" appEnterSecuencial
 *       [appEnterSecuencialFocoPrimero]="modo() === 'crear'"
 *       (appEnterSecuencialFin)="guardar()">
 */
@Directive({
  selector: '[appEnterSecuencial]',
  standalone: true
})
export class EnterSecuencialDirective implements AfterViewInit {
  private readonly el: ElementRef<HTMLElement> = inject(ElementRef);

  @Input() appEnterSecuencialFocoPrimero = false;
  @Output() appEnterSecuencialFin = new EventEmitter<void>();

  ngAfterViewInit(): void {
    if (!this.appEnterSecuencialFocoPrimero) return;
    // Deja que el modal termine de montarse (y a Angular Material, si le
    // tocaba mover el foco por su cuenta) antes de tomar el control.
    setTimeout(() => {
      const primero = this._candidatos()[0];
      this._enfocar(primero);
    }, 80);
  }

  @HostListener('keydown.enter', ['$event'])
  onEnter(ev: Event): void {
    const event = ev as KeyboardEvent;
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tag = target.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'button') return;
    if (target.getAttribute('aria-expanded') === 'true') return; // autocomplete abierto: que Material resuelva el Enter
    if (target.hasAttribute('data-enter-secuencial-skip')) return; // mini-formulario con su propio Enter
    if ((target as HTMLInputElement).disabled || (target as HTMLInputElement).readOnly) return;

    const candidatos = this._candidatos();
    const idx = candidatos.indexOf(target);
    if (idx === -1) return;

    event.preventDefault();
    if (idx < candidatos.length - 1) {
      this._enfocar(candidatos[idx + 1]);
    } else {
      this.appEnterSecuencialFin.emit();
    }
  }

  private _enfocar(el: HTMLElement | undefined): void {
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select();
    }
  }

  private _candidatos(): HTMLElement[] {
    const nodos = Array.from(
      this.el.nativeElement.querySelectorAll<HTMLElement>('input, select, textarea')
    );
    return nodos.filter(n => {
      const campo = n as HTMLInputElement;
      if (campo.disabled || campo.readOnly) return false;
      return !!(n.offsetParent || n.getClientRects().length);
    });
  }
}
