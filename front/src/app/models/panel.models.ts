/** Panel del superadministrador (análisis 009). Contratos de `api/panel/*`. */
import { Control, DefinicionAjuste, OpcionAjuste, TipoDato, ValidacionAjuste, ValorAjuste } from './configuracion.models';

export interface Superadmin { idSuperadmin: number; nombre: string; correo: string; }

export type EstadoEmpresa = 'ACTIVA' | 'SUSPENDIDA' | 'EN_BAJA' | 'ELIMINADA';
export type TipoCobro = 'LIMITE' | 'POR_EMPLEADO';

export const ESTADOS_EMPRESA: { valor: EstadoEmpresa; texto: string; clase: string }[] = [
  { valor: 'ACTIVA', texto: 'Activa', clase: 'ok' },
  { valor: 'SUSPENDIDA', texto: 'Suspendida', clase: 'warn' },
  { valor: 'EN_BAJA', texto: 'En baja', clase: 'bad' },
  { valor: 'ELIMINADA', texto: 'Eliminada', clase: 'bad' }
];
export const TIPOS_COBRO: { valor: TipoCobro; texto: string }[] = [
  { valor: 'LIMITE', texto: 'Con límite (precio fijo)' },
  { valor: 'POR_EMPLEADO', texto: 'Por empleado' }
];

/** Renglón de getEmpresas. */
export interface EmpresaPanel {
  idEmpresa: number; nombreComercial: string; razonSocial: string | null; rfc: string | null;
  estado: EstadoEmpresa; motivoEstado: string | null; fechaEstado: string | null; fechaAlta: string;
  idPlan: number | null; plan: string | null; tipoCobro: TipoCobro | null; limiteEmpleados: number | null;
  precioEspecial: number | null; empleadosActivos: number; usuarios: number; ultimoAcceso: string | null;
}

export interface PlanDeEmpresa {
  idEmpresaPlan: number; idPlan: number; plan: string; tipoCobro: TipoCobro; limiteEmpleados: number | null;
  precio: number; precioEspecial: number | null; fechaInicio: string; fechaFin: string | null; vigente: boolean;
  fechaRegistro: string; superadmin: string | null;
}
export interface UsoMes { mes: string; maximo: number | null; dias: number; }
export interface HistorialEmpresa {
  idHistorial: number; tipo: string; detalle: string | null; motivo: string | null; fecha: string; superadmin: string;
}
export interface ExportacionEmpresa { idExportacion: number; tamano: number; fecha: string; superadmin: string; }

export interface FichaEmpresa {
  empresa: {
    idEmpresa: number; nombreComercial: string; razonSocial: string | null; rfc: string | null; estado: EstadoEmpresa;
    motivoEstado: string | null; fechaEstado: string | null; fechaBajaProgramada: string | null; fechaEliminacion: string | null;
    fechaAlta: string; empleadosActivos: number; usuarios: number; sucursales: number; ultimoAcceso: string | null;
  };
  plan: PlanDeEmpresa | null;
  planes: PlanDeEmpresa[];
  uso: UsoMes[];
  historial: HistorialEmpresa[];
  exportaciones: ExportacionEmpresa[];
}

export interface ModuloEmpresa { modulo: string; nombre: string; icono: string; disponible: boolean; contratado: boolean; }
export interface ZonaHoraria { zona: string; nombre: string; }
export interface CatalogosAlta { zonas: ZonaHoraria[]; modulos: { modulo: string; nombre: string; icono: string }[]; }

export interface AltaEmpresa {
  nombreComercial: string; razonSocial: string | null; rfc: string | null; sucursal: string; zonaHoraria: string;
  correoAdmin: string; nombreAdmin: string | null; modulos: string[]; idPlan: number; precioEspecial: number | null;
}
export interface CambioPlan {
  idEmpresa: number; idPlan: number; fechaInicio: string | null; precioEspecial: number | null; motivo: string | null; bConfirmado?: boolean;
}

export interface Plan {
  idPlan: number; nombre: string; tipoCobro: TipoCobro; limiteEmpleados: number | null; precio: number; bActivo: boolean | number; empresas: number;
}
export interface PlanGuardar { idPlan?: number | null; nombre: string; tipoCobro: TipoCobro; limiteEmpleados: number | null; precio: number | null; }

export interface FilaCobro {
  idEmpresa: number; nombreComercial: string; razonSocial: string | null; rfc: string | null; estado: EstadoEmpresa;
  idPlan: number; plan: string; tipoCobro: TipoCobro; limiteEmpleados: number | null; precio: number; precioEspecial: number | null;
  precioAplicado: number; empleadosMes: number; diasContados: number; importe: number;
}
export interface CobroMes { mes: string; inicio: string; fin: string; total: number; filas: FilaCobro[]; }

/** Constante como la manda el panel: definición + valor global (en su tipo). */
export interface ConstantePanel extends DefinicionAjuste {
  orden: number; valor: ValorAjuste; bActivo: boolean; empresasConValor?: number;
}
export interface GrupoConstantes<T = ConstantePanel> { grupo: string; constantes: T[]; }
export interface ConstanteDeEmpresa extends ConstantePanel { valorEmpresa: ValorAjuste; bPropio: boolean; valorEfectivo: ValorAjuste; }
export interface ValorEmpresaConstante { idEmpresa: number; empresa: string; estado: EstadoEmpresa; valor: ValorAjuste; fechaModificacion: string | null; }
export interface ImpactoGlobal { clave: string; empresas: number; conValorPropio: number; usanGlobal: number; }
export interface ValorInvalido { idEmpresa: number | null; empresa: string | null; valor: ValorAjuste; mensaje: string; }

/** Lo que se manda al guardar la definición (alta o edición). */
export interface DefinicionConstante {
  clave: string; grupo: string; orden: number; etiqueta: string; ayuda: string | null; tipoDato: TipoDato; control: Control;
  opciones: OpcionAjuste[] | null; validacion: ValidacionAjuste | null;
}

export interface MovimientoBitacora {
  idBitacora: number; fecha: string; idSuperadmin: number | null; nombreSuperadmin: string; accion: string;
  idEmpresa: number | null; empresa: string | null; objeto: string | null; antes: unknown; despues: unknown; motivo: string | null; ip: string | null;
}
export interface FiltrosBitacora {
  desde?: string; hasta?: string; idSuperadmin?: number | null; idEmpresa?: number | null; accion?: string; pagina: number; porPagina: number;
}
