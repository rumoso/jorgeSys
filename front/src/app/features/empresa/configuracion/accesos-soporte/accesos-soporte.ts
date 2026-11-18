import { Component, OnInit, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';

import { AuthService, ConfiguracionService } from '../../../../core/services';
import { TablaTarjetasDirective } from '../../../../shared/directives/tabla-tarjetas.directive';
import { FechaSucursalPipe } from '../../../../shared/pipes/fecha-sucursal.pipe';

interface AccesoSoporte {
  idSesionSoporte: number; superadmin: string; motivo: string; inicio: string; vence: string; fin: string | null;
  estado: 'ABIERTA' | 'CERRADA' | 'VENCIDA'; minutos: number;
}

const ESTADOS: Record<AccesoSoporte['estado'], { texto: string; clase: string }> = {
  ABIERTA: { texto: 'En curso', clase: 'warn' },
  CERRADA: { texto: 'Cerrada', clase: 'ok' },
  VENCIDA: { texto: 'Venció', clase: 'info' }
};

/**
 * Empresa → Configuración → "Accesos de soporte" (009): cuándo entró el
 * soporte del proveedor a esta empresa, quién, por qué y cuánto duró.
 */
@Component({
  selector: 'app-accesos-soporte',
  imports: [MatIconModule, MatProgressBarModule, MatTableModule, TablaTarjetasDirective, FechaSucursalPipe],
  template: `
    <details class="rh-card cf-grupo">
      <summary class="cf-grupo-titulo">
        <mat-icon class="cf-flecha">expand_more</mat-icon>Accesos de soporte
        <span class="rh-sub cf-cuenta">{{ lista().length }} acceso{{ lista().length === 1 ? '' : 's' }}</span>
      </summary>
      <div class="as-cuerpo">
        <p class="rh-sub">Cada vez que el soporte del proveedor del sistema entra a tu empresa queda aquí, con su motivo.
          Lo que hace dentro aparece como "Soporte" en las bitácoras.</p>
        @if (cargando()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
        @if (error()) { <div class="rh-banner bad"><mat-icon>error_outline</mat-icon>{{ error() }}</div> }
        <div [class.vista-cards]="celular()">
          <table mat-table appTablaTarjetas [dataSource]="lista()">
            <ng-container matColumnDef="inicio">
              <th mat-header-cell *matHeaderCellDef>Entró</th>
              <td mat-cell *matCellDef="let a">{{ a.inicio | fechaSucursal: auth.zonaActiva().zona : 'fechaHora' : auth.zonaActiva().mixtas }}</td>
            </ng-container>
            <ng-container matColumnDef="quien">
              <th mat-header-cell *matHeaderCellDef>Quién</th>
              <td mat-cell *matCellDef="let a">{{ a.superadmin }}</td>
            </ng-container>
            <ng-container matColumnDef="motivo">
              <th mat-header-cell *matHeaderCellDef>Motivo</th>
              <td mat-cell *matCellDef="let a">{{ a.motivo }}</td>
            </ng-container>
            <ng-container matColumnDef="duracion">
              <th mat-header-cell *matHeaderCellDef>Duración</th>
              <td mat-cell *matCellDef="let a">{{ a.minutos }} min</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let a"><span class="rh-chip" [class]="estado(a).clase">{{ estado(a).texto }}</span></td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let row; columns: columnas"></tr>
          </table>
        </div>
        @if (!cargando() && !error() && !lista().length) {
          <div class="rh-vacio"><mat-icon>support_agent</mat-icon>El soporte no ha entrado a tu empresa.</div>
        }
      </div>
    </details>
  `,
  styleUrl: '../configuracion.scss',
  styles: [`
    .as-cuerpo { padding: 0 16px 14px; }
  `]
})
export class AccesosSoporte implements OnInit {
  private readonly api = inject(ConfiguracionService);
  readonly auth = inject(AuthService);

  readonly lista = signal<AccesoSoporte[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly columnas = ['inicio', 'quien', 'motivo', 'duracion', 'estado'];
  /** Lista corta y de consulta: tarjetas en el celular, sin preferencia guardada. */
  readonly celular = toSignal(inject(BreakpointObserver).observe('(max-width: 768px)').pipe(map(r => r.matches)), { initialValue: false });

  ngOnInit(): void {
    this.cargando.set(true);
    this.api.getAccesosSoporte().subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code === 0) this.lista.set(r.data);
        else this.error.set(r.message);
      },
      error: () => { this.cargando.set(false); this.error.set('No fue posible consultar los accesos de soporte'); }
    });
  }

  estado(a: AccesoSoporte) { return ESTADOS[a.estado] ?? { texto: a.estado, clase: 'info' }; }
}
