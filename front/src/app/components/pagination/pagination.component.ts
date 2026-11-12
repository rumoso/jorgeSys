import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { Pagination } from 'src/app/interfaces/general.interfaces';

@Component({
    selector: 'app-pagination',
    templateUrl: './pagination.component.html',
    styleUrls: ['./pagination.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PaginationComponent implements OnInit {
  
  @Input() IPagination!: Pagination;

  @Output() OPagination = new EventEmitter<Pagination>();

  pagination: Pagination = {
    search: '',
    length: 0,
    pageSize: 5,
    pageIndex: 0,
    pageSizeOptions: [5, 10, 25, 100]
  }

  constructor(
    private paginator: MatPaginatorIntl
  ) { }

  emitPagination( event: PageEvent ) {
    this.pagination.length = event.length;
    this.pagination.pageSize = event.pageSize;
    this.pagination.pageIndex = event.pageIndex;
    this.OPagination.emit( this.pagination );
  }

  ngOnInit(): void {
    // CONFIGURACIÓN DE LOS LABEL DE LA PAGINACIÓN
    this.paginator.itemsPerPageLabel = "Registros por página";
    this.paginator.nextPageLabel = "Siguiente página";
    this.paginator.previousPageLabel = "Página anterior";
    this.paginator.firstPageLabel = "Primera Página";
    this.paginator.lastPageLabel = "Última Página";

    this.pagination = this.IPagination
  }
}
