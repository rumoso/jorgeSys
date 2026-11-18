import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PanelConstantesService } from '../../../../../core/services/panel';
import { Control, DefinicionAjuste, OpcionAjuste, TipoDato, ValidacionAjuste, ValorAjuste } from '../../../../../models/configuracion.models';
import { ConstantePanel, DefinicionConstante, ValorInvalido } from '../../../../../models/panel.models';
import { CampoDinamico, errorAjuste, textoAjuste } from '../../../../../shared/components/campo-dinamico/campo-dinamico';

export interface ConstanteModalData { constante: ConstantePanel | null; grupos: string[]; }

const TIPOS: TipoDato[] = ['entero', 'decimal', 'texto', 'booleano', 'fecha', 'hora', 'lista'];
const CONTROLES: { valor: Control; texto: string }[] = [
  { valor: 'input', texto: 'Campo (input)' }, { valor: 'checkbox', texto: 'Casilla (checkbox)' },
  { valor: 'switch', texto: 'Interruptor (switch)' }, { valor: 'radio', texto: 'Opciones (radio)' }, { valor: 'combo', texto: 'Lista desplegable (combo)' }
];

/** "valor|texto" por renglón → opciones; vacío → null. */
const leerOpciones = (s: string): OpcionAjuste[] | null => {
  const l = s.split('\n').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('|');
    return i < 0 ? { valor: x, texto: x } : { valor: x.slice(0, i).trim(), texto: x.slice(i + 1).trim() || x.slice(0, i).trim() };
  });
  return l.length ? l : null;
};
const escribirOpciones = (o: OpcionAjuste[] | null) => (o ?? []).map(x => (x.valor === x.texto ? x.valor : `${x.valor}|${x.texto}`)).join('\n');
const numOTexto = (s: string): number | string => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

/**
 * Definición de una constante (009): alta o edición, con vista previa del
 * control antes de guardar. Al editar, la clave y el tipo de dato no se
 * cambian. Si la definición nueva deja inválido el valor global o el de
 * alguna empresa, el servidor no guarda y aquí se listan cuáles.
 */
@Component({
  selector: 'app-constante-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, CampoDinamico],
  templateUrl: './constante-modal.html',
  styleUrl: './constante-modal.scss'
})
export class ConstanteModal {
  private readonly api = inject(PanelConstantesService);
  private readonly ref = inject(MatDialogRef<ConstanteModal, boolean>);
  readonly data = inject<ConstanteModalData>(MAT_DIALOG_DATA);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly TIPOS = TIPOS;
  readonly CONTROLES = CONTROLES;
  readonly editando = signal(!!this.data.constante);
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  readonly invalidos = signal<ValorInvalido[]>([]);
  /** Valor de la vista previa; en el alta es el valor global que se guarda. */
  readonly valorPrevio = signal<ValorAjuste>(this.data.constante?.valor ?? null);
  private cambios = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    clave: [this.data.constante?.clave ?? '', [Validators.required, Validators.maxLength(80)]],
    tipoDato: [(this.data.constante?.tipoDato ?? 'entero') as TipoDato, [Validators.required]],
    grupo: [this.data.constante?.grupo ?? '', [Validators.required]],
    orden: [String(this.data.constante?.orden ?? 0)],
    etiqueta: [this.data.constante?.etiqueta ?? '', [Validators.required]],
    ayuda: [this.data.constante?.ayuda ?? ''],
    control: [(this.data.constante?.control ?? 'input') as Control, [Validators.required]],
    opciones: [escribirOpciones(this.data.constante?.opciones ?? null)],
    min: [String(this.data.constante?.validacion?.min ?? '')],
    max: [String(this.data.constante?.validacion?.max ?? '')],
    unidad: [this.data.constante?.validacion?.unidad ?? ''],
    maxLength: [String(this.data.constante?.validacion?.maxLength ?? '')],
    patron: [this.data.constante?.validacion?.patron ?? ''],
    multiple: [!!this.data.constante?.validacion?.multiple]
  });
  private readonly v = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Lo que se guarda, armado del formulario. */
  readonly definicion = computed<DefinicionConstante>(() => {
    this.v();
    const f = this.form.getRawValue();
    const validacion: ValidacionAjuste = {};
    if (f.min.trim()) validacion.min = numOTexto(f.min.trim());
    if (f.max.trim()) validacion.max = numOTexto(f.max.trim());
    if (f.unidad.trim()) validacion.unidad = f.unidad.trim();
    if (f.maxLength.trim()) validacion.maxLength = Number(f.maxLength.trim());
    if (f.patron.trim()) validacion.patron = f.patron.trim();
    if (f.multiple) validacion.multiple = true;
    return {
      clave: f.clave.trim(), grupo: f.grupo.trim(), orden: Number(f.orden) || 0, etiqueta: f.etiqueta.trim(), ayuda: f.ayuda.trim() || null,
      tipoDato: f.tipoDato, control: f.control, opciones: leerOpciones(f.opciones),
      validacion: Object.keys(validacion).length ? validacion : null
    };
  });
  /** La vista previa: el control como lo verá quien lo use. */
  readonly previa = computed<DefinicionAjuste>(() => ({ ...this.definicion(), etiqueta: this.definicion().etiqueta || 'Etiqueta' }));
  readonly errorPrevio = computed(() => errorAjuste(this.previa(), this.valorPrevio()));
  readonly texto = textoAjuste;

  constructor() {
    if (this.editando()) { this.form.controls.clave.disable(); this.form.controls.tipoDato.disable(); }
  }

  guardar(): void {
    if (this.guardando()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ ok: false, texto: 'Escribe la clave, el grupo y la etiqueta, y escoge el tipo y el control.' });
      return;
    }
    const def = this.definicion();
    if (!this.editando() && this.errorPrevio()) { this.banner.set({ ok: false, texto: `Valor global: ${this.errorPrevio()}` }); return; }
    this.guardando.set(true);
    this.banner.set(null);
    this.invalidos.set([]);
    const llamada = this.editando()
      ? this.api.updateDefinicionConstante(def)
      : this.api.insertConstante({ ...def, valor: this.valorPrevio() });
    llamada.subscribe({
      next: r => {
        this.guardando.set(false);
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        setTimeout(() => this.el.nativeElement.querySelector('.rh-dialog-body')?.scrollTo({ top: 0 }));
        if (r.status_code === 1 && r.data?.codigo === 'VALORES_INVALIDOS') this.invalidos.set(r.data.invalidos ?? []);
        if (r.status_code !== 0) return;
        this.cambios = true;
        if (!this.editando()) {
          this.editando.set(true);
          this.form.controls.clave.disable();
          this.form.controls.tipoDato.disable();
        }
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cerrar(): void { this.ref.close(this.cambios); }
}
