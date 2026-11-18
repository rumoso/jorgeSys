import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { DepartamentosService, GlobalService, NotificationService, PuestosService } from '../../../core/services';
import { CatalogoSimpleItem } from '../../../models/empleados.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { CatalogoSimpleModal, CatalogoSimpleModalData } from './mdl';
import { tipoCatalogo } from './tipos';

/**
 * Personas → Puestos y Personas → Departamentos (análisis 004): una sola
 * pantalla para los dos; la ruta dice cuál es.
 */
@Component({
  selector: 'app-catalogo-simple',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, TablaTarjetasDirective],
  templateUrl: './catalogo-simple.html'
})
export class CatalogoSimple implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  readonly global = inject(GlobalService);
  readonly tipo = tipoCatalogo(
    inject(ActivatedRoute).snapshot.routeConfig?.path === 'departamentos' ? 'departamentos' : 'puestos',
    inject(PuestosService), inject(DepartamentosService));

  readonly lista = signal<CatalogoSimpleItem[]>([]);
  readonly cargando = signal(false);
  readonly estado = new FormControl<'activos' | 'todos'>('activos', { nonNullable: true });
  readonly vl = vistaLista(this.tipo.clave);
  readonly columnas = ['nombre', 'empleados', 'estado', 'acciones'];

  ngOnInit(): void { this.buscar(); }

  buscar(): void {
    this.cargando.set(true);
    this.tipo.listar(this.estado.value).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error(`No fue posible consultar los ${this.tipo.titulo.toLowerCase()}`); }
    });
  }

  abrir(item?: CatalogoSimpleItem): void {
    const data: CatalogoSimpleModalData = { tipo: this.tipo, item: item ?? null };
    this.dialog.open(CatalogoSimpleModal, { data, width: '420px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(guardado => { if (guardado) this.buscar(); });
  }

  cambiarEstado(item: CatalogoSimpleItem): void {
    const activar = !item.bActivo;
    if (!activar && !confirm(item.empleados > 0
      ? `${item.nombre} tiene ${item.empleados} empleado(s) activo(s). Lo conservan, pero ya no se podrá escoger. ¿Desactivarlo?`
      : `¿Desactivar ${item.nombre}?`)) return;
    this.tipo.cambiarEstado(item.id, activar).subscribe(r => {
      if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); }
      else this.avisos.error(r.message);
    });
  }
}
