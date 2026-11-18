import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Pantalla de un menú que todavía no se construye (cada una llega con su análisis). */
@Component({
  selector: 'app-proximamente',
  imports: [MatIconModule],
  template: `
    <div class="rh-page">
      <div class="rh-page-head"><div><h1>{{ titulo() }}</h1></div></div>
      <div class="rh-card">
        <div class="rh-vacio">
          <mat-icon>{{ bloqueado() ? 'lock' : icono() }}</mat-icon>
          @if (bloqueado()) { Este módulo llega más adelante. } @else { Esta pantalla se construye en su análisis. }
        </div>
      </div>
    </div>
  `
})
export class Proximamente {
  readonly titulo = input('');
  readonly icono = input('construction');
  readonly bloqueado = input(false);
}
