import { Component, computed, input, model } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { DefinicionAjuste, ValorAjuste } from '../../../models/configuracion.models';

/** Texto del rango para la ayuda y los mensajes: "entre 0 y 120 minutos". */
export const rangoAjuste = (def: DefinicionAjuste): string | null => {
  const v = def.validacion;
  if (!v || (v.min === undefined && v.max === undefined)) return null;
  const u = v.unidad ? ` ${v.unidad}` : '';
  if (v.min !== undefined && v.max !== undefined) return `entre ${v.min} y ${v.max}${u}`;
  return v.min !== undefined ? `de al menos ${v.min}${u}` : `de máximo ${v.max}${u}`;
};

/**
 * Validación de ayuda en el Front (la que manda es la del Back, con
 * helpers/valorTipado.js). Regresa el mensaje o null.
 */
export const errorAjuste = (def: DefinicionAjuste, valor: ValorAjuste): string | null => {
  const vacio = valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
  if (vacio) return def.tipoDato === 'booleano' ? null : 'Escribe un valor';
  const v = def.validacion ?? {};
  const s = String(valor).trim();
  if (def.tipoDato === 'entero' && !/^-?\d+$/.test(s)) return 'Debe ser un número entero';
  if (def.tipoDato === 'decimal' && !/^-?\d+(\.\d+)?$/.test(s)) return 'Debe ser un número';
  if (def.tipoDato === 'entero' || def.tipoDato === 'decimal') {
    const n = Number(s);
    if ((v.min !== undefined && n < Number(v.min)) || (v.max !== undefined && n > Number(v.max))) return `Debe estar ${rangoAjuste(def)}`;
  }
  if (def.tipoDato === 'hora' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return 'Debe ser una hora (HH:MM)';
  if (def.tipoDato === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'Debe ser una fecha';
  if (def.tipoDato === 'texto' && v.maxLength && s.length > v.maxLength) return `Hasta ${v.maxLength} caracteres`;
  if (def.opciones?.length && !Array.isArray(valor) && !def.opciones.some(o => o.valor === s)) return 'Escoge una opción de la lista';
  return null;
};

/** Texto de un valor para leerlo ("10 minutos", "Lunes", "Sí"). */
export const textoAjuste = (def: DefinicionAjuste, valor: ValorAjuste): string => {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (def.tipoDato === 'booleano') return valor ? 'Sí' : 'No';
  const op = def.opciones?.find(o => o.valor === String(valor));
  if (op) return op.texto;
  if (Array.isArray(valor)) return valor.map(x => def.opciones?.find(o => o.valor === x)?.texto ?? x).join(', ');
  return def.validacion?.unidad ? `${valor} ${def.validacion.unidad}` : String(valor);
};

/**
 * Dibuja un ajuste según su `control` del catálogo (input, checkbox, switch,
 * radio, combo). Lo usan Empresa → Configuración, la sección de
 * configuración de la sucursal y, después, las constantes del 009. La
 * pantalla no conoce los ajustes uno por uno.
 */
@Component({
  selector: 'app-campo-dinamico',
  imports: [MatSlideToggleModule],
  template: `
    @let d = def();
    @switch (d.control) {
      @case ('combo') {
        <select class="inline-input" [id]="idCampo()" [disabled]="soloLectura()" [value]="texto()"
                [class.invalido]="error()" (change)="valor.set($any($event.target).value)">
          @for (o of d.opciones ?? []; track o.valor) { <option [value]="o.valor" [selected]="o.valor === texto()">{{ o.texto }}</option> }
        </select>
      }
      @case ('radio') {
        <div class="cd-radios" role="radiogroup" [attr.aria-labelledby]="idCampo() + '-l'">
          @for (o of d.opciones ?? []; track o.valor) {
            <label class="rh-check">
              <input type="radio" [name]="idCampo()" [value]="o.valor" [checked]="o.valor === texto()" [disabled]="soloLectura()"
                     (change)="valor.set(o.valor)"> {{ o.texto }}
            </label>
          }
        </div>
      }
      @case ('checkbox') {
        <label class="rh-check">
          <input type="checkbox" [id]="idCampo()" [checked]="!!valor()" [disabled]="soloLectura()"
                 (change)="valor.set($any($event.target).checked)"> {{ valor() ? 'Sí' : 'No' }}
        </label>
      }
      @case ('switch') {
        <mat-slide-toggle [id]="idCampo()" [checked]="!!valor()" [disabled]="soloLectura()" (change)="valor.set($event.checked)">
          {{ valor() ? 'Sí' : 'No' }}
        </mat-slide-toggle>
      }
      @default {
        <div class="cd-input">
          <input class="inline-input" [id]="idCampo()" [type]="tipoInput()" [value]="texto()" [readonly]="soloLectura()"
                 [attr.min]="d.validacion?.min ?? null" [attr.max]="d.validacion?.max ?? null"
                 [attr.maxlength]="d.validacion?.maxLength ?? null"
                 [attr.inputmode]="d.tipoDato === 'entero' ? 'numeric' : d.tipoDato === 'decimal' ? 'decimal' : null"
                 [class.invalido]="error()" (input)="valor.set($any($event.target).value)">
          @if (d.validacion?.unidad) { <span class="cd-unidad">{{ d.validacion!.unidad }}</span> }
        </div>
      }
    }
    @if (error() && !soloLectura()) { <span class="inline-ayuda error">{{ error() }}</span> }
    @else if (rango() && d.control === 'input' && !soloLectura()) { <span class="inline-ayuda">Valor {{ rango() }}.</span> }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-width: 0; }
    .cd-input { display: flex; align-items: center; gap: 8px; }
    .cd-input .inline-input { max-width: 160px; }
    .cd-unidad { font-size: 13px; color: var(--rh-text-2); }
    .cd-radios { display: flex; flex-wrap: wrap; gap: 6px 16px; min-height: 36px; align-items: center; }
    select.inline-input { max-width: 260px; }
  `]
})
export class CampoDinamico {
  readonly def = input.required<DefinicionAjuste>();
  readonly valor = model<ValorAjuste>(null);
  readonly soloLectura = input(false);
  readonly idCampo = input('campo');

  readonly texto = computed(() => { const v = this.valor(); return v === null || v === undefined ? '' : String(v); });
  readonly error = computed(() => errorAjuste(this.def(), this.valor()));
  readonly rango = computed(() => rangoAjuste(this.def()));
  readonly tipoInput = computed(() => {
    switch (this.def().tipoDato) {
      case 'entero': case 'decimal': return 'number';
      case 'fecha': return 'date';
      case 'hora': return 'time';
      default: return 'text';
    }
  });
}
