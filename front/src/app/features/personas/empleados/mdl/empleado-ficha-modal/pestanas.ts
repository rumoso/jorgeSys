import { Type } from '@angular/core';

/**
 * Pestañas que otros análisis agregan a la ficha del empleado (análisis 004):
 * Face ID (005), Horario (006), Asistencia y ausencias (008)…
 *
 * Cada una es un componente standalone que recibe el input `idEmpleado`
 * (number) y hace sus propias consultas. Se muestra solo si el usuario tiene
 * su menú (o su acción, si se indica). La ficha no se toca: basta con agregar
 * el renglón aquí.
 *
 *   { etiqueta: 'Horario', icono: 'schedule', menu: 'horarios',
 *     componente: () => import('…/horario-empleado').then(c => c.HorarioEmpleado) }
 */
export interface PestanaEmpleado {
  etiqueta: string;
  icono: string;
  menu?: string;
  accion?: string;
  componente: () => Promise<Type<unknown>>;
}

export const PESTANAS_EMPLEADO: PestanaEmpleado[] = [
  // 005: consentimiento, rostro y excepción de formas de checar.
  { etiqueta: 'Face ID', icono: 'face', menu: 'empleados',
    componente: () => import('../../../../checador/rostro-empleado/rostro-empleado').then(c => c.RostroEmpleado) },
  // 006: horario semanal, calendario de días programados e historial.
  { etiqueta: 'Horario', icono: 'schedule', menu: 'horarios',
    componente: () => import('../../../../checador/horarios/horario-empleado/horario-empleado').then(c => c.HorarioEmpleado) }
];
