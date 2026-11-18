import { Injectable, signal } from '@angular/core';

import { ResumenHorario } from '../../../models/horarios.models';

export interface HorarioPorConfirmar { plantilla: ResumenHorario; sucursal: string | null; }

/**
 * Horario cargado pero NO guardado para un empleado (análisis 006 §7): al
 * cambiar su sucursal principal y escoger "toma el de la nueva sucursal", la
 * ficha deja aquí la plantilla nueva y abre la pestaña Horario, que la carga
 * en el editor para ajustar y confirmar con "Guardar horario". Solo vive en
 * memoria mientras la ficha está abierta; no es una preferencia ni un dato.
 */
@Injectable({ providedIn: 'root' })
export class HorarioPendiente {
  readonly pendientes = signal<ReadonlyMap<number, HorarioPorConfirmar>>(new Map());

  poner(idEmpleado: number, h: HorarioPorConfirmar): void {
    this.pendientes.update(m => new Map(m).set(idEmpleado, h));
  }

  /** Lo entrega una vez y lo quita. */
  tomar(idEmpleado: number): HorarioPorConfirmar | null {
    const h = this.pendientes().get(idEmpleado) ?? null;
    if (h) this.pendientes.update(m => { const n = new Map(m); n.delete(idEmpleado); return n; });
    return h;
  }
}
