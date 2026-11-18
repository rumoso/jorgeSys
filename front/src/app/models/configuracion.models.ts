/** Configuración de la empresa (análisis 003). Contrato de `api/configuracion`. */

export type TipoDato = 'entero' | 'decimal' | 'texto' | 'booleano' | 'fecha' | 'hora' | 'lista';
export type Control = 'input' | 'checkbox' | 'switch' | 'radio' | 'combo';
export type ValorAjuste = string | number | boolean | string[] | null;

export interface OpcionAjuste { valor: string; texto: string; }
export interface ValidacionAjuste {
  min?: number | string; max?: number | string; unidad?: string;
  maxLength?: number; patron?: string; multiple?: boolean;
}

/** Lo que hace falta para dibujar un ajuste (también sirve para las constantes del 009). */
export interface DefinicionAjuste {
  clave: string; grupo: string; etiqueta: string; ayuda: string | null;
  tipoDato: TipoDato; control: Control;
  opciones: OpcionAjuste[] | null; validacion: ValidacionAjuste | null;
}

export interface ExcepcionSucursal { idSucursal: number; nombre: string; valor: ValorAjuste; }

export interface AjusteEmpresa extends DefinicionAjuste {
  valorInicial: ValorAjuste;
  bExcepcionSucursal: boolean;
  bAdvierteCalculos: boolean;
  valor: ValorAjuste;
  bConfirmado: boolean;
  modifico: string | null;
  fechaModificacion: string | null;
  excepciones: ExcepcionSucursal[];
}

export interface ConfiguracionEmpresa {
  todasSucursales: boolean;
  puedeEditar: boolean;
  grupos: { grupo: string; ajustes: AjusteEmpresa[] }[];
}

export interface AjusteSucursal extends DefinicionAjuste {
  valorInicial: ValorAjuste;
  bExcepcionSucursal: boolean;
  bAdvierteCalculos: boolean;
  valorGeneral: ValorAjuste;
  valorPropio: ValorAjuste;
  bPropio: boolean;
}

export interface ConfiguracionSucursal {
  idSucursal: number; nombre: string; puedeEditar: boolean; ajustes: AjusteSucursal[];
}
