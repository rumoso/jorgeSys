/** Empleados, puestos y departamentos (análisis 004). Las fechas de negocio viajan como texto 'AAAA-MM-DD'. */

export type EstadoEmpleado = 'ACTIVO' | 'BAJA';

/** Puesto o departamento (catálogo simple de la empresa). */
export interface CatalogoSimpleItem { id: number; nombre: string; bActivo: number; empleados: number; fechaAlta?: string; }
export interface OpcionCatalogo { id: number; nombre: string; }

export interface EmpleadoLista {
  idEmpleado: number; numeroEmpleado: string; nombre: string; apellidoPaterno: string; apellidoMaterno: string | null;
  nombreCompleto: string; estado: EstadoEmpleado; fechaIngreso: string; fechaBaja: string | null;
  idSucursalPrincipal: number; sucursalPrincipal: string; zonaHoraria: string; principalActiva: boolean;
  idSucursalOperativa: number; sucursalOperativa: string; operativaActiva: boolean;
  idPuesto: number | null; puesto: string | null; idDepartamento: number | null; departamento: string | null;
  bFoto: boolean; porReubicar: boolean;
}
export interface PaginaEmpleados { total: number; pagina: number; porPagina: number; filas: EmpleadoLista[]; }

export interface FiltrosEmpleados {
  q?: string; idSucursal?: number | null; idPuesto?: number | null; idDepartamento?: number | null;
  estado?: 'activos' | 'baja' | 'todos'; pagina?: number; porPagina?: number;
}

export interface PeriodoLaboral { idPeriodo: number; fechaIngreso: string; fechaBaja: string | null; motivoBaja: string | null; }
export interface PrecioVigente { precioHora: number; aPartirDe: string; }

/** Ficha completa (getEmpleado). CURP, RFC, NSS, fecha de nacimiento y precio llegan solo con su permiso. */
export interface Empleado {
  idEmpleado: number; numeroEmpleado: string; nombre: string; apellidoPaterno: string; apellidoMaterno: string | null;
  nombreCompleto: string;
  idSucursalPrincipal: number; sucursalPrincipal: string; principalActiva: boolean; zonaHoraria: string;
  idSucursalOperativa: number; sucursalOperativa: string; operativaActiva: boolean; zonaOperativa: string;
  porReubicar: boolean;
  idPuesto: number | null; puesto: string | null; idDepartamento: number | null; departamento: string | null;
  estado: EstadoEmpleado; fechaIngreso: string; fechaBaja: string | null; motivoBaja: string | null;
  telefono: string | null; correo: string | null;
  curp?: string | null; rfc?: string | null; nss?: string | null; fechaNacimiento?: string | null;
  idUsuario: number | null; usuarioNombre: string | null; usuarioCorreo: string | null;
  bFoto: boolean; hoy: string; periodos: PeriodoLaboral[]; precioVigente?: PrecioVigente | null;
}

export interface SucursalOpcionEmpleado { idSucursal: number; nombre: string; zonaHoraria: string; }
export interface UsuarioLigable { idUsuario: number; nombre: string; correo: string; }
export interface CatalogosEmpleado {
  sucursales: SucursalOpcionEmpleado[]; puestos: OpcionCatalogo[]; departamentos: OpcionCatalogo[]; usuarios: UsuarioLigable[];
}

/** Lo que se manda al guardar (alta rápida o edición). */
export interface EmpleadoGuardar {
  idEmpleado?: number | null; numeroEmpleado?: string | null; nombre?: string; apellidoPaterno?: string;
  apellidoMaterno?: string | null; idSucursalPrincipal?: number | null; idSucursalOperativa?: number | null;
  idPuesto?: number | null; idDepartamento?: number | null; fechaIngreso?: string | null;
  telefono?: string | null; correo?: string | null; curp?: string | null; rfc?: string | null; nss?: string | null;
  fechaNacimiento?: string | null; idUsuario?: number | null; confirmarDuplicado?: boolean;
  /** 006: al cambiar la sucursal principal, qué pasa con su horario (sin él, el servidor pide CONFIRMAR_HORARIO). */
  horarioAlCambiarSucursal?: 'conservar' | 'tomar';
}

export interface EmpleadoParecido {
  idEmpleado: number; numeroEmpleado: string; nombreCompleto: string; estado: EstadoEmpleado; sucursal: string; motivo: string;
}

export interface PrecioHistorial { idPrecio: number; precioHora: number; aPartirDe: string; fechaCaptura: string; capturo: string | null; }
export interface PreciosEmpleado { hoy: string; zonaHoraria: string; vigente: PrecioVigente | null; historial: PrecioHistorial[]; }

// ── Alta masiva ──
export interface RenglonImportacion {
  renglon: number; datos: Record<string, string>; numeroEmpleado: string; nombreCompleto: string;
  sucursal: string; fechaIngreso: string | null; ok: boolean; errores: string[]; avisos: string[];
}
export interface VistaPreviaImportacion {
  total: number; correctos: number; conError: number; maximo: number;
  seCrearan: { puestos: string[]; departamentos: string[] };
  puedeCrear: { puestos: boolean; departamentos: boolean };
  renglones: RenglonImportacion[];
}
export interface ResultadoImportacion {
  cargados: number; rechazados: { renglon: number; errores: string[] }[];
  creados: { puestos: string[]; departamentos: string[] };
}
