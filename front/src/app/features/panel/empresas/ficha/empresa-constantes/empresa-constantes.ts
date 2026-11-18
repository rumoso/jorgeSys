import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { NotificationService } from '../../../../../core/services/notification.service';
import { PanelConstantesService } from '../../../../../core/services/panel';
import { ValorAjuste } from '../../../../../models/configuracion.models';
import { ConstanteDeEmpresa, GrupoConstantes } from '../../../../../models/panel.models';
import { CampoDinamico, errorAjuste, textoAjuste } from '../../../../../shared/components/campo-dinamico/campo-dinamico';

const igual = (a: ValorAjuste, b: ValorAjuste) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Pestaña "Constantes" de la ficha de la empresa (009): cada constante con
 * su valor global y, si la empresa tiene, su valor propio. Fijar o quitar el
 * valor de la empresa (quitarlo la regresa al global).
 */
@Component({
  selector: 'app-empresa-constantes',
  imports: [MatIconModule, MatButtonModule, MatProgressBarModule, CampoDinamico],
  templateUrl: './empresa-constantes.html',
  styleUrls: ['../../../comun/panel.scss', './empresa-constantes.scss']
})
export class EmpresaConstantes {
  private readonly api = inject(PanelConstantesService);
  private readonly avisos = inject(NotificationService);

  readonly idEmpresa = input.required<number>();
  readonly soloLectura = input(false);

  readonly grupos = signal<GrupoConstantes<ConstanteDeEmpresa>[]>([]);
  readonly borrador = signal<Record<string, ValorAjuste>>({});
  readonly cargando = signal(false);
  readonly trabajando = signal<string | null>(null);
  readonly texto = textoAjuste;

  constructor() {
    effect(() => { const id = this.idEmpresa(); untracked(() => this.cargar(id)); });
  }

  cargar(id = this.idEmpresa()): void {
    this.cargando.set(true);
    this.api.getConstantesDeEmpresa(id).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.grupos.set(r.data);
        this.borrador.set(Object.fromEntries((r.data as GrupoConstantes<ConstanteDeEmpresa>[])
          .flatMap(g => g.constantes).map(c => [c.clave, c.valorEfectivo])));
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar las constantes'); }
    });
  }

  valor(c: ConstanteDeEmpresa): ValorAjuste { return this.borrador()[c.clave] ?? null; }
  cambiar(c: ConstanteDeEmpresa, v: ValorAjuste): void { this.borrador.update(b => ({ ...b, [c.clave]: v })); }
  /** Hay algo que fijar: un valor distinto al que ya tiene la empresa (propio o global). */
  porFijar(c: ConstanteDeEmpresa): boolean { return !igual(this.valor(c), c.valorEfectivo); }
  error(c: ConstanteDeEmpresa): string | null { return errorAjuste(c, this.valor(c)); }

  fijar(c: ConstanteDeEmpresa): void {
    if (this.trabajando() || this.error(c)) return;
    this.trabajando.set(c.clave);
    this.api.setValorEmpresa(c.clave, this.idEmpresa(), this.valor(c)).subscribe({
      next: r => {
        this.trabajando.set(null);
        if (r.status_code === 0) { this.avisos.success(r.message); this.cargar(); }
        else this.avisos.error(r.message);
      },
      error: () => { this.trabajando.set(null); this.avisos.error('No fue posible guardar el valor'); }
    });
  }

  quitar(c: ConstanteDeEmpresa): void {
    if (this.trabajando()) return;
    if (!confirm(`¿Quitar el valor propio de "${c.etiqueta}"? La empresa regresa al valor global (${textoAjuste(c, c.valor)}).`)) return;
    this.trabajando.set(c.clave);
    this.api.quitarValorEmpresa(c.clave, this.idEmpresa()).subscribe({
      next: r => {
        this.trabajando.set(null);
        if (r.status_code === 0) { this.avisos.success(r.message); this.cargar(); }
        else this.avisos.error(r.message);
      },
      error: () => { this.trabajando.set(null); this.avisos.error('No fue posible quitar el valor'); }
    });
  }

  deshacer(c: ConstanteDeEmpresa): void { this.cambiar(c, c.valorEfectivo); }
}
