import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AuthService, GlobalService, RolesService, UsuariosEmpresaService } from '../../../../../core/services';
import { ApiResponse } from '../../../../../models/common.models';
import { CatalogoPermisos, PermisosMarcados, Rol } from '../../../../../models/permisos.models';
import { MatrizPermisos } from '../../../../../shared/components/matriz-permisos/matriz-permisos';

export interface SucursalOpcion { idSucursal: number; nombre: string; }
export interface UsuarioEmpresa {
  idUsuario: number; correo: string; nombre: string; bTodasSucursales: number;
  sucursales: number[]; sucursalesNombres: string | null;
  roles: number[]; rolesNombres: string | null; esAdministrador: boolean; permisosDirectos: number;
  esYo: boolean;
}
export interface UsuarioAccesoModalData { usuario: UsuarioEmpresa | null; sucursales: SucursalOpcion[]; roles: Rol[]; }

type Banner = { ok: boolean; texto: string } | null;
const MIN = 8;

/**
 * Dar acceso a una cuenta (nueva o existente) y editar su acceso a ESTA
 * empresa: roles, sucursales, permisos directos y restablecer la contraseña.
 * No se cierra al guardar (convención de modales CRUD). Cada sección depende
 * de su permiso.
 */
@Component({
  selector: 'app-usuario-acceso-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatrizPermisos],
  templateUrl: './usuario-acceso-modal.html'
})
export class UsuarioAccesoModal implements OnInit {
  private readonly api = inject(UsuariosEmpresaService);
  private readonly apiRoles = inject(RolesService);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<UsuarioAccesoModal, boolean>);
  readonly global = inject(GlobalService);
  readonly data = inject<UsuarioAccesoModalData>(MAT_DIALOG_DATA);
  readonly MIN = MIN;

  readonly idUsuario = signal<number | null>(this.data.usuario?.idUsuario ?? null);
  readonly esYo = !!this.data.usuario?.esYo;
  /** El servidor pidió nombre y contraseña: el correo no tiene cuenta. */
  readonly pideDatos = signal(false);
  readonly guardando = signal(false);
  readonly banner = signal<Banner>(null);
  readonly bannerPass = signal<Banner>(null);
  readonly bannerDirectos = signal<Banner>(null);
  readonly verDirectos = signal(false);
  readonly catalogo = signal<CatalogoPermisos | null>(null);
  readonly directos = signal<PermisosMarcados>({ menus: [], acciones: [] });
  /** Lo que ya le dan sus roles: se muestra en la matriz como "por su rol". */
  readonly porRoles = signal<PermisosMarcados | null>(null);
  private directosPendientes: PermisosMarcados | null = null;
  private cambios = false;

  /** Con el id ya existente se edita; sin él se da acceso. Cada uno con su permiso. */
  puedeGuardar(): boolean {
    return this.global.tienePermiso(this.idUsuario() ? 'usuarios_Editar' : 'usuarios_DarAcceso');
  }
  readonly puedeDirectos = this.global.tienePermiso('usuarios_Editar') && !this.esYo;
  readonly puedeRestablecer = this.global.tienePermiso('usuarios_RestablecerPassword');

  readonly form = inject(FormBuilder).nonNullable.group({
    correo: [{ value: this.data.usuario?.correo ?? '', disabled: !!this.data.usuario }, [Validators.required, Validators.email]],
    nombre: [''],
    password: [''],
    roles: [this.data.usuario?.roles ?? [] as number[]],
    bTodasSucursales: [this.data.usuario ? !!this.data.usuario.bTodasSucursales : true],
    sucursales: [this.data.usuario?.sucursales ?? [] as number[]]
  });
  readonly passwordNueva = new FormControl('', { nonNullable: true });

  ngOnInit(): void {
    if (!this.puedeGuardar()) this.form.disable();
  }

  rolMarcado(id: number): boolean { return this.form.controls.roles.value.includes(id); }
  alternarRol(id: number, marcar: boolean): void {
    const actual = this.form.controls.roles.value.filter(x => x !== id);
    this.form.controls.roles.setValue(marcar ? [...actual, id] : actual);
    this.form.controls.roles.markAsDirty();
  }

  marcada(id: number): boolean { return this.form.controls.sucursales.value.includes(id); }
  alternarSucursal(id: number, marcar: boolean): void {
    const actual = this.form.controls.sucursales.value.filter(x => x !== id);
    this.form.controls.sucursales.setValue(marcar ? [...actual, id] : actual);
    this.form.controls.sucursales.markAsDirty();
  }

  guardar(): void {
    if (this.guardando() || !this.puedeGuardar()) return;
    const v = this.form.getRawValue();
    if (!this.idUsuario() && this.form.controls.correo.invalid) { this.banner.set({ ok: false, texto: 'Escribe un correo válido.' }); return; }
    if (!v.bTodasSucursales && !v.sucursales.length) { this.banner.set({ ok: false, texto: 'Escoge al menos una sucursal o marca "Todas".' }); return; }
    if (this.pideDatos() && (!v.nombre.trim() || v.password.length < MIN)) {
      this.banner.set({ ok: false, texto: `Escribe el nombre y una contraseña inicial de al menos ${MIN} caracteres.` });
      return;
    }
    const comun = { roles: v.roles, bTodasSucursales: v.bTodasSucursales, sucursales: v.bTodasSucursales ? [] : v.sucursales };
    const id = this.idUsuario();
    const peticion = id
      ? this.api.updateUsuarioEmpresa({ idUsuario: id, ...comun })
      : this.api.darAcceso({ correo: v.correo.trim(), ...(this.pideDatos() ? { nombre: v.nombre.trim(), password: v.password } : {}), ...comun });

    this.guardando.set(true);
    peticion.subscribe({
      next: (r: ApiResponse) => {
        this.guardando.set(false);
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) {
          this.cambios = true;
          if (!id) {
            // Ya dado de alta: pasa a modo edición con el id nuevo.
            this.idUsuario.set(r.data.id);
            this.form.controls.correo.disable();
            this.pideDatos.set(false);
            this.form.patchValue({ password: '' });
            if (!this.puedeGuardar()) this.form.disable();
          }
          this.form.markAsPristine();
          // Con roles nuevos cambia lo que ya tiene "por su rol".
          if (this.verDirectos()) this.recargarPorRoles();
          // Si me cambié a mí mismo, mi menú y mis sucursales también cambian.
          if (this.esYo) this.auth.refrescarSesion();
        } else if (r.data?.requiereDatos) {
          this.pideDatos.set(true);
        }
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  abrirDirectos(): void {
    const id = this.idUsuario();
    if (!id) return;
    this.verDirectos.set(true);
    this.apiRoles.getCatalogoPermisos().subscribe(r => { if (r.status_code === 0) this.catalogo.set(r.data); });
    this.api.getPermisosDirectos(id).subscribe(r => {
      if (r.status_code === 0) {
        this.directos.set({ menus: r.data.menus, acciones: r.data.acciones });
        this.porRoles.set(r.data.porRoles ?? null);
      } else this.bannerDirectos.set({ ok: false, texto: r.message });
    });
  }

  private recargarPorRoles(): void {
    const id = this.idUsuario();
    if (!id) return;
    this.api.getPermisosDirectos(id).subscribe(r => { if (r.status_code === 0) this.porRoles.set(r.data.porRoles ?? null); });
  }

  cambioDirectos(p: PermisosMarcados): void { this.directosPendientes = p; }

  guardarDirectos(): void {
    const id = this.idUsuario();
    if (!id || this.guardando()) return;
    if (!this.directosPendientes) { this.bannerDirectos.set({ ok: false, texto: 'No hay cambios en los permisos directos.' }); return; }
    this.guardando.set(true);
    this.api.setPermisosDirectos(id, this.directosPendientes.menus, this.directosPendientes.acciones).subscribe({
      next: r => {
        this.guardando.set(false);
        this.bannerDirectos.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) { this.cambios = true; this.directosPendientes = null; }
        this.abrirDirectos();
      },
      error: () => { this.guardando.set(false); this.bannerDirectos.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  restablecer(): void {
    const id = this.idUsuario();
    const pass = this.passwordNueva.value;
    if (!id || this.guardando()) return;
    if (pass.length < MIN) { this.bannerPass.set({ ok: false, texto: `La contraseña debe tener al menos ${MIN} caracteres.` }); return; }
    this.guardando.set(true);
    this.api.restablecerPassword(id, pass).subscribe({
      next: r => {
        this.guardando.set(false);
        this.bannerPass.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) {
          this.passwordNueva.setValue('');
          if (r.data?.token) this.auth.setToken(r.data.token);
        }
      },
      error: () => { this.guardando.set(false); this.bannerPass.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  /** Hay algo escrito o marcado que no se ha guardado. */
  private sinGuardar(): boolean {
    return (this.puedeGuardar() && this.form.dirty) || !!this.directosPendientes || !!this.passwordNueva.value;
  }

  cerrar(): void {
    if (this.sinGuardar() && !confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?')) return;
    this.ref.close(this.cambios);
  }
}
