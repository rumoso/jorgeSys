import { Pipe, PipeTransform } from '@angular/core';
import { fechaCorta } from '../utils/fecha-negocio';

/**
 * Fecha de negocio 'AAAA-MM-DD' (ingreso, baja, "a partir de") → 'DD/MM/AAAA'.
 * Es texto, no un instante: no usa zona. Para instantes, `fechaSucursal`.
 */
@Pipe({ name: 'fechaNegocio' })
export class FechaNegocioPipe implements PipeTransform {
  transform(fecha: string | null | undefined): string { return fechaCorta(fecha); }
}
