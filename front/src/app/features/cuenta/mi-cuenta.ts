import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AuthService, CuentaService } from '../../core/services';
import { MODOS, PALETAS, ThemeService } from '../../core/services/theme.service';

type Banner = { ok: boolean; texto: string } | null;
const MIN = 8;

/** Mi cuenta (análisis 001): nombre y contraseña. La cuenta es la misma en todas las empresas. */
@Component({
  selector: 'app-mi-cuenta',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule],
  template: `
    <div class="rh-page" style="max-width: 720px">
      <div class="rh-page-head">
        <div><h1>Mi cuenta</h1><p>{{ auth.usuario()?.correo }} · vale para todas tus empresas.</p></div>
      </div>

      <section class="rh-card" style="margin-bottom: 14px">
        <div class="rh-card-title">Apariencia</div>
        <div class="mc-paletas">
          @for (p of PALETAS; track p.clave) {
            <button type="button" class="mc-paleta" [class.on]="theme.paleta() === p.clave" (click)="theme.escogerPaleta(p.clave)"
                    [attr.aria-pressed]="theme.paleta() === p.clave">
              <span class="mc-prev">
                <span class="mc-lado" [style.background]="p.muestra.lado"></span>
                <span class="mc-cuerpo" [style.background]="p.muestra.suave">
                  <span class="mc-boton" [style.background]="p.muestra.principal"></span>
                </span>
              </span>
              <span class="mc-nombre">@if (theme.paleta() === p.clave) { <mat-icon>check_circle</mat-icon> }{{ p.nombre }}</span>
              <span class="mc-desc">{{ p.descripcion }}</span>
            </button>
          }
        </div>
        <div class="slim-label" style="margin-top: 14px">Modo</div>
        <div class="mc-modos" role="radiogroup" aria-label="Modo">
          @for (m of MODOS; track m.clave) {
            <button type="button" role="radio" [attr.aria-checked]="theme.tema() === m.clave" [class.on]="theme.tema() === m.clave"
                    (click)="theme.aplicar(m.clave)"><mat-icon>{{ m.icono }}</mat-icon>{{ m.nombre }}</button>
          }
        </div>
        <span class="inline-ayuda">Se guarda en tu cuenta para esta empresa: te sigue a cualquier equipo. En otra empresa puedes escoger otra paleta y así distinguirlas de un vistazo.</span>
      </section>

      <form class="rh-card" style="margin-bottom: 14px" [formGroup]="fNombre" (ngSubmit)="guardarNombre()">
        <div class="rh-card-title">Nombre</div>
        @if (bNombre(); as b) {
          <div class="rh-banner" [class.ok]="b.ok" [class.bad]="!b.ok"><mat-icon>{{ b.ok ? 'check_circle' : 'error_outline' }}</mat-icon>{{ b.texto }}</div>
        }
        <div class="rh-filtros" style="margin: 0">
          <div class="inline-wrap" style="flex: 1 1 240px">
            <label class="slim-label" for="c-nombre">Nombre</label>
            <input id="c-nombre" class="inline-input" formControlName="nombre" maxlength="150">
          </div>
          <button mat-flat-button type="submit" [disabled]="ocupado()">Guardar</button>
        </div>
      </form>

      <form class="rh-card" [formGroup]="fPass" (ngSubmit)="cambiarPassword()">
        <div class="rh-card-title">Contraseña</div>
        @if (bPass(); as b) {
          <div class="rh-banner" [class.ok]="b.ok" [class.bad]="!b.ok"><mat-icon>{{ b.ok ? 'check_circle' : 'error_outline' }}</mat-icon>{{ b.texto }}</div>
        }
        <div class="rh-grid-2">
          <div class="inline-wrap">
            <label class="slim-label" for="c-actual">Contraseña actual</label>
            <input id="c-actual" class="inline-input" type="password" autocomplete="current-password" formControlName="actual">
          </div>
          <div class="inline-wrap">
            <label class="slim-label" for="c-nueva">Nueva (mínimo {{ MIN }})</label>
            <input id="c-nueva" class="inline-input" type="password" autocomplete="new-password" formControlName="nueva">
          </div>
          <div class="inline-wrap">
            <label class="slim-label" for="c-conf">Confirmar la nueva</label>
            <input id="c-conf" class="inline-input" type="password" autocomplete="new-password" formControlName="confirmar">
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 12px">
          <button mat-flat-button type="submit" [disabled]="ocupado()">Cambiar contraseña</button>
        </div>
        <span class="inline-ayuda">Al cambiarla se cierran tus sesiones abiertas en otros equipos.</span>
      </form>
    </div>
  `,
  styles: [`
    .mc-paletas { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .mc-paleta { display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid var(--rh-border); border-radius: 10px;
      background: var(--rh-surface); color: var(--rh-text); font: inherit; text-align: left; cursor: pointer;
      &:hover { border-color: var(--rh-primary); }
      &.on { border: 2px solid var(--rh-primary); padding: 7px; } }
    .mc-prev { display: flex; height: 56px; border-radius: 6px; overflow: hidden; }
    .mc-lado { width: 30%; }
    .mc-cuerpo { flex: 1; display: flex; align-items: flex-end; padding: 8px; }
    .mc-boton { width: 60%; height: 12px; border-radius: 3px; }
    .mc-nombre { display: flex; align-items: center; gap: 4px; font-weight: 600; font-size: 13.5px;
      mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--rh-primary); } }
    .mc-desc { font-size: 12px; color: var(--rh-text-2); }
    .mc-modos { display: inline-flex; border: 1px solid var(--rh-border); border-radius: 8px; overflow: hidden; margin-bottom: 6px;
      button { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border: 0; background: var(--rh-surface);
        color: var(--rh-text); font: inherit; font-size: 13px; cursor: pointer;
        & + button { border-left: 1px solid var(--rh-border); }
        mat-icon { font-size: 18px; width: 18px; height: 18px; }
        &.on { background: var(--rh-primary-bg); color: var(--rh-primary); font-weight: 600; } } }
    @media (max-width: 768px) { .mc-modos { display: flex; button { flex: 1; justify-content: center; padding: 0 6px; } } }
  `]
})
export class MiCuenta implements OnInit {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly PALETAS = PALETAS;
  readonly MODOS = MODOS;
  private readonly api = inject(CuentaService);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly MIN = MIN;

  readonly ocupado = signal(false);
  readonly bNombre = signal<Banner>(null);
  readonly bPass = signal<Banner>(null);

  readonly fNombre = this.fb.group({ nombre: ['', [Validators.required, Validators.maxLength(150)]] });
  readonly fPass = this.fb.group({ actual: [''], nueva: [''], confirmar: [''] });

  ngOnInit(): void {
    this.api.getMiCuenta().subscribe(r => { if (r.status_code === 0) this.fNombre.patchValue({ nombre: r.data.nombre }); });
  }

  guardarNombre(): void {
    const nombre = this.fNombre.getRawValue().nombre.trim();
    if (!nombre) { this.bNombre.set({ ok: false, texto: 'Escribe tu nombre.' }); return; }
    this.ocupado.set(true);
    this.api.updateMiCuenta(nombre).subscribe({
      next: r => {
        this.ocupado.set(false);
        this.bNombre.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) this.auth.refrescarSesion();
      },
      error: () => { this.ocupado.set(false); this.bNombre.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cambiarPassword(): void {
    const v = this.fPass.getRawValue();
    if (!v.actual) { this.bPass.set({ ok: false, texto: 'Escribe tu contraseña actual.' }); return; }
    if (v.nueva.length < MIN) { this.bPass.set({ ok: false, texto: `La nueva debe tener al menos ${MIN} caracteres.` }); return; }
    if (v.nueva !== v.confirmar) { this.bPass.set({ ok: false, texto: 'La confirmación no coincide con la nueva.' }); return; }
    this.ocupado.set(true);
    this.api.cambiarPassword(v.actual, v.nueva).subscribe({
      next: r => {
        this.ocupado.set(false);
        this.bPass.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) { this.auth.setToken(r.data.token); this.fPass.reset(); }
      },
      error: () => { this.ocupado.set(false); this.bPass.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }
}
