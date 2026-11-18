import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';

import { HorariosService } from '../../../core/services/horarios.service';
import { AvisoJornada, DiaSemanaCalculado, DiaSemanaHorario, EstadoDia, ResumenHorario } from '../../../models/horarios.models';
import { ETIQUETA_JORNADA } from '../../utils/jornada';

const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

type GrupoDia = FormGroup<{
  estado: FormControl<EstadoDia>;
  entrada: FormControl<string>;
  salida: FormControl<string>;
  comidaMinutos: FormControl<number | null>;
  bComidaDentro: FormControl<boolean>;
}>;

/**
 * Horario semanal (análisis 006 §1 y §2): los siete días con descanso,
 * entrada, salida, minutos de comida y "cuenta dentro de la jornada". Muestra
 * horas por día, tipo de jornada, total semanal y los avisos de máximos, que
 * calcula el servidor (`revisarHorario`, con pausa mientras se escribe). En
 * celular, un día por tarjeta. Con `soloLectura` solo muestra.
 *
 * Lo usan la pestaña Horario de la ficha (horario del empleado) y la pantalla
 * Horarios (plantilla de la sucursal). Quien lo usa lee `valor()` al guardar.
 */
@Component({
  selector: 'app-horario-semanal',
  imports: [ReactiveFormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './horario-semanal.html',
  styleUrl: './horario-semanal.scss'
})
export class HorarioSemanal {
  private readonly api = inject(HorariosService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** El horario de partida, ya calculado por el servidor. Al cambiar, el editor se reinicia. */
  readonly horario = input<ResumenHorario | null>(null);
  readonly soloLectura = input(false);
  /** Cada cambio del usuario, ya en la forma de mandar. */
  readonly cambio = output<DiaSemanaHorario[]>();

  readonly nombres = NOMBRES;
  readonly jornada = ETIQUETA_JORNADA;
  readonly resumen = signal<ResumenHorario | null>(null);
  readonly errores = signal<string[]>([]);
  readonly revisando = signal(false);
  /** Hay cambios sin guardar respecto a `horario`. */
  readonly sucio = signal(false);

  readonly form = this.fb.array<GrupoDia>(NOMBRES.map(() => this.grupo()));
  private readonly estados = signal<EstadoDia[]>(NOMBRES.map(() => 'SIN_HORARIO'));
  private readonly revisar$ = new Subject<DiaSemanaHorario[]>();

  readonly avisos = computed(() => this.resumen()?.avisos ?? []);

  constructor() {
    effect(() => {
      const h = this.horario();
      untracked(() => this.reiniciar(h));
    });
    effect(() => { if (this.soloLectura()) this.form.disable({ emitEvent: false }); else this.form.enable({ emitEvent: false }); });

    const destroy = inject(DestroyRef);
    this.form.valueChanges.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
      if (this.soloLectura()) return;
      this.estados.set(this.form.controls.map(g => g.controls.estado.value));
      const v = this.valor();
      this.sucio.set(true);
      this.revisando.set(true);
      this.cambio.emit(v);
      this.revisar$.next(v);
    });
    this.revisar$.pipe(
      debounceTime(450),
      switchMap(dias => this.api.revisarHorario(dias).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(destroy)
    ).subscribe(r => {
      this.revisando.set(false);
      if (!r) { this.errores.set(['No fue posible revisar el horario con el servidor.']); return; }
      if (r.status_code !== 0) { this.errores.set([r.message]); return; }
      const { errores, ...resumen } = r.data;
      this.resumen.set(resumen);
      this.errores.set(errores ?? []);
    });
  }

  private grupo(): GrupoDia {
    return this.fb.group({
      estado: this.fb.control<EstadoDia>('SIN_HORARIO'),
      entrada: this.fb.control(''),
      salida: this.fb.control(''),
      comidaMinutos: new FormControl<number | null>(0),
      bComidaDentro: this.fb.control(false)
    });
  }

  private reiniciar(h: ResumenHorario | null): void {
    const dias = NOMBRES.map((_, i) => h?.dias.find(d => d.diaSemana === i + 1));
    this.form.reset(dias.map(d => ({
      estado: d?.estado ?? 'SIN_HORARIO',
      entrada: d?.entrada ?? '',
      salida: d?.salida ?? '',
      comidaMinutos: d?.estado === 'LABORABLE' ? d.comidaMinutos : 0,
      bComidaDentro: d?.estado === 'LABORABLE' ? !!d.bComidaDentro : false
    })), { emitEvent: false });
    this.estados.set(this.form.controls.map(g => g.controls.estado.value));
    this.resumen.set(h);
    this.errores.set([]);
    this.sucio.set(false);
    this.revisando.set(false);
  }

  /** Los siete días como los espera el servidor: descanso y sin horario van sin horas ni comida. */
  valor(): DiaSemanaHorario[] {
    return this.form.controls.map((g, i) => {
      const v = g.getRawValue();
      if (v.estado !== 'LABORABLE') return { diaSemana: i + 1, estado: v.estado, entrada: null, salida: null, comidaMinutos: 0, bComidaDentro: false };
      const comida = v.comidaMinutos === null || String(v.comidaMinutos) === '' ? 0 : Number(v.comidaMinutos);
      return { diaSemana: i + 1, estado: 'LABORABLE', entrada: v.entrada || null, salida: v.salida || null, comidaMinutos: comida, bComidaDentro: !!v.bComidaDentro };
    });
  }

  laborable(i: number): boolean { return this.estados()[i] === 'LABORABLE'; }

  calculo(i: number): DiaSemanaCalculado | undefined { return this.resumen()?.dias.find(d => d.diaSemana === i + 1); }

  avisoDia(i: number): AvisoJornada | undefined {
    return this.resumen()?.avisos.find(a => a.tipo === 'DIARIO' && a.diaSemana === i + 1);
  }

  horas(n: number | null | undefined): string { return n === null || n === undefined ? '—' : `${n} h`; }
}
