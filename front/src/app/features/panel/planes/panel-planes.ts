import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService } from '../../../core/services/notification.service';
import { PanelPlanesService } from '../../../core/services/panel';
import { Plan } from '../../../models/panel.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { textoTipoCobro, vistaPanel } from '../comun/panel-util';
import { PlanModal, PlanModalData } from './mdl';

/** Panel → Planes (009): catálogo de planes del producto. Un plan en uso no se desactiva. */
@Component({
  selector: 'app-panel-planes',
  imports: [ReactiveFormsModule, CurrencyPipe, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, TablaTarjetasDirective],
  templateUrl: './panel-planes.html',
  styleUrl: '../comun/panel.scss'
})
export class PanelPlanes implements OnInit {
  private readonly api = inject(PanelPlanesService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);

  readonly lista = signal<Plan[]>([]);
  readonly cargando = signal(false);
  readonly mostrar = new FormControl<'activos' | 'todos'>('todos', { nonNullable: true });
  readonly vl = vistaPanel('planes');
  readonly columnas = ['nombre', 'tipo', 'limite', 'precio', 'empresas', 'estado', 'acciones'];
  readonly textoTipoCobro = textoTipoCobro;

  ngOnInit(): void { this.buscar(); }

  buscar(): void {
    this.cargando.set(true);
    this.api.getPlanes(this.mostrar.value === 'activos').subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los planes'); }
    });
  }

  abrir(plan?: Plan): void {
    const data: PlanModalData = { plan: plan ?? null };
    this.dialog.open(PlanModal, { data, width: '480px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) this.buscar(); });
  }

  cambiarEstado(p: Plan): void {
    const activar = !p.bActivo;
    if (!activar && !confirm(`¿Desactivar el plan ${p.nombre}? Ya no se podrá asignar a otras empresas.`)) return;
    (activar ? this.api.enablePlan(p.idPlan) : this.api.disablePlan(p.idPlan)).subscribe({
      next: r => {
        if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); }
        else this.avisos.error(r.message);
      },
      error: () => this.avisos.error('No fue posible cambiar el plan')
    });
  }
}
