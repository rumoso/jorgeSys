import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AuthService, Seleccion } from '../../core/services/auth.service';
import { EnterSecuencialDirective } from '../../shared/directives/enter-secuencial.directive';

/**
 * Entrar (correo y contraseña; sin Face ID por decisión del 2026-11-10).
 * Si la cuenta tiene varias empresas, segundo paso: escoger la empresa.
 * En celular solo se ve el formulario; en escritorio, con el panel de marca.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, MatIconModule, MatButtonModule, MatProgressBarModule, EnterSecuencialDirective],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  correo = '';
  password = '';
  readonly verPassword = signal(false);
  readonly entrando = signal(false);
  readonly mensaje = signal('');
  readonly seleccion = signal<Seleccion | null>(null);

  async entrar(): Promise<void> {
    if (this.entrando()) return;
    this.mensaje.set('');
    if (!this.correo.trim() || !this.password) { this.mensaje.set('Escribe tu correo y tu contraseña.'); return; }
    this.entrando.set(true);
    const r = await this.auth.login(this.correo.trim(), this.password);
    this.entrando.set(false);
    if (!r.ok) { this.mensaje.set(r.texto); return; }
    if (r.seleccion) { this.seleccion.set(r.seleccion); return; }
    this.router.navigate(['/app/hoy']);
  }

  async escoger(idEmpresa: number): Promise<void> {
    const sel = this.seleccion();
    if (!sel || this.entrando()) return;
    this.mensaje.set('');
    this.entrando.set(true);
    const r = await this.auth.seleccionarEmpresa(idEmpresa, sel.tokenSeleccion);
    this.entrando.set(false);
    if (r.ok) { this.router.navigate(['/app/hoy']); return; }
    this.mensaje.set(r.texto);
    if (r.empresas) this.seleccion.set({ ...sel, empresas: r.empresas });
    else this.volver();
  }

  volver(): void {
    this.seleccion.set(null);
    this.password = '';
  }
}
