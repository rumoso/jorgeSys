import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { RolesService } from '../../../../../core/services';
import { GrupoMenuSesion, Rol } from '../../../../../models/permisos.models';

/** "Ver como": el menú que vería un usuario que solo tuviera este rol. */
@Component({
  selector: 'app-ver-como-modal',
  imports: [MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  template: `
    <div class="rh-dialog">
      <div class="rh-dialog-head">
        <h2>Menú de "{{ rol.nombre }}"</h2>
        <button mat-icon-button (click)="ref.close()" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>
      <div class="rh-dialog-body">
        <span class="inline-ayuda">Así vería el menú alguien con solo este rol. Sus sucursales permitidas se configuran en Usuarios.</span>
        @if (menu(); as grupos) {
          <nav class="vc">
            @for (g of grupos; track g.modulo) {
              @if (g.nombre) { <div class="vc-grupo">{{ g.nombre }}@if (g.bloqueado) { · pronto }</div> }
              @for (i of g.items; track i.menu) {
                <div class="vc-item" [class.bloq]="i.bloqueado"><mat-icon>{{ i.bloqueado ? 'lock' : i.icono }}</mat-icon>{{ i.titulo }}</div>
              }
            }
          </nav>
        } @else if (mensaje()) {
          <div class="rh-banner bad"><mat-icon>error_outline</mat-icon>{{ mensaje() }}</div>
        } @else { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
      </div>
      <div class="rh-dialog-foot"><button mat-button (click)="ref.close()">Cerrar</button></div>
    </div>
  `,
  styles: [`
    .vc { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 10px; background: var(--rh-side); color: var(--rh-side-text); }
    .vc-grupo { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--rh-side-muted); margin: 10px 8px 4px; }
    .vc-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; font-size: 13.5px;
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
      &.bloq { color: var(--rh-side-muted); } }
  `]
})
export class VerComoModal implements OnInit {
  private readonly api = inject(RolesService);
  readonly ref = inject(MatDialogRef<VerComoModal>);
  readonly rol = inject<Rol>(MAT_DIALOG_DATA);
  readonly menu = signal<GrupoMenuSesion[] | null>(null);
  readonly mensaje = signal('');

  ngOnInit(): void {
    this.api.getMenuDeRol(this.rol.idRol).subscribe({
      next: r => r.status_code === 0 ? this.menu.set(r.data) : this.mensaje.set(r.message),
      error: () => this.mensaje.set('No fue posible comunicarse con el servidor.')
    });
  }
}
