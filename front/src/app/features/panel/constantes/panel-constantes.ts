import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService } from '../../../core/services/notification.service';
import { PanelConstantesService, PanelEmpresasService } from '../../../core/services/panel';
import { ValorAjuste } from '../../../models/configuracion.models';
import { ConstantePanel, EmpresaPanel, GrupoConstantes, ImpactoGlobal } from '../../../models/panel.models';
import { CampoDinamico, errorAjuste, textoAjuste } from '../../../shared/components/campo-dinamico/campo-dinamico';
import { AccionModal, AccionModalData } from '../comun/accion-modal/accion-modal';
import { ConstanteEmpresas } from './constante-empresas/constante-empresas';
import { ConstanteModal, ConstanteModalData } from './mdl';

const igual = (a: ValorAjuste, b: ValorAjuste) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Panel → Constantes del sistema (009): agrupadas, con búsqueda. Cada una se
 * dibuja con `app-campo-dinamico`. Cambiar el valor global avisa cuántas
 * empresas lo usan; las empresas con valor propio se ven, se fijan y se
 * quitan aquí. La definición se edita en su modal, con vista previa.
 */
@Component({
  selector: 'app-panel-constantes',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule, MatProgressBarModule,
    MatSnackBarModule, CampoDinamico, ConstanteEmpresas],
  templateUrl: './panel-constantes.html',
  styleUrls: ['../comun/panel.scss', './panel-constantes.scss']
})
export class PanelConstantes implements OnInit {
  private readonly api = inject(PanelConstantesService);
  private readonly empresasApi = inject(PanelEmpresasService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);

  readonly grupos = signal<GrupoConstantes[]>([]);
  readonly borrador = signal<Record<string, ValorAjuste>>({});
  readonly impacto = signal<Record<string, ImpactoGlobal>>({});
  readonly abiertas = signal<Set<string>>(new Set());
  readonly empresas = signal<EmpresaPanel[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal<string | null>(null);
  readonly texto = textoAjuste;

  readonly filtros = inject(FormBuilder).nonNullable.group({ q: [''], inactivas: [false] });

  ngOnInit(): void {
    this.empresasApi.getEmpresas({}).subscribe(r => {
      if (r.status_code === 0) this.empresas.set((r.data as EmpresaPanel[]).filter(e => e.estado !== 'ELIMINADA'));
    });
    this.buscar();
  }

  buscar(): void {
    const f = this.filtros.getRawValue();
    this.cargando.set(true);
    this.api.getConstantes({ q: f.q.trim(), incluirInactivas: f.inactivas }).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.grupos.set(r.data);
        this.borrador.set(Object.fromEntries((r.data as GrupoConstantes[]).flatMap(g => g.constantes).map(c => [c.clave, c.valor])));
        this.impacto.set({});
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar las constantes'); }
    });
  }

  valor(c: ConstantePanel): ValorAjuste { return this.borrador()[c.clave] ?? null; }
  cambiado(c: ConstantePanel): boolean { return !igual(this.valor(c), c.valor); }
  error(c: ConstantePanel): string | null { return errorAjuste(c, this.valor(c)); }

  cambiar(c: ConstantePanel, v: ValorAjuste): void {
    this.borrador.update(b => ({ ...b, [c.clave]: v }));
    // El aviso de impacto se pide la primera vez que cambia.
    if (!this.impacto()[c.clave]) {
      this.api.getImpactoGlobal(c.clave).subscribe(r => {
        if (r.status_code === 0) this.impacto.update(i => ({ ...i, [c.clave]: r.data }));
      });
    }
  }

  deshacer(c: ConstantePanel): void { this.borrador.update(b => ({ ...b, [c.clave]: c.valor })); }

  textoImpacto(i: ImpactoGlobal): string {
    return `Lo usan ${i.usanGlobal} de ${i.empresas} empresa(s)` + (i.conValorPropio ? `; ${i.conValorPropio} con valor propio no cambian.` : '.');
  }

  guardarGlobal(c: ConstantePanel): void {
    if (this.guardando() || this.error(c)) return;
    const i = this.impacto()[c.clave];
    const aviso = i ? `${this.textoImpacto(i)}\n\n` : '';
    if (!confirm(`${aviso}¿Cambiar el valor global de "${c.etiqueta}" de ${textoAjuste(c, c.valor)} a ${textoAjuste(c, this.valor(c))}?`)) return;
    this.guardando.set(c.clave);
    this.api.setValorGlobal(c.clave, this.valor(c)).subscribe({
      next: r => {
        this.guardando.set(null);
        if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); }
        else this.avisos.error(r.message);
      },
      error: () => { this.guardando.set(null); this.avisos.error('No fue posible guardar el valor global'); }
    });
  }

  alternarEmpresas(c: ConstantePanel): void {
    this.abiertas.update(s => { const n = new Set(s); if (n.has(c.clave)) n.delete(c.clave); else n.add(c.clave); return n; });
  }

  editar(c?: ConstantePanel): void {
    const data: ConstanteModalData = { constante: c ?? null, grupos: this.grupos().map(g => g.grupo) };
    this.dialog.open(ConstanteModal, { data, width: '760px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) this.buscar(); });
  }

  desactivar(c: ConstantePanel): void {
    const data: AccionModalData = {
      titulo: 'Desactivar la constante', boton: 'Desactivar', peligro: true,
      confirmar: { texto: c.clave, etiqueta: 'Clave de la constante' },
      texto: `Si el código todavía lee "${c.clave}", fallará al pedirla. Se desactiva en lugar de borrarse y se puede volver a activar.`,
      accion: (_m, conf) => this.api.disableConstante(c.clave, conf)
    };
    this.dialog.open(AccionModal, { data, width: '480px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambio => { if (cambio) this.buscar(); });
  }

  activar(c: ConstantePanel): void {
    if (!confirm(`¿Activar la constante ${c.clave}?`)) return;
    this.api.enableConstante(c.clave).subscribe({
      next: r => {
        if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); }
        else this.avisos.error(r.message);
      },
      error: () => this.avisos.error('No fue posible activar la constante')
    });
  }

  /** Al fijar o quitar el valor de una empresa cambia el conteo de "con valor propio". */
  valoresCambiados(): void { this.buscar(); }
}
