/**
 * Horarios y días programados (análisis 006). El contrato sale de
 * back/controllers/horarios.js. Las horas viajan como 'HH:mm' (hora de pared,
 * no un instante) y las fechas de negocio como 'AAAA-MM-DD'.
 */

export type EstadoDia = 'LABORABLE' | 'DESCANSO' | 'SIN_HORARIO';
export type TipoJornada = 'DIURNA' | 'MIXTA' | 'NOCTURNA';

/** Un día del horario semanal (1 = lunes … 7 = domingo), como se manda al servidor. */
export interface DiaSemanaHorario {
  diaSemana: number;
  estado: EstadoDia;
  entrada: string | null;
  salida: string | null;
  comidaMinutos: number;
  bComidaDentro: boolean;
}

/** El día con su cálculo (horas null si el día tiene errores). */
export interface DiaSemanaCalculado extends DiaSemanaHorario {
  nombreDia: string;
  horas: number | null;
  tipoJornada: TipoJornada | null;
  bCruzaMedianoche: boolean;
  maximoDiario: number | null;
}

export interface AvisoJornada {
  tipo: 'DIARIO' | 'SEMANAL';
  diaSemana: number | null;
  fecha: string | null;
  tipoJornada: TipoJornada | null;
  horas: number;
  maximo: number;
  mensaje: string;
}

/** Siete días con cálculo, total y avisos de máximos (no impiden guardar). */
export interface ResumenHorario {
  dias: DiaSemanaCalculado[];
  totalHoras: number;
  maxSemanal: number;
  avisos: AvisoJornada[];
}

export interface RevisionHorario extends ResumenHorario { errores: string[]; }

export interface HorarioEmpleado extends ResumenHorario {
  idEmpleado: number;
  numeroEmpleado: string;
  nombreCompleto: string;
  estado: 'ACTIVO' | 'BAJA';
  idSucursalPrincipal: number;
  sucursalPrincipal: string | null;
  zonaHoraria: string;
  hoy: string;
  bSinHorario: boolean;
  bPlantillaDefinida: boolean;
  bIgualPlantilla: boolean;
}

/** Día cambiado a mano que una regeneración respetó. */
export interface DiaConservado {
  fecha: string;
  estado: EstadoDia;
  entrada: string | null;
  salida: string | null;
  motivo: string | null;
}

export interface HorarioGuardado extends ResumenHorario {
  id: number;
  aPartirDe: string;
  generados: number;
  conservados: DiaConservado[];
}

export interface SucursalHorarios {
  idSucursal: number;
  nombre: string;
  zonaHoraria: string;
  bActivo: boolean;
  /** Es de las sucursales del usuario (selector de la pantalla). */
  bAlcance: boolean;
}

export interface PlantillaSucursal extends ResumenHorario {
  idSucursal: number;
  sucursal: string;
  zonaHoraria: string;
  bActivo: boolean;
  hoy: string;
  bDefinida: boolean;
}

export type GrupoAplicar = 'IGUAL' | 'CAMBIARIA' | 'PROPIO';

export interface EmpleadoAplicar {
  idEmpleado: number;
  numeroEmpleado: string;
  nombreCompleto: string;
  grupo: GrupoAplicar;
  bSinHorario: boolean;
  /** { Lunes: '09:00–18:00, comida 60 min (se descuenta)', … } */
  horario: Record<string, string>;
}

export interface VistaPreviaAplicar {
  idSucursal: number;
  sucursal: string;
  hoy: string;
  bDefinida: boolean;
  plantilla: ResumenHorario;
  empleados: EmpleadoAplicar[];
  resumen: { igual: number; cambiaria: number; propio: number };
}

export interface ResultadoAplicar {
  aplicados: number;
  aPartirDe: string;
  resultados: { idEmpleado: number; nombreCompleto: string; generados: number; conservados: DiaConservado[] }[];
}

/** Un día programado (calendario). `precioHora` solo viene con empleados_Precio. */
export interface DiaProgramado {
  idDia: number;
  idEmpleado: number;
  fecha: string;
  diaSemana: number;
  nombreDia: string;
  estado: EstadoDia;
  entrada: string | null;
  salida: string | null;
  bCruzaMedianoche: boolean;
  comidaMinutos: number;
  bComidaDentro: boolean;
  horas: number | null;
  tipoJornada: TipoJornada | null;
  maximoDiario: number | null;
  idSucursal: number;
  sucursal: string | null;
  bManual: boolean;
  motivo: string | null;
  idSucursalCobertura: number | null;
  sucursalCobertura: string | null;
  horaCobertura: string | null;
  horasHorario: number | null;
  bExcede: boolean;
  precioHora?: number | null;
}

export interface DiasEmpleado {
  idEmpleado: number;
  nombreCompleto: string;
  zonaHoraria: string;
  hoy: string;
  horizonte: string;
  desde: string;
  hasta: string;
  dias: DiaProgramado[];
}

export interface DiaSucursal extends DiaProgramado {
  numeroEmpleado: string;
  nombreCompleto: string;
  /** Está en la lista porque cubre esta sucursal (su día es de otra). */
  bCubre: boolean;
}

export interface DiasSucursal {
  idSucursal: number;
  sucursal: string;
  zonaHoraria: string;
  fecha: string;
  hoy: string;
  bPasada: boolean;
  semana: { desde: string; hasta: string; cierre: string; bCerrada: boolean };
  empleados: DiaSucursal[];
}

export interface CoberturaDia { idSucursalCobertura: number; horaCobertura: string; }

/** Lo que se manda para cambiar un día (sin `cobertura`, la quita). */
export interface CambioDia {
  estado: 'LABORABLE' | 'DESCANSO';
  entrada: string | null;
  salida: string | null;
  comidaMinutos: number;
  bComidaDentro: boolean;
  motivo: string | null;
  cobertura?: CoberturaDia;
}

export interface SalidaPlantilla {
  idSucursal: number;
  sucursal: string;
  fecha: string;
  diaSemana: number;
  nombreDia: string;
  estado: EstadoDia;
  entrada: string | null;
  salida: string | null;
}

export interface HorarioPorAjustar {
  idEmpleado: number;
  numeroEmpleado: string;
  nombreCompleto: string;
  idSucursalPrincipal: number;
  sucursalPrincipal: string;
  zonaHoraria: string;
  bSinHorario: boolean;
  diasSinHorario: number;
  primerDiaSinHorario: string | null;
}

export type TipoBitacoraHorario = 'HORARIO' | 'PLANTILLA' | 'APLICAR' | 'DIA' | 'DIA_REGRESO' | 'COBERTURA';

export interface BitacoraHorario {
  idBitacora: number;
  /** Instante del cambio (se muestra con fechaSucursal y `zonaHoraria`). */
  fecha: string;
  tipo: TipoBitacoraHorario;
  idEmpleado: number | null;
  empleado: string | null;
  idSucursal: number | null;
  sucursal: string | null;
  fechaDia: string | null;
  motivo: string | null;
  /** Ya legibles: { dias: { Lunes: '…' }, aPartirDe, conservados } o { horario, horas, sucursal, cobertura }. */
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  autor: string | null;
  zonaHoraria: string;
}

/** data de insertUpdateEmpleado cuando cambia la sucursal principal sin decir qué pasa con el horario. */
export interface ConfirmarHorario {
  codigo: 'CONFIRMAR_HORARIO';
  idSucursalAnterior: number;
  sucursalAnterior: string | null;
  idSucursalNueva: number;
  sucursalNueva: string | null;
}
