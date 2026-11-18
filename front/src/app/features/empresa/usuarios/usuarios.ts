import { Component, OnInit, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { UsuariosEmpresaService, SucursalesService, NotificationService, RolesService, GlobalService } from '../../../core/services';
import { Rol } from '../../../models/permisos.models';
import { TablaTarjetasDirective } from '../../../shared/directives/tabla-tarjetas.directive';
import { vistaLista } from '../../../shared/utils/vista-lista';
import { UsuarioAccesoModal, UsuarioAccesoModalData, UsuarioEmpresa, SucursalOpcion } from './mdl';

/**
 * Empresa → Usuarios (análisis 001 y 002): quién entra a ESTA empresa, con
 * qué roles y permisos directos, y a qué sucursales tiene acceso. Cada botón
 * depende de su acción.
 */
@Component({
  selector: 'app-usuarios',
  imports: [MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule, MatProgressBarModule,
    MatSnackBarModule, TablaTarjetasDirective],
  templateUrl: './usuarios.html'
})
export class Usuarios implements OnInit {
  private readonly api = inject(UsuariosEmpresaService);
  private readonly apiSucursales = inject(SucursalesService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  private readonly apiRoles = inject(RolesService);
  readonly global = inject(GlobalService);

  readonly lista = signal<UsuarioEmpresa[]>([]);
  readonly sucursales = signal<SucursalOpcion[]>([]);
  readonly roles = signal<Rol[]>([]);
  readonly cargando = signal(false);
  readonly vl = vistaLista('usuarios-empresa');
  readonly columnas = ['nombre', 'rol', 'sucursales', 'acciones'];

  ngOnInit(): void { this.buscar(); }

  buscar(): void {
    this.cargando.set(true);
    this.apiSucursales.getSucursales('activas').subscribe(r => { if (r.status_code === 0) this.sucursales.set(r.data); });
    this.apiRoles.getRoles('activos').subscribe(r => { if (r.status_code === 0) this.roles.set(r.data); });
    this.api.getUsuariosEmpresa().subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.avisos.error(r.message);
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los usuarios'); }
    });
  }

  abrir(usuario?: UsuarioEmpresa): void {
    const data: UsuarioAccesoModalData = { usuario: usuario ?? null, sucursales: this.sucursales(), roles: this.roles() };
    this.dialog.open(UsuarioAccesoModal, { data, width: '680px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) this.buscar(); });
  }

  quitar(u: UsuarioEmpresa): void {
    if (u.esYo) return;
    if (!confirm(`¿Quitar el acceso de ${u.nombre} a esta empresa? Su cuenta sigue funcionando en sus otras empresas.`)) return;
    this.api.quitarAcceso(u.idUsuario).subscribe(r => {
      if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); }
      else this.avisos.error(r.message);
    });
  }
}
