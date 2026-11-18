import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/** Textos del paginador de Material en español. Se provee en la pantalla que lo usa. */
@Injectable()
export class PaginadorEs extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Por página';
  override nextPageLabel = 'Página siguiente';
  override previousPageLabel = 'Página anterior';
  override firstPageLabel = 'Primera página';
  override lastPageLabel = 'Última página';
  override getRangeLabel = (pagina: number, porPagina: number, total: number): string => {
    if (!total) return '0 de 0';
    const desde = pagina * porPagina + 1;
    const hasta = Math.min(desde + porPagina - 1, total);
    return `${desde}–${hasta} de ${total}`;
  };
}
