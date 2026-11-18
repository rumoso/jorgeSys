import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { GlobalService } from './global.service';
import { MarcajesService } from './marcajes.service';

/**
 * Cuántos marcajes esperan revisión (análisis 005), para el contador del menú
 * (lateral y barra inferior). Como GlobalService, es la excepción a los
 * servicios pass-through: guarda un número para pintar. Lo refresca el marco
 * cada minuto y la pantalla Por revisar al aprobar o rechazar.
 */
@Injectable({ providedIn: 'root' })
export class ContadorRevisarService {
  private readonly api = inject(MarcajesService);
  private readonly global = inject(GlobalService);

  readonly total = signal(0);

  async refrescar(): Promise<void> {
    if (!this.global.tieneMenu('por_revisar')) { this.total.set(0); return; }
    try {
      const r = await firstValueFrom(this.api.getContadorPorRevisar());
      if (r.status_code === 0) this.total.set(Number(r.data?.total) || 0);
    } catch { /* sin conexión: se queda el último */ }
  }
}
