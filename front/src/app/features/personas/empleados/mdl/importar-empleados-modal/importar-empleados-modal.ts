import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { EmpleadosService } from '../../../../../core/services';
import { ResultadoImportacion, VistaPreviaImportacion } from '../../../../../models/empleados.models';
import { FechaNegocioPipe } from '../../../../../shared/pipes/fecha-negocio.pipe';

type Banner = { tipo: 'ok' | 'bad' | 'info'; texto: string } | null;

/**
 * Alta masiva desde Excel (análisis 004 §6):
 *  1. descargar la plantilla y subir el archivo;
 *  2. vista previa: totales, renglones correctos y con error (con su motivo),
 *     filtro "solo con error" y los catálogos que se crearían;
 *  3. confirmar: carga solo los correctos (el servidor los vuelve a validar).
 */
@Component({
  selector: 'app-importar-empleados-modal',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, MatButtonModule, MatProgressBarModule, FechaNegocioPipe],
  templateUrl: './importar-empleados-modal.html',
  styleUrl: './importar-empleados-modal.scss'
})
export class ImportarEmpleadosModal {
  private readonly api = inject(EmpleadosService);
  private readonly ref = inject(MatDialogRef<ImportarEmpleadosModal, boolean>);

  readonly trabajando = signal(false);
  readonly banner = signal<Banner>(null);
  readonly archivo = signal<File | null>(null);
  readonly vista = signal<VistaPreviaImportacion | null>(null);
  readonly resultado = signal<ResultadoImportacion | null>(null);
  readonly soloError = new FormControl(false, { nonNullable: true });
  readonly crearCatalogos = new FormControl(true, { nonNullable: true });
  private readonly filtro = signal(false);
  private cargados = false;

  readonly renglones = computed(() => {
    const v = this.vista();
    return v ? (this.filtro() ? v.renglones.filter(r => !r.ok) : v.renglones) : [];
  });
  readonly hayCatalogos = computed(() => !!this.vista() && (this.vista()!.seCrearan.puestos.length + this.vista()!.seCrearan.departamentos.length) > 0);

  constructor() {
    this.soloError.valueChanges.subscribe(v => this.filtro.set(v));
  }

  async descargarPlantilla(): Promise<void> {
    this.trabajando.set(true);
    try {
      const blob = await firstValueFrom(this.api.getPlantillaImportacion());
      if (blob.type.includes('json')) {
        const r = JSON.parse(await blob.text());
        this.banner.set({ tipo: 'bad', texto: r.message });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-empleados.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.banner.set({ tipo: 'bad', texto: 'No fue posible descargar la plantilla.' });
    } finally {
      this.trabajando.set(false);
    }
  }

  escoger(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    this.archivo.set(f);
    this.revisar();
  }

  revisar(): void {
    const f = this.archivo();
    if (!f) return;
    this.trabajando.set(true);
    this.vista.set(null);
    this.resultado.set(null);
    this.banner.set(null);
    this.api.previsualizarImportacion(f).subscribe({
      next: r => {
        this.trabajando.set(false);
        if (r.status_code !== 0) { this.banner.set({ tipo: 'bad', texto: r.message }); return; }
        this.vista.set(r.data);
        this.banner.set({ tipo: r.data.conError ? 'info' : 'ok', texto: r.message });
      },
      error: () => { this.trabajando.set(false); this.banner.set({ tipo: 'bad', texto: 'No fue posible revisar el archivo.' }); }
    });
  }

  confirmar(): void {
    const v = this.vista();
    if (!v || !v.correctos || this.trabajando()) return;
    const renglones = v.renglones.filter(r => r.ok).map(r => ({ renglon: r.renglon, datos: r.datos }));
    if (!confirm(`¿Cargar ${renglones.length} empleado(s)? Los ${v.conError} renglón(es) con error no se cargan.`)) return;
    this.trabajando.set(true);
    this.api.importarEmpleados({ renglones, crearCatalogos: this.crearCatalogos.value }).subscribe({
      next: r => {
        this.trabajando.set(false);
        if (r.status_code !== 0) { this.banner.set({ tipo: 'bad', texto: r.message }); return; }
        this.resultado.set(r.data);
        this.vista.set(null);
        this.archivo.set(null);
        this.cargados = r.data.cargados > 0 || this.cargados;
        this.banner.set({ tipo: r.data.rechazados.length ? 'info' : 'ok', texto: r.message });
      },
      error: () => { this.trabajando.set(false); this.banner.set({ tipo: 'bad', texto: 'No fue posible cargar los empleados.' }); }
    });
  }

  otraVez(): void {
    this.resultado.set(null);
    this.banner.set(null);
  }

  cerrar(): void { this.ref.close(this.cargados); }
}
