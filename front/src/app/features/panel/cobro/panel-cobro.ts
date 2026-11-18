import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService } from '../../../core/services/notification.service';
import { PanelAuthService, PanelCobroService } from '../../../core/services/panel';
import { CobroMes } from '../../../models/panel.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { hoyEnZona } from '../../../shared/utils/fecha-negocio';
import { claseEstado, guardarDescarga, textoEstado, textoMes, textoTipoCobro, vistaPanel } from '../comun/panel-util';

/**
 * Panel → Cobro (009): por empresa, en un mes, su plan, sus empleados del mes
 * (el máximo de los conteos diarios) y el importe. Exportable a Excel.
 */
@Component({
  selector: 'app-panel-cobro',
  imports: [ReactiveFormsModule, CurrencyPipe, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatProgressBarModule,
    MatSnackBarModule, TablaTarjetasDirective],
  templateUrl: './panel-cobro.html',
  styleUrl: '../comun/panel.scss'
})
export class PanelCobro implements OnInit {
  private readonly api = inject(PanelCobroService);
  private readonly avisos = inject(NotificationService);
  private readonly panel = inject(PanelAuthService);

  readonly datos = signal<CobroMes | null>(null);
  readonly cargando = signal(false);
  readonly exportando = signal(false);
  readonly mes = new FormControl(hoyEnZona(this.panel.zona()).slice(0, 7), { nonNullable: true });
  readonly vl = vistaPanel('cobro');
  readonly columnas = ['empresa', 'plan', 'empleados', 'precio', 'importe'];
  readonly textoMes = textoMes;
  readonly textoTipoCobro = textoTipoCobro;
  readonly textoEstado = textoEstado;
  readonly claseEstado = claseEstado;

  ngOnInit(): void { this.buscar(); }

  private mesValido(): string | null {
    const m = this.mes.value;
    if (/^\d{4}-\d{2}$/.test(m)) return m;
    this.avisos.error('Escoge el mes');
    return null;
  }

  buscar(): void {
    const m = this.mesValido();
    if (!m) return;
    this.cargando.set(true);
    this.api.getCobroMes(m).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.datos.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible generar el reporte de cobro'); }
    });
  }

  exportar(): void {
    const m = this.mesValido();
    if (!m || this.exportando()) return;
    this.exportando.set(true);
    this.api.exportarCobroMes(m).subscribe({
      next: async blob => {
        this.exportando.set(false);
        const error = await guardarDescarga(blob, `cobro-${m}.xlsx`);
        if (error) this.avisos.error(error);
      },
      error: () => { this.exportando.set(false); this.avisos.error('No fue posible exportar el reporte de cobro'); }
    });
  }
}
