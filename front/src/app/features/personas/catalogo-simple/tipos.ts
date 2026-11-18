import { Observable } from 'rxjs';
import { ApiResponse } from '../../../models/common.models';
import { DepartamentosService, PuestosService } from '../../../core/services';

/**
 * Lo que distingue a Puestos de Departamentos (análisis 004): mismos datos,
 * misma pantalla y mismo modal; cambian los textos, el servicio y los permisos.
 */
export interface TipoCatalogo {
  clave: 'puestos' | 'departamentos';
  titulo: string; singular: string; icono: string; descripcion: string;
  accionEditar: string; accionEstado: string;
  listar: (estado: 'activos' | 'todos') => Observable<ApiResponse>;
  guardar: (body: { id?: number | null; nombre: string }) => Observable<ApiResponse>;
  cambiarEstado: (id: number, bActivo: boolean) => Observable<ApiResponse>;
}

/** Arma el tipo (textos, servicio y permisos) de Puestos o Departamentos. */
export const tipoCatalogo = (clave: 'puestos' | 'departamentos', puestos: PuestosService, departamentos: DepartamentosService): TipoCatalogo =>
  clave === 'puestos'
    ? {
      clave, titulo: 'Puestos', singular: 'puesto', icono: 'work_outline',
      descripcion: 'Lo que hace cada empleado. Un puesto con empleados no se borra: se desactiva y ellos lo conservan.',
      accionEditar: 'puestos_CreateUpdate', accionEstado: 'puestos_Disable',
      listar: e => puestos.getPuestos(e), guardar: b => puestos.insertUpdatePuesto(b),
      cambiarEstado: (id, a) => puestos.disablePuesto(id, a)
    }
    : {
      clave, titulo: 'Departamentos', singular: 'departamento', icono: 'account_tree',
      descripcion: 'Las áreas de la empresa (se usan en nómina y en el IMSS). Uno con empleados no se borra: se desactiva.',
      accionEditar: 'departamentos_CreateUpdate', accionEstado: 'departamentos_Disable',
      listar: e => departamentos.getDepartamentos(e), guardar: b => departamentos.insertUpdateDepartamento(b),
      cambiarEstado: (id, a) => departamentos.disableDepartamento(id, a)
    };
