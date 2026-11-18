import {
  Directive,
  ElementRef,
  Input,
  inject,
  OnInit,
  OnDestroy,
  AfterViewInit,
  effect,
  signal,
  Injector
} from '@angular/core';

/**
 * Directiva standalone para manejo automático de foco en inputs
 * Especialmente útil para la experiencia de usuario en sistemas POS
 *
 * Uso básico (foco inmediato):
 * <input appAutoFocus>
 *
 * Uso con delay:
 * <input appAutoFocus="500">
 *
 * Uso condicional:
 * <input [appAutoFocus]="shouldFocus">
 *
 * Uso con selección automática del texto:
 * <input appAutoFocus appAutoFocusSelect="true">
 *
 * Uso con navegación por Enter:
 * <input appAutoFocus appAutoFocusNextOnEnter="nextInput">
 *
 * Uso en formularios dinámicos:
 * <input appAutoFocus [appAutoFocusCondition]="isActive">
 */
@Directive({
  selector: '[appAutoFocus]',
  standalone: true
})
export class AutoFocusDirective implements OnInit, OnDestroy, AfterViewInit {

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  // Inputs de la directiva
  @Input('appAutoFocus')
  focusDelay: number | boolean | string = true;

  @Input('appAutoFocusSelect')
  selectText: boolean = false;

  @Input('appAutoFocusCondition')
  condition: boolean = true;

  @Input('appAutoFocusNextOnEnter')
  nextElementId: string | null = null;

  @Input('appAutoFocusTrigger')
  set trigger(value: any) {
    this.triggerSignal.set(value);
  }

  private readonly triggerSignal = signal<any>(null);
  private timeoutId: number | null = null;
  private keydownListener: ((event: KeyboardEvent) => void) | null = null;
  private effectRef: any;

  ngOnInit(): void {
    // Configurar listener para Enter si se especifica siguiente elemento
    if (this.nextElementId) {
      this.setupEnterNavigation();
    }

    // Effect para reactividad con el trigger
    this.effectRef = effect(() => {
      // Observar cambios en el trigger
      this.triggerSignal();
      // Re-evaluar foco cuando cambie el trigger
      if (this.condition) {
        this.applyFocus();
      }
    }, { injector: this.injector });
  }

  ngAfterViewInit(): void {
    // Aplicar foco inicial después de que la vista esté lista
    if (this.shouldApplyFocus()) {
      this.applyFocus();
    }
  }

  ngOnDestroy(): void {
    // Limpiar timeout si existe
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Remover listener de teclado
    if (this.keydownListener) {
      this.elementRef.nativeElement.removeEventListener('keydown', this.keydownListener);
    }

    // Destruir effect
    if (this.effectRef) {
      this.effectRef.destroy();
    }
  }

  private shouldApplyFocus(): boolean {
    // Verificar que el elemento sea focuseable
    const element = this.elementRef.nativeElement;
    if (!this.isElementFocusable(element)) {
      return false;
    }

    // Verificar condición
    if (!this.condition) {
      return false;
    }

    // Verificar si el input está habilitado
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.disabled || element.readOnly) {
        return false;
      }
    }

    return true;
  }

  private applyFocus(): void {
    if (!this.shouldApplyFocus()) {
      return;
    }

    // Calcular delay
    let delay = 0;
    if (typeof this.focusDelay === 'number') {
      delay = this.focusDelay;
    } else if (typeof this.focusDelay === 'string') {
      delay = parseInt(this.focusDelay, 10) || 0;
    }

    // Aplicar foco con o sin delay
    if (delay > 0) {
      this.timeoutId = window.setTimeout(() => {
        this.setFocus();
      }, delay);
    } else {
      // Usar requestAnimationFrame para asegurar que el DOM esté listo
      requestAnimationFrame(() => {
        this.setFocus();
      });
    }
  }

  private setFocus(): void {
    const element = this.elementRef.nativeElement;

    try {
      element.focus();

      // Seleccionar texto si se especifica
      if (this.selectText && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        element.select();
      }
    } catch (error) {
      console.warn('AutoFocus: No se pudo hacer foco en el elemento', error);
    }
  }

  private setupEnterNavigation(): void {
    if (!this.nextElementId) return;

    this.keydownListener = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.focusNextElement();
      }
    };

    this.elementRef.nativeElement.addEventListener('keydown', this.keydownListener);
  }

  private focusNextElement(): void {
    if (!this.nextElementId) return;

    // Buscar el siguiente elemento por ID
    const nextElement = document.getElementById(this.nextElementId);
    if (nextElement && this.isElementFocusable(nextElement)) {
      nextElement.focus();

      // Si es un input de texto, seleccionar contenido
      if (nextElement instanceof HTMLInputElement && nextElement.type === 'text') {
        nextElement.select();
      }
    }
  }

  private isElementFocusable(element: HTMLElement): boolean {
    // Verificar si el elemento puede recibir foco
    const focusableElements = [
      'input', 'textarea', 'select', 'button', 'a'
    ];

    const tagName = element.tagName.toLowerCase();

    // Debe ser un elemento focuseable
    if (!focusableElements.includes(tagName) && element.tabIndex < 0) {
      return false;
    }

    // No debe estar oculto
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    return true;
  }

  /**
   * Método público para forzar foco manualmente
   */
  public forceFocus(): void {
    this.setFocus();
  }

  /**
   * Método público para verificar si el elemento tiene foco
   */
  public hasFocus(): boolean {
    return document.activeElement === this.elementRef.nativeElement;
  }
}
