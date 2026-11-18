import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PanelAuthService } from '../../../core/services/panel';
import { EnterSecuencialDirective } from '../../../shared/directives/enter-secuencial.directive';

/**
 * Entrada al panel del superadministrador (009), en dos pasos: correo y
 * contraseña, y luego el código de 6 dígitos de la app de autenticación.
 * Usa el mismo diseño que la entrada de la empresa, con otra dirección.
 */
@Component({
  selector: 'app-panel-entrar',
  imports: [FormsModule, MatIconModule, MatButtonModule, MatProgressBarModule, EnterSecuencialDirective],
  templateUrl: './panel-entrar.html',
  styleUrls: ['../../auth/login.scss', './panel-entrar.scss']
})
export class PanelEntrar {
  private readonly panel = inject(PanelAuthService);
  private readonly router = inject(Router);

  correo = '';
  password = '';
  codigo = '';
  readonly verPassword = signal(false);
  readonly entrando = signal(false);
  readonly mensaje = signal('');
  /** Token del paso 1 (5 minutos); con él se manda el código. */
  readonly token2fa = signal<string | null>(null);

  async entrar(): Promise<void> {
    if (this.entrando()) return;
    this.mensaje.set('');
    if (!this.correo.trim() || !this.password) { this.mensaje.set('Escribe tu correo y tu contraseña.'); return; }
    this.entrando.set(true);
    const r = await this.panel.login(this.correo.trim(), this.password);
    this.entrando.set(false);
    if (!r.ok || !r.token2fa) { this.mensaje.set(r.texto); return; }
    this.password = '';
    this.codigo = '';
    this.token2fa.set(r.token2fa);
  }

  async verificar(): Promise<void> {
    const t = this.token2fa();
    if (!t || this.entrando()) return;
    this.mensaje.set('');
    const codigo = this.codigo.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(codigo)) { this.mensaje.set('Escribe los 6 dígitos del código.'); return; }
    this.entrando.set(true);
    const r = await this.panel.verificar(codigo, t);
    this.entrando.set(false);
    if (r.ok) { this.router.navigate(['/panel/empresas']); return; }
    this.mensaje.set(r.texto);
    this.codigo = '';
    if (r.vencido) this.token2fa.set(null);
  }

  volver(): void {
    this.token2fa.set(null);
    this.codigo = '';
    this.mensaje.set('');
  }
}
