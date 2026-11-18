/**
 * Teclas que NO modifican el texto de un input.
 *
 * Los combos de "buscar y seleccionar" del sistema hacen esto en su `keyup`:
 *
 *     cbxProductoCtrl.setValue(null);   // se invalida la selección anterior
 *     _searchProducto$.next(texto);     // y se busca de nuevo
 *
 * Eso es correcto mientras el usuario está escribiendo, pero **no** cuando la
 * tecla no cambió el texto. El caso que rompe es elegir con el teclado:
 *
 *   1. `keydown` Enter → `mat-autocomplete` dispara `optionSelected`, el
 *      handler guarda el id del producto y mueve el foco a Cantidad.
 *   2. `keyup` Enter → llega al input del producto y pone el id en **null**.
 *   3. El foco ya se fue, así que `ComboLimpiableDirective` revisa a los
 *      200 ms, ve el id en null y limpia el texto.
 *
 * Resultado: el usuario elige un artículo, el foco salta a Cantidad y el
 * artículo se borra solo. Con el ratón no pasa, porque no hay `keyup`.
 *
 * Filtrar por tecla en vez de comparar el texto anterior mantiene el handler
 * sin estado, que es como ya estaban escritos los ~27 combos del sistema.
 */
const TECLAS_SIN_TEXTO = new Set([
  // Selección y navegación dentro del autocomplete
  'Enter', 'NumpadEnter', 'Tab', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  // Modificadores: se quedan presionados mientras se teclea
  'Shift', 'Control', 'Alt', 'AltGraph', 'Meta',
  'CapsLock', 'NumLock', 'ScrollLock',
  // Funciones
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Insert', 'ContextMenu', 'Pause', 'PrintScreen'
]);

/**
 * true si esa tecla pudo haber cambiado el texto del input.
 *
 * Uso en los combos:
 *
 *     cbxProductoKeyUp(e: KeyboardEvent, t: string): void {
 *       if (!teclaCambiaTexto(e)) return;
 *       this.cbxProductoCtrl.setValue(null);
 *       this._searchProducto$.next(t);
 *     }
 */
export const teclaCambiaTexto = (e: KeyboardEvent): boolean => !TECLAS_SIN_TEXTO.has(e.key);
