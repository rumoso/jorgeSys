import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { EmpleadosService, GlobalService, NotificationService } from '../../../core/services';
import { CatalogosEmpleado, EmpleadoLista } from '../../../models/empleados.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { FotoEmpleado } from '../../../shared/components/foto-empleado/foto-empleado';
import { FechaNegocioPipe } from '../../../shared/pipes/fecha-negocio.pipe';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { PaginadorEs } from '../../../shared/utils/paginador-es';
import { EmpleadoAltaModal, EmpleadoAltaModalData, EmpleadoFichaModal, EmpleadoFichaModalData, ImportarEmpleadosModal } from './mdl';

const CATALOGOS_VACIOS: CatalogosEmpleado = { sucursales: [], puestos: [], departamentos: [], usuarios: [] };

/**
 * Personas → Empleados (análisis 004): lista con búsqueda y filtros (manual,
 * con el botón Buscar), tabla o tarjetas y paginado. Solo trae a los
 * empleados de las sucursales del usuario (principal u operativa).
 */
@Component({
  selector: 'app-empleados',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatPaginatorModule, MatSnackBarModule, TablaTarjetasDirective, FotoEmpleado, FechaNegocioPipe],
  providers: [{ provide: MatPaginatorIntl, useClass: PaginadorEs }],
  templateUrl: './empleados.html',
  styleUrl: './empleados.scss'
})
export class Empleados implements OnInit {
  private readonly api = inject(EmpleadosService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  readonly global = inject(GlobalService);

  readonly lista = signal<EmpleadoLista[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly porPagina = signal(25);
  readonly cargando = signal(false);
  readonly catalogos = signal<CatalogosEmpleado>(CATALOGOS_VACIOS);
  readonly vl = vistaLista('empleados');
  readonly columnas = ['nombre', 'numero', 'sucursal', 'puesto', 'estado', 'acciones'];

  readonly filtros = inject(FormBuilder).nonNullable.group({
    q: [''],
    idSucursal: [0],
    idPuesto: [0],
    idDepartamento: [0],
    estado: ['activos' as 'activos' | 'baja' | 'todos']
  });

  /** 009: aviso del plan (AVISO desde el porcentaje, LIMITE al 100 %). Solo para quien da de alta, reactiva o carga. */
  readonly avisoPlan = signal<{ nivel: 'NINGUNO' | 'AVISO' | 'LIMITE'; mensaje: string | null } | null>(null);

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarAvisoPlan();
    this.buscar();
  }

  cargarAvisoPlan(): void {
    if (!['empleados_CreateUpdate', 'empleados_Baja', 'empleados_Importar'].some(a => this.global.tienePermiso(a))) return;
    this.api.getAvisoPlan().subscribe({ next: r => this.avisoPlan.set(r.status_code === 0 ? r.data : null), error: () => { /* el aviso es opcional */ } });
  }

  cargarCatalogos(): void {
    this.api.getCatalogosEmpleado().subscribe(r => { if (r.status_code === 0) this.catalogos.set(r.data); });
  }

  buscar(pagina = 1): void {
    const f = this.filtros.getRawValue();
    this.cargando.set(true);
    this.api.getEmpleados({
      q: f.q.trim(), idSucursal: f.idSucursal || null, idPuesto: f.idPuesto || null, idDepartamento: f.idDepartamento || null,
      estado: f.estado, pagina, porPagina: this.porPagina()
    }).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.lista.set(r.data.filas);
        this.total.set(r.data.total);
        this.pagina.set(r.data.pagina);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los empleados'); }
    });
  }

  limpiar(): void {
    this.filtros.reset();
    this.buscar();
  }

  paginar(e: PageEvent): void {
    this.porPagina.set(e.pageSize);
    this.buscar(e.pageIndex + 1);
  }

  nuevo(): void {
    const data: EmpleadoAltaModalData = { catalogos: this.catalogos() };
    this.dialog.open(EmpleadoAltaModal, { data, width: '560px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe((id: number | null) => {
        if (!id) return;
        this.cargarAvisoPlan();
        this.buscar(this.pagina());
        this.abrir(id);
      });
  }

  abrir(idEmpleado: number): void {
    const data: EmpleadoFichaModalData = { idEmpleado };
    this.dialog.open(EmpleadoFichaModal, { data, width: '860px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: false })
      .afterClosed().subscribe(cambios => { if (cambios) { this.buscar(this.pagina()); this.cargarCatalogos(); this.cargarAvisoPlan(); } });
  }

  importar(): void {
    this.dialog.open(ImportarEmpleadosModal, { width: '920px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: false })
      .afterClosed().subscribe(cargados => { if (cargados) { this.buscar(); this.cargarCatalogos(); this.cargarAvisoPlan(); } });
  }
}
