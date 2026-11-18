import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService } from '../../../core/services/notification.service';
import { PanelAuthService, PanelEmpresasService, PanelPlanesService } from '../../../core/services/panel';
import { ESTADOS_EMPRESA, EmpresaPanel, Plan } from '../../../models/panel.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { claseEstado, textoEstado, vistaPanel } from '../comun/panel-util';
import { EmpresaAltaModal } from './mdl';

/**
 * Panel → Empresas (009): todas las empresas con su estado, plan y uso.
 * Búsqueda manual (botón Buscar), tabla o tarjetas.
 */
@Component({
  selector: 'app-panel-empresas',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, TablaTarjetasDirective, FechaSucursalPipe],
  templateUrl: './panel-empresas.html',
  styleUrl: '../comun/panel.scss'
})
export class PanelEmpresas implements OnInit {
  private readonly api = inject(PanelEmpresasService);
  private readonly planesApi = inject(PanelPlanesService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly avisos = inject(NotificationService);
  readonly panel = inject(PanelAuthService);

  readonly lista = signal<EmpresaPanel[]>([]);
  readonly planes = signal<Plan[]>([]);
  readonly cargando = signal(false);
  readonly vl = vistaPanel('empresas');
  readonly columnas = ['empresa', 'estado', 'plan', 'empleados', 'usuarios', 'ultimoAcceso', 'alta', 'acciones'];
  readonly ESTADOS = ESTADOS_EMPRESA;
  readonly textoEstado = textoEstado;
  readonly claseEstado = claseEstado;

  readonly filtros = inject(FormBuilder).nonNullable.group({ q: [''], estado: [''], idPlan: [0] });

  ngOnInit(): void {
    this.planesApi.getPlanes().subscribe(r => { if (r.status_code === 0) this.planes.set(r.data); });
    this.buscar();
  }

  buscar(): void {
    const f = this.filtros.getRawValue();
    this.cargando.set(true);
    this.api.getEmpresas({ q: f.q.trim(), estado: f.estado, idPlan: f.idPlan || null }).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar las empresas'); }
    });
  }

  limpiar(): void {
    this.filtros.reset();
    this.buscar();
  }

  abrir(e: EmpresaPanel): void { this.router.navigate(['/panel/empresas', e.idEmpresa]); }

  nueva(): void {
    this.dialog.open(EmpresaAltaModal, { width: '720px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe((id: number | null) => {
        if (!id) return;
        this.buscar();
      });
  }
}
