import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PageTitleService {
  readonly icon        = signal('');
  readonly title       = signal('');
  readonly desc        = signal('');
  readonly sectionName = signal('');   // Nombre de la sección padre (vacío = estás en la sección misma)
  readonly sectionId   = signal<number | null>(null);
  private readonly _backRouteOverride = signal('');

  /** backRouteOverride tiene prioridad; si no está, se calcula desde sectionId */
  readonly backRoute = computed(() => this._backRouteOverride());

  /** Usar en dashboards de sección */
  set(icon: string, title: string, desc: string): void {
    this.icon.set(icon);
    this.title.set(title);
    this.desc.set(desc);
    this.sectionName.set('');
  }

  /** Usar en componentes hijos: agrega el nombre de la sección para el breadcrumb */
  setWithSection(icon: string, title: string, desc: string, section: string): void {
    this.icon.set(icon);
    this.title.set(title);
    this.desc.set(desc);
    this.sectionName.set(section);
  }

  setSectionId(id: number): void {
    this.sectionId.set(id);
  }

  setBackRoute(route: string): void {
    this._backRouteOverride.set(route);
  }

  clear(): void {
    this.icon.set('');
    this.title.set('');
    this.desc.set('');
    this.sectionName.set('');
    this._backRouteOverride.set('');
    // sectionId NO se limpia: persiste para el botón volver si el usuario navega internamente
  }
}
