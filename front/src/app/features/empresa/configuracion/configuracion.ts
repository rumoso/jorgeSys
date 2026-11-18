import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService, ConfiguracionService, NotificationService } from '../../../core/services';
import { AjusteEmpresa, ConfiguracionEmpresa, ValorAjuste } from '../../../models/configuracion.models';
import { CampoDinamico, errorAjuste, textoAjuste } from '../../../shared/components/campo-dinamico/campo-dinamico';
import { FechaSucursalPipe } from '../../../shared/pipes/fecha-sucursal.pipe';
import { AccesosSoporte } from './accesos-soporte/accesos-soporte';

const igual = (a: ValorAjuste, b: ValorAjuste) => JSON.stringify(a === null ? null : String(a)) === JSON.stringify(b === null ? null : String(b));

/**
 * Empresa → Configuración (análisis 003). Las reglas de negocio que el
 * cliente establece para todas sus sucursales. El formulario se dibuja con
 * el catálogo que manda el servidor: un ajuste nuevo aparece solo.
 */
@Component({
  selector: 'app-configuracion',
  imports: [MatIconModule, MatButtonModule, MatProgressBarModule, MatTooltipModule, CampoDinamico, FechaSucursalPipe, AccesosSoporte],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss'
})
export class Configuracion implements OnInit {
  private readonly api = inject(ConfiguracionService);
  private readonly avisos = inject(NotificationService);
  readonly auth = inject(AuthService);

  readonly datos = signal<ConfiguracionEmpresa | null>(null);
  readonly borrador = signal<Record<string, ValorAjuste>>({});
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly texto = textoAjuste;

  /** Los valores generales los cambia quien tiene la acción y todas las sucursales. */
  readonly editable = computed(() => !!this.datos()?.puedeEditar && !!this.datos()?.todasSucursales);
  readonly motivoSoloLectura = computed(() => {
    const d = this.datos();
    if (!d || this.editable()) return null;
    if (!d.puedeEditar) return 'Puedes consultar la configuración, pero no cambiarla: no tienes el permiso "Cambiar la configuración".';
    return 'Los valores generales solo los cambia quien tiene acceso a todas las sucursales. Las excepciones de tus sucursales se cambian en Sucursales.';
  });

  readonly ajustes = computed(() => (this.datos()?.grupos ?? []).flatMap(g => g.ajustes));
  readonly cambiados = computed(() => this.ajustes().filter(a => !igual(this.borrador()[a.clave], a.valor)));
  readonly sinConfirmar = computed(() => this.ajustes().filter(a => !a.bConfirmado));
  readonly hayErrores = computed(() => this.cambiados().some(a => !!errorAjuste(a, this.borrador()[a.clave])));

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.getConfiguracion().subscribe({
      next: r => {
        this.cargando.set(false);
        if (r.status_code !== 0) { this.avisos.error(r.message); return; }
        this.datos.set(r.data);
        this.borrador.set(Object.fromEntries((r.data as ConfiguracionEmpresa).grupos.flatMap(g => g.ajustes).map(a => [a.clave, a.valor])));
      },
      error: () => { this.cargando.set(false); this.avisos.error('No fue posible consultar la configuración'); }
    });
  }

  valor(clave: string): ValorAjuste { return this.borrador()[clave] ?? null; }
  cambiar(clave: string, v: ValorAjuste): void { this.borrador.update(b => ({ ...b, [clave]: v })); }
  cambiado(a: AjusteEmpresa): boolean { return !igual(this.borrador()[a.clave], a.valor); }
  deshacer(): void { this.borrador.set(Object.fromEntries(this.ajustes().map(a => [a.clave, a.valor]))); }

  guardar(): void {
    const lista = this.cambiados();
    if (!lista.length || this.guardando() || !this.editable()) return;
    if (this.hayErrores()) { this.avisos.error('Revisa los valores marcados en rojo'); return; }

    // Antes de guardar: lo que no cambia y lo que no se recalcula.
    const avisos: string[] = [];
    for (const a of lista.filter(x => x.excepciones.length)) {
      avisos.push(`"${a.etiqueta}": estas sucursales tienen su propio valor y NO cambian: `
        + a.excepciones.map(e => `${e.nombre} (${textoAjuste(a, e.valor)})`).join(', ') + '.');
    }
    if (lista.some(a => a.bAdvierteCalculos)) {
      avisos.push('El cambio aplica de ahora en adelante; lo que ya está calculado no se recalcula.');
    }
    if (avisos.length && !confirm(`${avisos.join('\n\n')}\n\n¿Guardar los cambios?`)) return;

    this.guardando.set(true);
    this.api.setConfiguracion(lista.map(a => ({ clave: a.clave, valor: this.borrador()[a.clave] }))).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r.status_code === 0) { this.avisos.success(r.message); this.cargar(); }
        else this.avisos.error(r.message);
      },
      error: () => { this.guardando.set(false); this.avisos.error('No fue posible guardar la configuración'); }
    });
  }

  /** "Valor inicial, revísalo" → aceptarlo tal cual. */
  confirmar(claves: string[]): void {
    if (!claves.length || !this.editable()) return;
    this.api.confirmarConfiguracion(claves).subscribe({
      next: r => {
        if (r.status_code === 0) { this.avisos.success(r.message); this.cargar(); }
        else this.avisos.error(r.message);
      },
      error: () => this.avisos.error('No fue posible confirmar los valores')
    });
  }

  confirmarTodos(): void { this.confirmar(this.sinConfirmar().filter(a => !this.cambiado(a)).map(a => a.clave)); }
}
