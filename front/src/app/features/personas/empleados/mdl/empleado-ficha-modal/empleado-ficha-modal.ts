import { Component, Type, computed, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { DepartamentosService, EmpleadosService, GlobalService, PuestosService } from '../../../../../core/services';
import { CatalogosEmpleado, Empleado, EmpleadoGuardar, OpcionCatalogo, PreciosEmpleado } from '../../../../../models/empleados.models';
import { TabsDeslizablesDirective } from '../../../../../shared/directives/tabs-deslizables.directive';
import { FotoEmpleado } from '../../../../../shared/components/foto-empleado/foto-empleado';
import { FechaNegocioPipe } from '../../../../../shared/pipes/fecha-negocio.pipe';
import { FechaSucursalPipe } from '../../../../../shared/pipes/fecha-sucursal.pipe';
import { fechaCorta } from '../../../../../shared/utils/fecha-negocio';
import { CatalogoSimpleGuardado, CatalogoSimpleModal, CatalogoSimpleModalData } from '../../../catalogo-simple/mdl';
import { tipoCatalogo } from '../../../catalogo-simple/tipos';
import { PESTANAS_EMPLEADO, PestanaEmpleado } from './pestanas';
import { ConfirmarHorario, ResumenHorario } from '../../../../../models/horarios.models';
import { HorarioPendiente } from '../../../../checador/horarios/horario-pendiente';

export interface EmpleadoFichaModalData { idEmpleado: number; }

type Banner = { tipo: 'ok' | 'bad' | 'info'; texto: string } | null;
interface OpcionSucursal { idSucursal: number; nombre: string; }

/**
 * Ficha del empleado (análisis 004), por pestañas deslizables:
 *  - Datos: identificación, foto, contacto, datos personales (con su
 *    permiso) y cuenta ligada.
 *  - Adscripción: sucursal principal y operativa, puesto y departamento (con
 *    alta al vuelo), periodos laborales con baja y reingreso, y precio por
 *    hora (con su permiso).
 *  - Las de otros análisis (pestanas.ts).
 * Sin empleados_CreateUpdate es de solo lectura. No se cierra al guardar.
 */
@Component({
  selector: 'app-empleado-ficha-modal',
  imports: [ReactiveFormsModule, NgComponentOutlet, MatDialogModule, MatIconModule, MatButtonModule, MatTabsModule, MatTooltipModule,
    MatProgressBarModule, TabsDeslizablesDirective, FotoEmpleado, FechaNegocioPipe, FechaSucursalPipe],
  templateUrl: './empleado-ficha-modal.html',
  styleUrl: './empleado-ficha-modal.scss'
})
export class EmpleadoFichaModal {
  private readonly api = inject(EmpleadosService);
  private readonly ref = inject(MatDialogRef<EmpleadoFichaModal, boolean>);
  private readonly dialog = inject(MatDialog);
  private readonly puestosApi = inject(PuestosService);
  private readonly departamentosApi = inject(DepartamentosService);
  readonly data = inject<EmpleadoFichaModalData>(MAT_DIALOG_DATA);
  private readonly global = inject(GlobalService);
  private readonly fb = inject(FormBuilder);

  readonly puedeEditar = this.global.tienePermiso('empleados_CreateUpdate');
  readonly puedeDatosPersonales = this.global.tienePermiso('empleados_DatosPersonales');
  readonly puedePrecio = this.global.tienePermiso('empleados_Precio');
  readonly puedeBaja = this.global.tienePermiso('empleados_Baja');
  readonly puedeCrearPuesto = this.puedeEditar && this.global.tienePermiso('puestos_CreateUpdate');
  readonly puedeCrearDepartamento = this.puedeEditar && this.global.tienePermiso('departamentos_CreateUpdate');

  readonly emp = signal<Empleado | null>(null);
  readonly cat = signal<CatalogosEmpleado>({ sucursales: [], puestos: [], departamentos: [], usuarios: [] });
  readonly precios = signal<PreciosEmpleado | null>(null);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly banner = signal<Banner>(null);
  readonly aviso = signal<string | null>(null);
  readonly versionFoto = signal(0);
  readonly fechaCorta = fechaCorta;
  private cambios = false;

  // 006: cambio de sucursal principal → "¿Conserva su horario o toma el de la nueva sucursal?"
  private readonly horarioPendiente = inject(HorarioPendiente);
  readonly confirmarHorario = signal<{ mensaje: string; sucursalNueva: string | null; body: EmpleadoGuardar } | null>(null);
  private confirmacionPrevia: string | null = null;
  /** Pestaña escogida (para abrir Horario con la plantilla nueva). */
  readonly pestana = signal(0);

  /** Pestañas de otros análisis que el usuario puede ver, ya cargadas. */
  readonly extras = signal<{ p: PestanaEmpleado; componente: Type<unknown> }[]>([]);

  readonly form = this.fb.nonNullable.group({
    numeroEmpleado: ['', [Validators.required, Validators.maxLength(20)]],
    nombre: ['', [Validators.required, Validators.maxLength(80)]],
    apellidoPaterno: ['', [Validators.required, Validators.maxLength(60)]],
    apellidoMaterno: ['', [Validators.maxLength(60)]],
    telefono: ['', [Validators.maxLength(20)]],
    correo: ['', [Validators.maxLength(150), Validators.email]],
    curp: ['', [Validators.maxLength(18)]],
    rfc: ['', [Validators.maxLength(13)]],
    nss: ['', [Validators.maxLength(11)]],
    fechaNacimiento: [''],
    idUsuario: [0],
    idSucursalPrincipal: [0, [Validators.min(1)]],
    idSucursalOperativa: [0, [Validators.min(1)]],
    idPuesto: [0],
    idDepartamento: [0]
  });
  readonly formPrecio = this.fb.nonNullable.group({ precioHora: ['', [Validators.required]], aPartirDe: ['', [Validators.required]] });
  readonly formBaja = this.fb.nonNullable.group({ fechaBaja: ['', [Validators.required]], motivoBaja: ['', [Validators.required, Validators.maxLength(250)]] });
  readonly formReingreso = this.fb.nonNullable.group({ fechaIngreso: ['', [Validators.required]] });

  /** Sucursales para escoger: las activas de mi alcance y, si no está ahí, la que ya tiene (inactiva u otra). */
  readonly opcionesSucursal = computed(() => {
    const e = this.emp();
    const lista: OpcionSucursal[] = this.cat().sucursales.map(s => ({ idSucursal: s.idSucursal, nombre: s.nombre }));
    if (e) {
      for (const [id, nombre, activa] of [[e.idSucursalPrincipal, e.sucursalPrincipal, e.principalActiva], [e.idSucursalOperativa, e.sucursalOperativa, e.operativaActiva]] as const) {
        if (!lista.some(s => s.idSucursal === id)) lista.push({ idSucursal: id, nombre: `${nombre} (${activa ? 'no asignada a ti' : 'inactiva'})` });
      }
    }
    return lista;
  });
  readonly opcionesPuesto = computed(() => this.conActual(this.cat().puestos, this.emp()?.idPuesto, this.emp()?.puesto));
  readonly opcionesDepartamento = computed(() => this.conActual(this.cat().departamentos, this.emp()?.idDepartamento, this.emp()?.departamento));
  readonly opcionesUsuario = computed(() => {
    const e = this.emp();
    const lista = this.cat().usuarios.map(u => ({ id: u.idUsuario, nombre: `${u.nombre} · ${u.correo}` }));
    if (e?.idUsuario && !lista.some(u => u.id === e.idUsuario)) lista.unshift({ id: e.idUsuario, nombre: `${e.usuarioNombre} · ${e.usuarioCorreo}` });
    return lista;
  });

  constructor() {
    this.cargar();
    this.cargarCatalogos();
    this.cargarExtras();
    if (!this.puedeEditar) this.form.disable();
  }

  private conActual(lista: OpcionCatalogo[], id: number | null | undefined, nombre: string | null | undefined): OpcionCatalogo[] {
    return id && !lista.some(x => x.id === id) ? [...lista, { id, nombre: `${nombre} (inactivo)` }] : lista;
  }

  private async cargarExtras(): Promise<void> {
    const visibles = PESTANAS_EMPLEADO.filter(p => (!p.menu || this.global.tieneMenu(p.menu)) && (!p.accion || this.global.tienePermiso(p.accion)));
    const cargadas = await Promise.all(visibles.map(async p => ({ p, componente: await p.componente() })));
    this.extras.set(cargadas);
  }

  cargarCatalogos(): void {
    this.api.getCatalogosEmpleado().subscribe(r => { if (r.status_code === 0) this.cat.set(r.data); });
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.getEmpleado(this.data.idEmpleado).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.banner.set({ tipo: 'bad', texto: r.message }); return; }
        const e = r.data as Empleado;
        this.emp.set(e);
        this.form.reset({
          numeroEmpleado: e.numeroEmpleado, nombre: e.nombre, apellidoPaterno: e.apellidoPaterno, apellidoMaterno: e.apellidoMaterno ?? '',
          telefono: e.telefono ?? '', correo: e.correo ?? '', curp: e.curp ?? '', rfc: e.rfc ?? '', nss: e.nss ?? '',
          fechaNacimiento: e.fechaNacimiento ?? '', idUsuario: e.idUsuario ?? 0,
          idSucursalPrincipal: e.idSucursalPrincipal, idSucursalOperativa: e.idSucursalOperativa,
          idPuesto: e.idPuesto ?? 0, idDepartamento: e.idDepartamento ?? 0
        });
        this.formBaja.reset({ fechaBaja: e.hoy, motivoBaja: '' });
        this.formReingreso.reset({ fechaIngreso: e.hoy });
        if (this.puedePrecio) this.cargarPrecios();
      },
      error: () => { this.cargando.set(false); this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cargarPrecios(): void {
    this.api.getPreciosEmpleado(this.data.idEmpleado).subscribe(r => {
      if (r.status_code !== 0) return;
      this.precios.set(r.data);
      this.formPrecio.reset({ precioHora: '', aPartirDe: r.data.hoy });
    });
  }

  // ── Guardar datos y adscripción ──

  async guardar(): Promise<void> {
    if (this.guardando() || !this.puedeEditar) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ tipo: 'bad', texto: 'Revisa los campos marcados: número, nombre, apellido paterno y sucursales son obligatorios.' });
      return;
    }
    const v = this.form.getRawValue();
    const txt = (s: string) => s.trim() || null;
    const body: EmpleadoGuardar = {
      idEmpleado: this.data.idEmpleado, numeroEmpleado: v.numeroEmpleado.trim(), nombre: v.nombre.trim(),
      apellidoPaterno: v.apellidoPaterno.trim(), apellidoMaterno: txt(v.apellidoMaterno),
      telefono: txt(v.telefono), correo: txt(v.correo), idUsuario: v.idUsuario || null,
      idSucursalPrincipal: v.idSucursalPrincipal, idSucursalOperativa: v.idSucursalOperativa,
      idPuesto: v.idPuesto || null, idDepartamento: v.idDepartamento || null
    };
    // Sin el permiso, los datos personales ni se mandan (y el servidor los ignora).
    if (this.puedeDatosPersonales) Object.assign(body, { curp: txt(v.curp), rfc: txt(v.rfc), nss: txt(v.nss), fechaNacimiento: txt(v.fechaNacimiento) });

    await this.enviar(body);
  }

  private async enviar(body: EmpleadoGuardar): Promise<void> {
    this.guardando.set(true);
    this.aviso.set(null);
    this.confirmarHorario.set(null);
    try {
      const r = await firstValueFrom(this.api.insertUpdateEmpleado(body));
      // 006: cambiar la sucursal principal pregunta qué pasa con su horario (no se guardó nada).
      if (r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_HORARIO') {
        const c = r.data as ConfirmarHorario;
        this.banner.set(null);
        this.confirmarHorario.set({ mensaje: r.message, sucursalNueva: c.sucursalNueva, body });
        return;
      }
      this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message });
      if (r.status_code === 0) {
        this.cambios = true;
        this.aviso.set(r.data?.avisoHorario ?? null);
        if (body.horarioAlCambiarSucursal === 'tomar' && r.data?.plantillaNueva) this.abrirHorarioNuevo(r.data.plantillaNueva);
        this.cargar();
        this.cargarCatalogos();
      }
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible comunicarse con el servidor.' });
    } finally {
      this.guardando.set(false);
    }
  }

  /** Respuesta a "¿Conserva su horario o toma el de la nueva sucursal?"; null = no cambiar la sucursal. */
  decidirHorario(opcion: 'conservar' | 'tomar' | null): void {
    const c = this.confirmarHorario();
    if (!c) return;
    if (!opcion) {
      this.confirmarHorario.set(null);
      const e = this.emp();
      if (e) this.form.controls.idSucursalPrincipal.setValue(e.idSucursalPrincipal);
      this.banner.set({ tipo: 'info', texto: 'No se guardó: la sucursal principal no cambió.' });
      return;
    }
    this.confirmacionPrevia = c.sucursalNueva;
    this.enviar({ ...c.body, horarioAlCambiarSucursal: opcion });
  }

  /** "Toma el de la nueva sucursal": la plantilla va a la pestaña Horario, cargada SIN guardar, para ajustar y confirmar. */
  private abrirHorarioNuevo(plantilla: ResumenHorario): void {
    const sucursal = this.confirmacionPrevia ?? null;
    this.horarioPendiente.poner(this.data.idEmpleado, { plantilla, sucursal });
    const i = this.extras().findIndex(x => x.p.etiqueta === 'Horario');
    if (i < 0) {
      this.aviso.set('Su horario no cambió todavía: para tomar el de la nueva sucursal hay que guardarlo en Horarios (no tienes acceso a la pestaña Horario).');
      return;
    }
    this.pestana.set(2 + i);
    this.aviso.set('Se cargó en la pestaña Horario la plantilla de la nueva sucursal, sin guardar: ajústala y pulsa "Guardar horario". Mientras tanto conserva su horario anterior.');
  }

  /** Alta al vuelo de un puesto o departamento: al cerrar el modal queda escogido. */
  nuevoCatalogo(clave: 'puestos' | 'departamentos'): void {
    const data: CatalogoSimpleModalData = { tipo: tipoCatalogo(clave, this.puestosApi, this.departamentosApi), item: null };
    this.dialog.open(CatalogoSimpleModal, { data, width: '420px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe((g: CatalogoSimpleGuardado) => {
        if (!g) return;
        const k = clave === 'puestos' ? 'puestos' : 'departamentos';
        this.cat.update(c => ({ ...c, [k]: [...c[k].filter(x => x.id !== g.id), { id: g.id, nombre: g.nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre)) }));
        this.form.controls[clave === 'puestos' ? 'idPuesto' : 'idDepartamento'].setValue(g.id);
        this.form.markAsDirty();
      });
  }

  // ── Foto ──

  subirFoto(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.guardando.set(true);
    this.api.setFotoEmpleado(this.data.idEmpleado, archivo).subscribe({
      next: r => {
        this.guardando.set(false);
        this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message });
        if (r.status_code === 0) { this.cambios = true; this.emp.update(e => e && { ...e, bFoto: true }); this.versionFoto.update(n => n + 1); }
      },
      error: () => { this.guardando.set(false); this.banner.set({ tipo: 'bad', texto: 'No fue posible subir la foto.' }); }
    });
  }

  quitarFoto(): void {
    if (!confirm('¿Quitar la foto del empleado?')) return;
    this.api.deleteFotoEmpleado(this.data.idEmpleado).subscribe(r => {
      this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message });
      if (r.status_code === 0) { this.cambios = true; this.emp.update(e => e && { ...e, bFoto: false }); this.versionFoto.update(n => n + 1); }
    });
  }

  // ── Precio por hora ──

  guardarPrecio(): void {
    if (this.formPrecio.invalid) { this.formPrecio.markAllAsTouched(); return; }
    const v = this.formPrecio.getRawValue();
    this.api.setPrecioEmpleado({ idEmpleado: this.data.idEmpleado, precioHora: Number(v.precioHora), aPartirDe: v.aPartirDe }).subscribe(r => {
      this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message });
      if (r.status_code === 0) { this.cambios = true; this.cargarPrecios(); this.cargar(); }
    });
  }

  // ── Baja y reingreso ──

  darBaja(): void {
    const e = this.emp();
    if (!e || this.formBaja.invalid) { this.formBaja.markAllAsTouched(); return; }
    const v = this.formBaja.getRawValue();
    if (!confirm(`¿Dar de baja a ${e.nombreCompleto} con fecha ${fechaCorta(v.fechaBaja)}? Deja de aparecer en el checador y en las listas de activos; su historial se conserva.`)) return;
    this.api.bajaEmpleado({ idEmpleado: e.idEmpleado, fechaBaja: v.fechaBaja, motivoBaja: v.motivoBaja.trim() }).subscribe(r => {
      this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message });
      if (r.status_code === 0) { this.cambios = true; this.cargar(); }
    });
  }

  reingresar(): void {
    const e = this.emp();
    if (!e || this.formReingreso.invalid) { this.formReingreso.markAllAsTouched(); return; }
    const v = this.formReingreso.getRawValue();
    if (!confirm(`¿Reingresar a ${e.nombreCompleto} con fecha ${fechaCorta(v.fechaIngreso)}? Conserva su número, sus datos y sus periodos anteriores.`)) return;
    this.api.reingresoEmpleado({ idEmpleado: e.idEmpleado, fechaIngreso: v.fechaIngreso }).subscribe(r => {
      this.banner.set({ tipo: r.status_code === 0 ? 'ok' : 'bad', texto: r.message });
      if (r.status_code === 0) { this.cambios = true; this.cargar(); }
    });
  }

  /** Aviso en el formulario mientras la principal escogida no es la guardada. */
  cambiaPrincipal(): boolean { const e = this.emp(); return !!e && this.form.controls.idSucursalPrincipal.value !== e.idSucursalPrincipal; }

  cerrar(): void { this.ref.close(this.cambios); }
}
