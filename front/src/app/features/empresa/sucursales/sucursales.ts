import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { SucursalesService, NotificationService, AuthService, GlobalService } from '../../../core/services';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { urlAbrir } from '../../../shared/utils/ubicacion';
import { SucursalModal, SucursalModalData, Sucursal, ZonaHoraria } from './mdl';

/**
 * Empresa → Sucursales (análisis 001). Cada botón depende de su acción (002).
 * Las que tienen ubicación llevan el ícono para abrirla en Google Maps (015).
 */
@Component({
  selector: 'app-sucursales',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, TablaTarjetasDirective],
  templateUrl: './sucursales.html'
})
export class Sucursales implements OnInit {
  private readonly api = inject(SucursalesService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  private readonly auth = inject(AuthService);
  readonly global = inject(GlobalService);

  readonly lista = signal<Sucursal[]>([]);
  readonly zonas = signal<ZonaHoraria[]>([]);
  readonly cargando = signal(false);
  readonly estado = new FormControl<'activas' | 'todas'>('activas', { nonNullable: true });
  readonly vl = vistaLista('sucursales');
  readonly columnas = ['nombre', 'zona', 'direccion', 'estado', 'acciones'];
  readonly urlAbrir = urlAbrir;

  ngOnInit(): void {
    this.api.getZonasHorarias().subscribe(r => { if (r.status_code === 0) this.zonas.set(r.data); });
    this.buscar();
  }

  buscar(): void {
    this.cargando.set(true);
    this.api.getSucursales(this.estado.value).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar las sucursales'); }
    });
  }

  abrir(sucursal?: Sucursal): void {
    const data: SucursalModalData = { sucursal: sucursal ?? null, zonas: this.zonas() };
    this.dialog.open(SucursalModal, { data, width: '520px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) { this.buscar(); this.auth.refrescarSesion(); } });
  }

  cambiarEstado(s: Sucursal): void {
    const activar = !s.bActivo;
    if (!activar && !confirm(`¿Desactivar la sucursal ${s.nombre}? Sus datos se conservan y se puede volver a activar.`)) return;
    this.api.disableSucursal(s.idSucursal, activar).subscribe(r => {
      if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); this.auth.refrescarSesion(); }
      else this.avisos.error(r.message);
    });
  }
}
