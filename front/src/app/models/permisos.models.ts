/** Menú de la sesión (global/getMenu), agrupado por módulo. */
export interface ItemMenuSesion {
  menu: string; titulo: string; icono: string; ruta: string; inferior: boolean; bloqueado: boolean;
}
export interface GrupoMenuSesion { modulo: string; nombre: string | null; bloqueado: boolean; items: ItemMenuSesion[]; }

/** Catálogo para la matriz de permisos (roles/getCatalogoPermisos). */
export interface AccionCatalogo { accion: string; etiqueta: string; }
export interface MenuCatalogo { menu: string; titulo: string; icono: string; acciones: AccionCatalogo[]; }
export interface ModuloCatalogo { modulo: string; nombre: string; menus: MenuCatalogo[]; }
export interface Otorgables { admin: boolean; menus: string[]; acciones: string[]; }
export interface CatalogoPermisos { modulos: ModuloCatalogo[]; otorgables: Otorgables; }

/** Permisos marcados (de un rol o directos de un usuario). */
export interface PermisosMarcados { menus: string[]; acciones: string[]; }

export interface Rol {
  idRol: number; nombre: string; descripcion: string | null; bActivo: number; bProtegido: number;
  plantilla: string | null; usuarios: number;
}
