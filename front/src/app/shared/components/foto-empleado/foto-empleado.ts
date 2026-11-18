import { Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { EmpleadosService } from '../../../core/services/empleados.service';

/**
 * Foto del empleado o sus iniciales (análisis 004). La foto no es pública:
 * se pide al API con la sesión (x-token) y se muestra como blob local.
 * `version` sube cuando la foto cambia, para volver a pedirla.
 */
@Component({
  selector: 'app-foto-empleado',
  template: `
    <span class="fe-foto" [style.width.px]="tam()" [style.height.px]="tam()" [style.font-size.px]="tam() * 0.38">
      @if (url(); as u) { <img [src]="u" [alt]="'Foto de ' + nombre()"> } @else { {{ iniciales() }} }
    </span>`,
  styles: [`
    .fe-foto { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 50%;
      overflow: hidden; background: var(--rh-primary-bg); color: var(--rh-primary); font-weight: 600; letter-spacing: .5px; }
    img { width: 100%; height: 100%; object-fit: cover; }
  `]
})
export class FotoEmpleado implements OnDestroy {
  private readonly api = inject(EmpleadosService);

  readonly idEmpleado = input.required<number>();
  readonly bFoto = input(false);
  readonly nombre = input('');
  readonly tam = input(36);
  readonly version = input(0);

  readonly url = signal<string | null>(null);
  readonly iniciales = computed(() => this.nombre().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase());

  constructor() {
    effect(() => {
      const id = this.idEmpleado(), con = this.bFoto();
      this.version();
      untracked(() => {
        this.liberar();
        if (!con || !id) return;
        this.api.getFotoEmpleado(id).subscribe({
          next: b => { if (b.type.startsWith('image/')) this.url.set(URL.createObjectURL(b)); },
          error: () => this.url.set(null)
        });
      });
    });
  }

  private liberar(): void {
    const u = this.url();
    if (u) URL.revokeObjectURL(u);
    this.url.set(null);
  }

  ngOnDestroy(): void { this.liberar(); }
}
