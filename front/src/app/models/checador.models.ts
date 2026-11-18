/** Proceso de marcaje y dispositivo checador (análisis 005). */

export type EstadoDispositivo = 'PENDIENTE' | 'VINCULADO' | 'REVOCADO';

export interface Dispositivo {
  idDispositivo: number; idSucursal: number; sucursal: string; zonaHoraria: string; nombre: string;
  estado: EstadoDispositivo; codigoVence: string | null; fechaVinculacion: string | null;
  ultimaConexion: string | null; ultimoMarcaje: string | null; versionFront: string | null;
  fechaRevocacion: string | null; fechaAlta: string; bCodigoVigente: boolean; bSinConexion: boolean;
}

/** Lo que regresa el alta o "Generar otro": el código en claro, UNA vez. */
export interface CodigoVinculacion { id: number; codigo: string; vence: string; segundosVigencia: number; }

export interface FormaChecado {
  forma: string; nombre: string; descripcion: string | null; icono: string; estado: 'DISPONIBLE' | 'PROXIMAMENTE';
  evidencias: string[]; verificaciones: string[];
}
export interface FormasSucursal {
  idSucursal: number; nombre: string; zonaHoraria: string;
  formas: Record<string, { bActiva: boolean; configuracion: unknown; fechaModificacion: string }>;
}
export interface FormaEmpleado extends FormaChecado { sucursal: boolean; excepcion: boolean | null; }

export interface ConsentimientoTexto { version: number; texto: string; vigenteDesde: string; versiones: number; }

export type EstadoRostro = 'SIN_CONSENTIMIENTO' | 'SIN_ROSTRO' | 'REGISTRADO';
export interface RostroEmpleado {
  empleado: { idEmpleado: number; numeroEmpleado: string; nombre: string; estado: 'ACTIVO' | 'BAJA' };
  estado: EstadoRostro;
  consentimiento: { version: number; fechaAceptacion: string; evidencia: { medio: string; nota: string | null } | null; hayVersionNueva: boolean } | null;
  textoVigente: { version: number; texto: string; vigenteDesde: string } | null;
  rostro: { fechaRegistro: string; tomas: number; registradoPor: string | null } | null;
  /** Tomas que exige el registro (constante faceid.tomas_registro). */
  tomasRegistro: number;
}

export interface MarcajePorRevisar {
  idMarcaje: number; instante: string; fechaNegocio: string; idSucursal: number; sucursal: string; zonaHoraria: string;
  idEmpleado: number; numeroEmpleado: string; empleado: string; forma: string; formaNombre: string; formaIcono: string;
  idDispositivo: number | null; dispositivo: string | null; resultado: 'POR_REVISAR' | 'ACEPTADO' | 'ANULADO';
  motivoDuda: string | null; decisionRevision: 'APROBADO' | 'RECHAZADO' | null; motivoRevision: string | null;
  fechaRevision: string | null; revisadoPor: string | null; tieneFoto: boolean; numeroEscrito: string | null;
  faceid: { resultado: string; similitud: number | null; candidatos: { nombre?: string; numeroEmpleado?: string; similitud: number }[] } | null;
}

/** Reto de la prueba de vida: giros de cabeza al azar. */
export interface RetoVida { idReto: string; pasos: ('IZQ' | 'DER')[]; segundosVigencia: number; tomas?: number; }

/** Un cuadro de la secuencia que se manda al servidor. */
export interface CuadroRostro { t: number; landmarks: number[][]; descriptor?: number[]; score?: number; }

/** Lo que entrega el componente de captura. */
export interface CapturaRostro { idReto: string; frames: CuadroRostro[]; foto: Blob | null; }

/** Lo que el dispositivo guarda de sí mismo (la llave va aparte). */
export interface InfoDispositivo { nombre: string; sucursal: string; empresa: string; zonaHoraria: string; }

export type ResultadoChecar = 'REGISTRADO' | 'POR_REVISAR' | 'DUDA' | 'NO_RECONOCIDO' | 'SIN_VIDA' | 'RECHAZADO' | 'REINTENTAR';
