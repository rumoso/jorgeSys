import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { GlobalService, NotificationService, RolesService } from '../../../core/services';
import { Rol } from '../../../models/permisos.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { RolModal, RolModalData, VerComoModal } from './mdl';

/** Empresa → Roles y permisos (análisis 002). */
@Component({
  selector: 'app-roles',
  imports: [ReactiveFormsModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, TablaTarjetasDirective],
  templateUrl: './roles.html'
})
export class Roles implements OnInit {
  private readonly api = inject(RolesService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  readonly global = inject(GlobalService);

  readonly lista = signal<Rol[]>([]);
  readonly cargando = signal(false);
  readonly estado = new FormControl<'activos' | 'todos'>('activos', { nonNullable: true });
  readonly vl = vistaLista('roles');
  readonly columnas = ['nombre', 'usuarios', 'estado', 'acciones'];

  ngOnInit(): void { this.buscar(); }

  buscar(): void {
    this.cargando.set(true);
    this.api.getRoles(this.estado.value).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los roles'); }
    });
  }

  abrir(rol?: Rol): void {
    const data: RolModalData = { rol: rol ?? null, roles: this.lista().filter(r => r.bActivo) };
    this.dialog.open(RolModal, { data, width: '760px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) this.buscar(); });
  }

  verComo(rol: Rol): void {
    this.dialog.open(VerComoModal, { data: rol, width: '360px', panelClass: 'rh-dialog-panel' });
  }

  cambiarEstado(rol: Rol): void {
    const activar = !rol.bActivo;
    if (!activar && !confirm(`¿Desactivar el rol ${rol.nombre}? Sus ${rol.usuarios} usuario(s) pierden lo que este rol les daba.`)) return;
    this.api.disableRol(rol.idRol, activar).subscribe(r => {
      if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); this.global.cargar(); }
      else this.avisos.error(r.message);
    });
  }
}
