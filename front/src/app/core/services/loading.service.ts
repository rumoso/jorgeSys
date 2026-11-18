import { Injectable, signal, computed } from '@angular/core';

export interface LoadingState {
  [key: string]: boolean;
}

/**
 * Servicio de loading global con Signals para el sistema POS
 * Controla el estado de carga global y por componente/operación
 */
@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  // Signal para controlar loading global
  private readonly _isGlobalLoading = signal<boolean>(false);

  // Signal para controlar loading por operación específica
  private readonly _loadingStates = signal<LoadingState>({});

  // Computed signals (solo lectura)
  readonly isGlobalLoading = this._isGlobalLoading.asReadonly();
  readonly loadingStates = this._loadingStates.asReadonly();

  // Computed para verificar si hay alguna operación cargando
  readonly hasAnyLoading = computed(() => {
    const states = this._loadingStates();
    return this._isGlobalLoading() || Object.values(states).some(loading => loading);
  });

  /**
   * Activar loading global
   */
  setGlobalLoading(loading: boolean): void {
    this._isGlobalLoading.set(loading);
  }

  /**
   * Activar/desactivar loading para una operación específica
   */
  setLoading(key: string, loading: boolean): void {
    const currentStates = { ...this._loadingStates() };

    if (loading) {
      currentStates[key] = true;
    } else {
      delete currentStates[key];
    }

    this._loadingStates.set(currentStates);
  }

  /**
   * Verificar si una operación específica está cargando
   */
  isLoading(key: string): boolean {
    return this._loadingStates()[key] || false;
  }

  /**
   * Limpiar todos los estados de loading
   */
  clearAllLoading(): void {
    this._isGlobalLoading.set(false);
    this._loadingStates.set({});
  }

  /**
   * Obtener conteo de operaciones activas
   */
  getActiveLoadingCount(): number {
    const states = this._loadingStates();
    const specificCount = Object.values(states).filter(Boolean).length;
    const globalCount = this._isGlobalLoading() ? 1 : 0;
    return specificCount + globalCount;
  }

  /**
   * Wrapper para ejecutar operación con loading automático
   */
  async withLoading<T>(
    operation: () => Promise<T>,
    key: string = 'default'
  ): Promise<T> {
    try {
      this.setLoading(key, true);
      return await operation();
    } finally {
      this.setLoading(key, false);
    }
  }

  /**
   * Wrapper para ejecutar operación con loading global
   */
  async withGlobalLoading<T>(operation: () => Promise<T>): Promise<T> {
    try {
      this.setGlobalLoading(true);
      return await operation();
    } finally {
      this.setGlobalLoading(false);
    }
  }
}
