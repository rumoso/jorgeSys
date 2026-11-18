import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService } from '../../../core/services/notification.service';
import { PanelAuthService, PanelBitacoraService, PanelEmpresasService } from '../../../core/services/panel';
import { EmpresaPanel, MovimientoBitacora } from '../../../models/panel.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { PaginadorEs } from '../../../shared/utils/paginador-es';
import { vistaPanel } from '../comun/panel-util';

/** Panel → Bitácora del producto (009): solo lectura, con filtros y paginada. */
@Component({
  selector: 'app-panel-bitacora',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatProgressBarModule,
    MatPaginatorModule, MatSnackBarModule, TablaTarjetasDirective, FechaSucursalPipe],
  providers: [{ provide: MatPaginatorIntl, useClass: PaginadorEs }],
  templateUrl: './panel-bitacora.html',
  styleUrl: '../comun/panel.scss'
})
export class PanelBitacora implements OnInit {
  private readonly api = inject(PanelBitacoraService);
  private readonly empresasApi = inject(PanelEmpresasService);
  private readonly avisos = inject(NotificationService);
  readonly panel = inject(PanelAuthService);

  readonly filas = signal<MovimientoBitacora[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly porPagina = signal(50);
  readonly cargando = signal(false);
  readonly superadmins = signal<{ idSuperadmin: number; nombre: string }[]>([]);
  readonly acciones = signal<string[]>([]);
  readonly empresas = signal<EmpresaPanel[]>([]);
  readonly abiertos = signal<Set<number>>(new Set());
  readonly vl = vistaPanel('bitacora');
  readonly columnas = ['fecha', 'quien', 'accion', 'empresa', 'objeto', 'motivo', 'detalle'];

  readonly filtros = inject(FormBuilder).nonNullable.group({ desde: [''], hasta: [''], idSuperadmin: [0], idEmpresa: [0], accion: [''] });

  ngOnInit(): void {
    this.api.getFiltrosBitacora().subscribe(r => {
      if (r.status_code === 0) { this.superadmins.set(r.data.superadmins); this.acciones.set(r.data.acciones); }
    });
    this.empresasApi.getEmpresas({}).subscribe(r => { if (r.status_code === 0) this.empresas.set(r.data); });
    this.buscar();
  }

  buscar(pagina = 1): void {
    const f = this.filtros.getRawValue();
    this.cargando.set(true);
    this.api.getBitacora({
      desde: f.desde, hasta: f.hasta, idSuperadmin: f.idSuperadmin || null, idEmpresa: f.idEmpresa || null, accion: f.accion,
      pagina, porPagina: this.porPagina()
    }).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.filas.set(r.data.filas);
        this.total.set(r.data.total);
        this.pagina.set(r.data.pagina);
        this.abiertos.set(new Set());
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar la bitácora'); }
    });
  }

  limpiar(): void { this.filtros.reset(); this.buscar(); }

  paginar(e: PageEvent): void {
    this.porPagina.set(e.pageSize);
    this.buscar(e.pageIndex + 1);
  }

  alternar(id: number): void {
    this.abiertos.update(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  json(v: unknown): string { return v === null || v === undefined ? '—' : JSON.stringify(v, null, 2); }
}
