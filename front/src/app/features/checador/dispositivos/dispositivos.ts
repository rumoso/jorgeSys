import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService, DispositivosService, GlobalService, NotificationService } from '../../../core/services';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { Dispositivo } from '../../../models/checador.models';
import { DispositivoModal, DispositivoModalData } from './mdl';

/**
 * Checador → Dispositivos (análisis 005 §5): los dispositivos checadores de
 * cada sucursal, con estado, última conexión y último marcaje. Agregar,
 * revocar y eliminar un pendiente dependen cada uno de su permiso.
 */
@Component({
  selector: 'app-dispositivos',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, TablaTarjetasDirective, FechaSucursalPipe],
  templateUrl: './dispositivos.html'
})
export class Dispositivos implements OnInit {
  private readonly api = inject(DispositivosService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  readonly auth = inject(AuthService);
  readonly global = inject(GlobalService);

  readonly lista = signal<Dispositivo[]>([]);
  readonly cargando = signal(false);
  readonly sucursal = new FormControl<number | null>(this.auth.sucursalActiva());
  readonly vl = vistaLista('dispositivos');
  readonly columnas = ['nombre', 'sucursal', 'estado', 'conexion', 'marcaje', 'acciones'];

  ngOnInit(): void { this.buscar(); }

  buscar(): void {
    this.cargando.set(true);
    this.api.getDispositivos(this.sucursal.value).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los dispositivos'); }
    });
  }

  abrir(dispositivo: Dispositivo | null = null): void {
    const data: DispositivoModalData = { dispositivo, idSucursal: this.sucursal.value };
    this.dialog.open(DispositivoModal, { data, width: '480px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) this.buscar(); });
  }

  revocar(d: Dispositivo): void {
    if (!confirm(`¿Revocar "${d.nombre}"? Deja de poder checar en su siguiente intento. Para volver a usar el equipo hay que vincularlo de nuevo.`)) return;
    this.api.revocarDispositivo(d.idDispositivo).subscribe(r => {
      if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); } else this.avisos.error(r.message);
    });
  }

  eliminar(d: Dispositivo): void {
    if (!confirm(`¿Eliminar el dispositivo pendiente "${d.nombre}"? Nunca se vinculó ni checó nada.`)) return;
    this.api.deleteDispositivoPendiente(d.idDispositivo).subscribe(r => {
      if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); } else this.avisos.error(r.message);
    });
  }

  estado(d: Dispositivo): { texto: string; clase: string } {
    if (d.estado === 'REVOCADO') return { texto: 'Revocado', clase: 'bad' };
    if (d.estado === 'PENDIENTE') return { texto: d.bCodigoVigente ? 'Pendiente · código vigente' : 'Pendiente', clase: 'warn' };
    return d.bSinConexion ? { texto: 'Sin conexión', clase: 'bad' } : { texto: 'En línea', clase: 'ok' };
  }
}
