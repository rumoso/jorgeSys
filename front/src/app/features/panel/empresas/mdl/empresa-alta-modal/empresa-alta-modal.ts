import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PanelEmpresasService, PanelPlanesService } from '../../../../../core/services/panel';
import { CatalogosAlta, Plan } from '../../../../../models/panel.models';
import { textoTipoCobro } from '../../../comun/panel-util';

const ZONA_DEFAULT = 'America/Mexico_City';

/**
 * Alta de empresa en un paso (009): empresa, primera sucursal con zona
 * horaria, administrador, módulos y plan. Si la cuenta del administrador es
 * nueva, la contraseña provisional se muestra UNA vez aquí (con botón de
 * copiar) y no se guarda en ningún lado; si ya existía, se avisa.
 */
@Component({
  selector: 'app-empresa-alta-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './empresa-alta-modal.html',
  styleUrl: './empresa-alta-modal.scss'
})
export class EmpresaAltaModal {
  private readonly api = inject(PanelEmpresasService);
  private readonly planesApi = inject(PanelPlanesService);
  private readonly ref = inject(MatDialogRef<EmpresaAltaModal, number | null>);
  private readonly router = inject(Router);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly catalogos = signal<CatalogosAlta>({ zonas: [], modulos: [] });
  readonly planes = signal<Plan[]>([]);
  readonly modulos = signal<Set<string>>(new Set());
  readonly guardando = signal(false);
  readonly banner = signal<{ ok: boolean; texto: string } | null>(null);
  /** Empresa creada: el modal queda de solo lectura con su resultado. */
  readonly idCreada = signal<number | null>(null);
  /** Solo en memoria de este modal: se pierde al cerrarlo. */
  readonly password = signal<string | null>(null);
  readonly copiado = signal(false);
  readonly textoTipoCobro = textoTipoCobro;

  readonly form = inject(FormBuilder).nonNullable.group({
    nombreComercial: ['', [Validators.required, Validators.maxLength(150)]],
    razonSocial: ['', [Validators.maxLength(250)]],
    rfc: ['', [Validators.maxLength(13)]],
    sucursal: ['Matriz', [Validators.required, Validators.maxLength(100)]],
    zonaHoraria: [ZONA_DEFAULT, [Validators.required]],
    correoAdmin: ['', [Validators.required, Validators.email]],
    nombreAdmin: [''],
    idPlan: [0, [Validators.min(1)]],
    precioEspecial: ['']
  });

  constructor() {
    this.api.getCatalogosAlta().subscribe(r => {
      if (r.status_code !== 0) { this.banner.set({ ok: false, texto: r.message }); return; }
      this.catalogos.set(r.data);
      // Sin escoger, quedan todos los módulos disponibles (lo mismo que hace el servidor).
      this.modulos.set(new Set((r.data as CatalogosAlta).modulos.map(m => m.modulo)));
    });
    this.planesApi.getPlanes(true).subscribe(r => {
      if (r.status_code !== 0) return;
      this.planes.set(r.data);
      if (!this.form.controls.idPlan.value && r.data.length) this.form.controls.idPlan.setValue(r.data[0].idPlan);
    });
  }

  alternarModulo(m: string, si: boolean): void {
    this.modulos.update(s => { const n = new Set(s); if (si) n.add(m); else n.delete(m); return n; });
  }

  guardar(): void {
    if (this.guardando() || this.idCreada()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.banner.set({ ok: false, texto: 'Escribe el nombre comercial, la sucursal, el correo del administrador y escoge la zona y el plan.' });
      return;
    }
    const v = this.form.getRawValue();
    const precio = String(v.precioEspecial ?? '').trim();
    this.guardando.set(true);
    this.banner.set(null);
    this.api.insertEmpresa({
      nombreComercial: v.nombreComercial.trim(), razonSocial: v.razonSocial.trim() || null, rfc: v.rfc.trim() || null,
      sucursal: v.sucursal.trim(), zonaHoraria: v.zonaHoraria, correoAdmin: v.correoAdmin.trim(), nombreAdmin: v.nombreAdmin.trim() || null,
      modulos: [...this.modulos()], idPlan: v.idPlan, precioEspecial: precio === '' ? null : Number(precio)
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        this.banner.set({ ok: r.status_code === 0, texto: r.message });
        // El mensaje (y la contraseña) van arriba: que se vean aunque el formulario esté desplazado.
        setTimeout(() => this.el.nativeElement.querySelector('.rh-dialog-body')?.scrollTo({ top: 0 }));
        if (r.status_code !== 0) return;
        this.idCreada.set(r.data.id);
        this.password.set(r.data.cuentaCreada ? r.data.passwordProvisional : null);
        this.form.disable();
      },
      error: () => { this.guardando.set(false); this.banner.set({ ok: false, texto: 'No fue posible comunicarse con el servidor.' }); }
    });
  }

  async copiar(): Promise<void> {
    const p = this.password();
    if (!p) return;
    try { await navigator.clipboard.writeText(p); this.copiado.set(true); }
    catch { this.copiado.set(false); }
  }

  verFicha(): void {
    const id = this.idCreada();
    this.password.set(null);
    this.ref.close(id);
    if (id) this.router.navigate(['/panel/empresas', id]);
  }

  cerrar(): void {
    this.password.set(null);
    this.ref.close(this.idCreada());
  }
}
