import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService, ContadorRevisarService, GlobalService, MarcajesService, NotificationService } from '../../../core/services';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { MarcajePorRevisar } from '../../../models/checador.models';
import { RechazoModal, RechazoModalData } from './mdl';

const RESULTADOS_FACEID: Record<string, string> = {
  IDENTIFICADO: 'Reconocido',
  CONFIRMADO_CON_NUMERO: 'Confirmado con su número',
  DUDA_NO_RESUELTA: 'Duda entre dos; escribió el número de otra persona',
  SOLO_NUMERO: 'Checó con su número sin ser reconocido'
};

/**
 * Checador → Por revisar (análisis 005 §4): los marcajes dudosos con su
 * evidencia. Aprobar, o rechazar con motivo; rechazar no borra (LP-2).
 * Las horas se muestran en la zona de la sucursal del marcaje.
 */
@Component({
  selector: 'app-por-revisar',
  imports: [ReactiveFormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDialogModule, MatProgressBarModule,
    MatSnackBarModule, FechaSucursalPipe],
  templateUrl: './por-revisar.html',
  styleUrl: './por-revisar.scss'
})
export class PorRevisar implements OnInit, OnDestroy {
  private readonly api = inject(MarcajesService);
  private readonly dialog = inject(MatDialog);
  private readonly avisos = inject(NotificationService);
  private readonly contador = inject(ContadorRevisarService);
  readonly auth = inject(AuthService);
  readonly global = inject(GlobalService);

  readonly lista = signal<MarcajePorRevisar[]>([]);
  readonly fotos = signal<Record<number, string>>({});
  readonly cargando = signal(false);
  readonly ocupado = signal<number | null>(null);
  readonly sucursal = new FormControl<number | null>(this.auth.sucursalActiva());
  readonly estado = new FormControl<'pendientes' | 'revisados'>('pendientes', { nonNullable: true });
  readonly puedeRevisar = this.global.tienePermiso('marcajes_Revisar');
  readonly zonasMixtas = () => new Set(this.lista().map(m => m.zonaHoraria)).size > 1;

  ngOnInit(): void { this.buscar(); }
  ngOnDestroy(): void { this.liberarFotos(); }

  buscar(): void {
    this.cargando.set(true);
    this.api.getPorRevisar(this.estado.value, this.sucursal.value).subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.liberarFotos();
        this.lista.set(r.data);
        for (const m of r.data as MarcajePorRevisar[]) if (m.tieneFoto) this.cargarFoto(m.idMarcaje);
        void this.contador.refrescar();
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar los marcajes por revisar'); }
    });
  }

  /** La foto viaja con la sesión (x-token): se pide como Blob y se muestra con una URL local. */
  private cargarFoto(idMarcaje: number): void {
    this.api.getFotoEvidencia(idMarcaje).subscribe({
      next: b => { if (b.type.startsWith('image/')) this.fotos.update(f => ({ ...f, [idMarcaje]: URL.createObjectURL(b) })); },
      error: () => { /* sin foto */ }
    });
  }

  private liberarFotos(): void {
    for (const url of Object.values(this.fotos())) URL.revokeObjectURL(url);
    this.fotos.set({});
  }

  textoFaceid(m: MarcajePorRevisar): string { return m.faceid ? (RESULTADOS_FACEID[m.faceid.resultado] ?? m.faceid.resultado) : ''; }
  porcentaje(n: number | null | undefined): string { return n === null || n === undefined ? '' : `${Math.round(n * 100)}%`; }

  aprobar(m: MarcajePorRevisar): void {
    if (!confirm(`¿Aprobar el marcaje de ${m.empleado}? Queda como aceptado.`)) return;
    this.ocupado.set(m.idMarcaje);
    this.api.aprobarMarcaje(m.idMarcaje).subscribe({
      next: r => {
        this.ocupado.set(null);
        if (r.status_code === 0) { this.avisos.success(r.message); this.buscar(); } else this.avisos.error(r.message);
      },
      error: () => { this.ocupado.set(null); this.avisos.error('No fue posible comunicarse con el servidor'); }
    });
  }

  rechazar(m: MarcajePorRevisar): void {
    const data: RechazoModalData = { marcaje: m };
    this.dialog.open(RechazoModal, { data, width: '460px', panelClass: 'rh-dialog-panel', disableClose: true, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(cambios => { if (cambios) this.buscar(); });
  }
}
