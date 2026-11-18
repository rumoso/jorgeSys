import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth.service';
import { FechaSucursalPipe } from '../../shared/pipes/fecha-sucursal.pipe';

/**
 * Inicio "Hoy" (diseño aprobado): presentes, retardos, faltas, en comida,
 * últimos marcajes y lo que requiere atención. Los números llegan con el
 * checador (análisis 007); mientras tanto se ve vacío, sin datos inventados.
 */
@Component({
  selector: 'app-hoy',
  imports: [FechaSucursalPipe, MatIconModule, MatButtonModule],
  templateUrl: './hoy.html',
  styleUrl: './hoy.scss'
})
export class Hoy {
  readonly auth = inject(AuthService);
  /** El día se muestra en la zona de la sucursal escogida, no en la del navegador. */
  readonly hoy = new Date();
  readonly kpis = [
    { titulo: 'Presentes', icono: 'how_to_reg', clase: 'ok' },
    { titulo: 'Retardos', icono: 'schedule', clase: 'warn' },
    { titulo: 'Faltas', icono: 'person_off', clase: 'bad' },
    { titulo: 'En comida', icono: 'restaurant', clase: 'info' }
  ];
}
