import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { GlobalService, RolesService } from '../../../../../core/services';
import { CatalogoPermisos, PermisosMarcados, Rol } from '../../../../../models/permisos.models';
import { MatrizPermisos } from '../../../../../shared/components/matriz-permisos/matriz-permisos';

export interface RolModalData { rol: Rol | null; roles: Rol[]; }
type Banner = { ok: boolean; texto: string } | null;

/**
 * Alta y edición de un rol, con su matriz de permisos. No se cierra al
 * guardar (convención de modales CRUD). El rol Administrador se ve completo
 * y de solo lectura.
 *
 * Un solo Guardar: guarda el nombre y la descripción si cambiaron, y los
 * permisos si se tocó la matriz. Cerrar con cambios pide confirmar.
 */
@Component({
  selector: 'app-rol-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatrizPermisos],
  templateUrl: './rol-modal.html'
})
export class RolModal implements OnInit {
  private readonly api = inject(RolesService);
  private readonly ref = inject(MatDialogRef<RolModal, boolean>);
  readonly global = inject(GlobalService);
  readonly data = inject<RolModalData>(MAT_DIALOG_DATA);

  readonly idRol = signal<number | null>(this.data.rol?.idRol ?? null);
  readonly protegido = !!this.data.rol?.bProtegido;
  readonly puedeEditar = this.global.tienePermiso('roles_CreateUpdate') && !this.protegido;
  readonly puedePermisos = this.global.tienePermiso('roles_Permisos') && !this.protegido;

  readonly guardando = signal(false);
  readonly banner = signal<Banner>(null);
  readonly bannerPermisos = signal<Banner>(null);
  readonly catalogo = signal<CatalogoPermisos | null>(null);
  readonly marcados = signal<PermisosMarcados>({ menus: [], acciones: [] });
  private pendientes: PermisosMarcados | null = null;
  private cambios = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: [{ value: this.data.rol?.nombre ?? '', disabled: !this.puedeEditarForm() }, [Validators.required, Validators.maxLength(80)]],
    descripcion: [{ value: this.data.rol?.descripcion ?? '', disabled: !this.puedeEditarForm() }, [Validators.maxLength(250)]],
    copiarDe: [0]
  });

  private puedeEditarForm(): boolean {
    return this.global.tienePermiso('roles_CreateUpdate') && !this.data.rol?.bProtegido;
  }

  ngOnInit(): void {
    if (this.idRol()) this.cargarPermisos();
  }

  cargarPermisos(): void {
    const id = this.idRol();
    if (!id) return;
    this.api.getCatalogoPermisos().subscribe(r => { if (r.status_code === 0) this.catalogo.set(r.data); });
    this.api.getPermisosRol(id).subscribe(r => {
      if (r.status_code === 0) this.marcados.set({ menus: r.data.menus, acciones: r.data.acciones });
      else this.bannerPermisos.set({ ok: false, texto: r.message });
    });
  }

  /** Hay algo editable con permiso para guardarlo. */
  readonly puedeGuardar = this.puedeEditar || this.puedePermisos;

  async guardar(): Promise<void> {
    if (this.guardando() || !this.puedeGuardar) return;
    const nuevo = !this.idRol();
    const datos = this.puedeEditar && (nuevo || this.form.dirty);
    const permisos = !nuevo && this.puedePermisos && !!this.pendientes;
    if (!datos && !permisos) {
      this.bannerPermisos.set(null);
      this.banner.set({ ok: false, texto: 'No hay cambios que guardar.' });
      return;
    }
    if (datos && this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ ok: false, texto: 'Escribe el nombre del rol.' });
      return;
    }
    this.banner.set(null);
    this.bannerPermisos.set(null);
    this.guardando.set(true);
    try {
      if (datos && !await this.guardarDatos(nuevo)) return;
      if (permisos) await this.guardarPermisos();
    } catch {
      this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  private async guardarDatos(nuevo: boolean): Promise<boolean> {
    const v = this.form.getRawValue();
    const r = await firstValueFrom(this.api.insertUpdateRol({
      idRol: this.idRol(), nombre: v.nombre.trim(), descripcion: v.descripcion.trim() || null,
      copiarDe: nuevo && v.copiarDe ? Number(v.copiarDe) : null
    }));
    this.banner.set({ ok: r.status_code === 0, texto: r.message });
    if (r.status_code !== 0) return false;
    this.cambios = true;
    this.form.markAsPristine();
    if (nuevo) { this.idRol.set(r.data.id); this.cargarPermisos(); }
    return true;
  }

  cambioMatriz(p: PermisosMarcados): void { this.pendientes = p; }

  private async guardarPermisos(): Promise<void> {
    const id = this.idRol()!;
    const r = await firstValueFrom(this.api.setPermisosRol(id, this.pendientes!.menus, this.pendientes!.acciones));
    this.bannerPermisos.set({ ok: r.status_code === 0, texto: r.message });
    if (r.status_code === 0) {
      this.cambios = true;
      this.pendientes = null;
      // Si el rol es uno de los míos, mi menú también cambia.
      this.global.cargar();
    }
    this.cargarPermisos();
  }

  /** Hay algo escrito o marcado que no se ha guardado. */
  private sinGuardar(): boolean {
    return (this.puedeEditar && this.form.dirty) || !!this.pendientes;
  }

  cerrar(): void {
    if (this.sinGuardar() && !confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?')) return;
    this.ref.close(this.cambios);
  }
}
