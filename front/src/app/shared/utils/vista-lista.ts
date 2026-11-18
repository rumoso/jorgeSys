import { computed, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { PreferenciasService } from '../../core/services/preferencias.service';

export type Vista = 'tabla' | 'cards';

/**
 * Tabla o tarjetas en una lista: sola cambia a tarjetas por debajo de 768px y
 * el usuario puede alternar a mano. La elección se guarda como preferencia
 * del usuario (003a), por pantalla y por categoría (escritorio / celular):
 * elegir tabla en escritorio no fuerza tabla en el celular.
 *
 * Llamar en el contexto de inyección (campo o constructor del componente).
 */
export function vistaLista(pantalla: string) {
  const prefs = inject(PreferenciasService);
  const celular = toSignal(inject(BreakpointObserver).observe('(max-width: 768px)').pipe(map(r => r.matches)), { initialValue: false });
  const clave = () => `${pantalla}_${celular() ? 'mobile' : 'desktop'}`;

  const vista = computed<Vista>(() => {
    const guardada = prefs.valores()['vista']?.[clave()] as Vista | undefined;
    return guardada === 'tabla' || guardada === 'cards' ? guardada : (celular() ? 'cards' : 'tabla');
  });

  const alternar = () => prefs.guardar('vista', clave(), vista() === 'tabla' ? 'cards' : 'tabla');

  return { vista, alternar, celular };
}
