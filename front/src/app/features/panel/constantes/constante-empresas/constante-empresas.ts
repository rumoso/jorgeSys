import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { NotificationService } from '../../../../core/services/notification.service';
import { PanelConstantesService } from '../../../../core/services/panel';
import { ValorAjuste } from '../../../../models/configuracion.models';
import { ConstantePanel, EmpresaPanel, ValorEmpresaConstante } from '../../../../models/panel.models';
import { CampoDinamico, errorAjuste, textoAjuste } from '../../../../shared/components/campo-dinamico/campo-dinamico';

const igual = (a: ValorAjuste, b: ValorAjuste) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Empresas con valor propio de una constante (009): verlas, cambiar su valor,
 * quitarlo (regresa al global) o fijarlo a otra empresa.
 */
@Component({
  selector: 'app-constante-empresas',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule, MatButtonModule, MatProgressBarModule, MatTooltipModule, CampoDinamico],
  templateUrl: './constante-empresas.html',
  styleUrls: ['../../comun/panel.scss', './constante-empresas.scss']
})
export class ConstanteEmpresas {
  private readonly api = inject(PanelConstantesService);
  private readonly avisos = inject(NotificationService);

  readonly constante = input.required<ConstantePanel>();
  readonly empresas = input<EmpresaPanel[]>([]);
  readonly cambio = output<void>();

  readonly valores = signal<ValorEmpresaConstante[]>([]);
  readonly borrador = signal<Record<number, ValorAjuste>>({});
  readonly cargando = signal(false);
  readonly trabajando = signal(false);
  readonly texto = textoAjuste;

  readonly nuevaEmpresa = new FormControl(0, { nonNullable: true });
  readonly nuevoValor = signal<ValorAjuste>(null);
  /** Las que todavía no tienen valor propio. */
  readonly disponibles = computed(() => {
    const con = new Set(this.valores().map(v => v.idEmpresa));
    return this.empresas().filter(e => !con.has(e.idEmpresa));
  });

  constructor() {
    effect(() => {
      const c = this.constante();
      untracked(() => { this.nuevoValor.set(c.valor); this.cargar(); });
    });
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.getValoresEmpresas(this.constante().clave).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.valores.set(r.data.valores);
        this.borrador.set(Object.fromEntries((r.data.valores as ValorEmpresaConstante[]).map(v => [v.idEmpresa, v.valor])));
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los valores de las empresas'); }
    });
  }

  valor(v: ValorEmpresaConstante): ValorAjuste { return this.borrador()[v.idEmpresa] ?? null; }
  cambiar(v: ValorEmpresaConstante, x: ValorAjuste): void { this.borrador.update(b => ({ ...b, [v.idEmpresa]: x })); }
  cambiado(v: ValorEmpresaConstante): boolean { return !igual(this.valor(v), v.valor); }
  errorDe(x: ValorAjuste): string | null { return errorAjuste(this.constante(), x); }

  private respuesta(ok: string, alGuardar?: () => void) {
    return {
      next: (r: { status_code: number; message: string }) => {
        this.trabajando.set(false);
        if (r.status_code === 0) { this.avisos.success(r.message || ok); alGuardar?.(); this.cargar(); this.cambio.emit(); }
        else this.avisos.error(r.message);
      },
      error: () => { this.trabajando.set(false); this.avisos.error('No fue posible comunicarse con el servidor'); }
    };
  }

  guardar(v: ValorEmpresaConstante): void {
    if (this.trabajando() || this.errorDe(this.valor(v))) return;
    this.trabajando.set(true);
    this.api.setValorEmpresa(this.constante().clave, v.idEmpresa, this.valor(v)).subscribe(this.respuesta('Valor guardado'));
  }

  quitar(v: ValorEmpresaConstante): void {
    const c = this.constante();
    if (this.trabajando() || !confirm(`¿Quitar el valor propio de ${v.empresa}? Regresa al valor global (${textoAjuste(c, c.valor)}).`)) return;
    this.trabajando.set(true);
    this.api.quitarValorEmpresa(c.clave, v.idEmpresa).subscribe(this.respuesta('Valor quitado'));
  }

  fijarNueva(): void {
    const id = this.nuevaEmpresa.value;
    if (this.trabajando() || !id || this.errorDe(this.nuevoValor())) return;
    this.trabajando.set(true);
    this.api.setValorEmpresa(this.constante().clave, id, this.nuevoValor())
      .subscribe(this.respuesta('Valor guardado', () => this.nuevaEmpresa.setValue(0)));
  }
}
