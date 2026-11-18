import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { CurrencyPipe } from '@angular/common';

import { AuthService, EntradaSoporte } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  PanelAuthService, PanelEmpresasService, PanelPlanesService, PanelSoporteService
} from '../../../../core/services/panel';
import { ApiResponse } from '../../../../models/common.models';
import { FichaEmpresa, ModuloEmpresa, Plan } from '../../../../models/panel.models';
import { TabsDeslizablesDirective } from '../../../../shared/directives/tabs-deslizables.directive';
import { FechaSucursalPipe } from '../../../../shared/pipes/fecha-sucursal.pipe';
import { FechaNegocioPipe } from '../../../../shared/pipes/fecha-negocio.pipe';
import { AccionModal, AccionModalData } from '../../comun/accion-modal/accion-modal';
import { claseEstado, guardarDescarga, textoEstado, textoMes, textoTamano, textoTipoCobro } from '../../comun/panel-util';
import { EmpresaConstantes } from './empresa-constantes/empresa-constantes';

type Banner = { ok: boolean; texto: string } | null;

const TIPOS_HISTORIAL: Record<string, string> = {
  ALTA: 'Alta', SUSPENSION: 'Suspensión', REACTIVACION: 'Reactivación', BAJA: 'Baja', BAJA_REVERTIDA: 'Baja revertida',
  ELIMINACION: 'Eliminación', PLAN: 'Plan', MODULOS: 'Módulos'
};

/**
 * Panel → Ficha de la empresa (009), con pestañas: Datos (estado y
 * acciones), Plan y uso, Módulos, Constantes e Historial. Suspender,
 * reactivar, revertir y entrar piden motivo; la baja pide escribir el nombre.
 */
@Component({
  selector: 'app-empresa-ficha',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule, MatButtonModule, MatTabsModule, MatTooltipModule, MatDialogModule,
    MatProgressBarModule, MatSnackBarModule, CurrencyPipe, TabsDeslizablesDirective, FechaSucursalPipe, FechaNegocioPipe,
    EmpresaConstantes],
  templateUrl: './empresa-ficha.html',
  styleUrls: ['../../comun/panel.scss', './empresa-ficha.scss']
})
export class EmpresaFicha implements OnInit {
  private readonly api = inject(PanelEmpresasService);
  private readonly planesApi = inject(PanelPlanesService);
  private readonly soporteApi = inject(PanelSoporteService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  readonly panel = inject(PanelAuthService);

  /** De la ruta (withComponentInputBinding). */
  readonly idEmpresa = input.required<string>();
  readonly id = computed(() => Number(this.idEmpresa()));

  readonly ficha = signal<FichaEmpresa | null>(null);
  readonly modulos = signal<ModuloEmpresa[]>([]);
  readonly planes = signal<Plan[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly bannerDatos = signal<Banner>(null);
  readonly bannerPlan = signal<Banner>(null);
  readonly bannerModulos = signal<Banner>(null);
  /** Advertencia de CONFIRMAR_LIMITE: se vuelve a mandar con bConfirmado. */
  readonly confirmarLimite = signal<string | null>(null);

  readonly e = computed(() => this.ficha()?.empresa ?? null);
  readonly eliminada = computed(() => this.e()?.estado === 'ELIMINADA');
  readonly puedeEntrar = computed(() => ['ACTIVA', 'SUSPENDIDA'].includes(this.e()?.estado ?? ''));
  readonly maxUso = computed(() => Math.max(1, ...(this.ficha()?.uso ?? []).map(u => u.maximo ?? 0)));
  readonly modulosCambiados = signal(false);

  readonly textoEstado = textoEstado;
  readonly claseEstado = claseEstado;
  readonly textoTipoCobro = textoTipoCobro;
  readonly textoMes = textoMes;
  readonly textoTamano = textoTamano;
  readonly tipoHistorial = (t: string) => TIPOS_HISTORIAL[t] ?? t;

  readonly datos = this.fb.nonNullable.group({
    nombreComercial: ['', [Validators.required, Validators.maxLength(150)]],
    razonSocial: ['', [Validators.maxLength(250)]],
    rfc: ['', [Validators.maxLength(13)]]
  });
  readonly cambioPlan = this.fb.nonNullable.group({
    idPlan: [0, [Validators.min(1)]],
    fechaInicio: [''],
    precioEspecial: [''],
    motivo: ['', [Validators.maxLength(500)]]
  });

  ngOnInit(): void {
    this.planesApi.getPlanes(true).subscribe(r => { if (r.status_code === 0) this.planes.set(r.data); });
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.getEmpresaById(this.id()).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.error.set(r.message); return; }
        const f = r.data as FichaEmpresa;
        this.ficha.set(f);
        this.error.set(null);
        this.datos.reset({ nombreComercial: f.empresa.nombreComercial, razonSocial: f.empresa.razonSocial ?? '', rfc: f.empresa.rfc ?? '' });
        if (f.empresa.estado === 'ELIMINADA') { this.datos.disable(); this.cambioPlan.disable(); }
      },
      error: () => { this.cargando.set(false); this.error.set('No fue posible consultar la empresa'); }
    });
    this.api.getModulosEmpresa(this.id()).subscribe(r => {
      if (r.status_code === 0) { this.modulos.set(r.data); this.modulosCambiados.set(false); }
    });
  }

  // ── Datos ──
  guardarDatos(): void {
    if (this.guardando() || this.datos.invalid) { this.datos.markAllAsTouched(); return; }
    const v = this.datos.getRawValue();
    this.guardando.set(true);
    this.bannerDatos.set(null);
    this.api.updateEmpresaDatos({ idEmpresa: this.id(), nombreComercial: v.nombreComercial.trim(), razonSocial: v.razonSocial.trim() || null, rfc: v.rfc.trim() || null })
      .subscribe({
        next: r => { this.guardando.set(false); this.bannerDatos.set({ ok: r.status_code === 0, texto: r.message }); if (r.status_code === 0) this.cargar(); },
        error: () => { this.guardando.set(false); this.bannerDatos.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
      });
  }

  private accion(data: Omit<AccionModalData, 'accion'> & { accion: AccionModalData['accion'] }): void {
    this.dialog.open(AccionModal, { data, width: '480px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambio => { if (cambio) this.cargar(); });
  }

  suspender(): void {
    const n = this.e()!.nombreComercial;
    this.accion({ titulo: 'Suspender la empresa', boton: 'Suspender', peligro: true, motivo: true,
      texto: `Nadie de ${n} podrá entrar y sus tabletas y celulares dejarán de checar. Los datos se conservan intactos y se puede reactivar.`,
      accion: m => this.api.suspenderEmpresa(this.id(), m) });
  }

  reactivar(): void {
    this.accion({ titulo: 'Reactivar la empresa', boton: 'Reactivar', motivo: true,
      texto: `${this.e()!.nombreComercial} vuelve a funcionar como estaba: entran sus usuarios y sus dispositivos checan.`,
      accion: m => this.api.reactivarEmpresa(this.id(), m) });
  }

  darDeBaja(): void {
    const n = this.e()!.nombreComercial;
    this.accion({ titulo: 'Dar de baja la empresa', boton: 'Dar de baja', peligro: true, motivo: true,
      confirmar: { texto: n, etiqueta: 'Nombre comercial de la empresa' },
      texto: `Se genera la exportación completa de sus datos y ${n} queda en baja: nadie entra ni checa. Al vencer el periodo de gracia se eliminan sus datos, biometría incluida. Durante el periodo se puede revertir.`,
      accion: (m, c) => this.api.iniciarBaja(this.id(), c, m) });
  }

  revertirBaja(): void {
    this.accion({ titulo: 'Revertir la baja', boton: 'Revertir', motivo: true,
      texto: `${this.e()!.nombreComercial} queda suspendida (no se borra nada). Para que vuelva a funcionar, reactívala después.`,
      accion: m => this.api.revertirBaja(this.id(), m) });
  }

  entrar(): void {
    const data: AccionModalData = {
      titulo: 'Entrar a la empresa', boton: 'Entrar', motivo: true, cerrarConExito: true,
      texto: `Entras a ${this.e()!.nombreComercial} como soporte por un tiempo limitado. La entrada, el motivo y lo que hagas quedan en la bitácora, y la empresa lo ve en su Configuración.`,
      accion: m => this.soporteApi.entrarEmpresa(this.id(), m)
    };
    this.dialog.open(AccionModal, { data, width: '480px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe((r: ApiResponse<EntradaSoporte> | boolean) => {
        if (r && typeof r === 'object' && r.status_code === 0) this.auth.iniciarSoporte(r.data);
      });
  }

  descargar(idExportacion: number): void {
    this.api.descargarExportacion(this.id(), idExportacion).subscribe({
      next: async blob => {
        const error = await guardarDescarga(blob, `exportacion-${this.id()}-${idExportacion}.xlsx`);
        if (error) this.avisos.error(error);
      },
      error: () => this.avisos.error('No fue posible descargar la exportación')
    });
  }

  // ── Plan ──
  asignarPlan(confirmado = false): void {
    if (this.guardando()) return;
    const v = this.cambioPlan.getRawValue();
    if (!v.idPlan) { this.bannerPlan.set({ ok: false, texto: 'Escoge el plan nuevo.' }); return; }
    const precio = String(v.precioEspecial ?? '').trim();
    this.guardando.set(true);
    this.bannerPlan.set(null);
    this.api.setPlanEmpresa({
      idEmpresa: this.id(), idPlan: v.idPlan, fechaInicio: v.fechaInicio || null,
      precioEspecial: precio === '' ? null : Number(precio), motivo: v.motivo.trim() || null, bConfirmado: confirmado
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_LIMITE') { this.confirmarLimite.set(r.message); return; }
        this.confirmarLimite.set(null);
        this.bannerPlan.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) { this.cambioPlan.reset({ idPlan: 0, fechaInicio: '', precioEspecial: '', motivo: '' }); this.cargar(); }
      },
      error: () => { this.guardando.set(false); this.bannerPlan.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  cancelarLimite(): void { this.confirmarLimite.set(null); }

  // ── Módulos ──
  alternarModulo(m: ModuloEmpresa, si: boolean): void {
    this.modulos.update(l => l.map(x => (x.modulo === m.modulo ? { ...x, contratado: si } : x)));
    this.modulosCambiados.set(true);
  }

  guardarModulos(): void {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.bannerModulos.set(null);
    this.api.setModulosEmpresa(this.id(), this.modulos().filter(m => m.contratado).map(m => m.modulo)).subscribe({
      next: r => {
        this.guardando.set(false);
        this.bannerModulos.set({ ok: r.status_code === 0, texto: r.message });
        if (r.status_code === 0) this.cargar();
      },
      error: () => { this.guardando.set(false); this.bannerModulos.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }
}
