import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationConfig {
  message: string;
  type: NotificationType;
  duration?: number;
  action?: string;
}

/**
 * Servicio de notificaciones para el sistema POS
 * Usa Angular Material SnackBar para mostrar mensajes al usuario
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  private readonly defaultConfig: MatSnackBarConfig = {
    duration: 4000,
    horizontalPosition: 'end',
    verticalPosition: 'top'
  };

  private readonly typeConfigs: Record<NotificationType, Partial<MatSnackBarConfig>> = {
    success: {
      panelClass: ['notification-success'],
      duration: 3000
    },
    error: {
      panelClass: ['notification-error'],
      duration: 6000
    },
    warning: {
      panelClass: ['notification-warning'],
      duration: 4000
    },
    info: {
      panelClass: ['notification-info'],
      duration: 3000
    }
  };

  /**
   * Mostrar notificación genérica
   */
  show(config: NotificationConfig): void {
    const typeConfig = this.typeConfigs[config.type];
    const snackBarConfig: MatSnackBarConfig = {
      ...this.defaultConfig,
      ...typeConfig,
      duration: config.duration || typeConfig.duration
    };

    this.snackBar.open(config.message, config.action || 'Cerrar', snackBarConfig);
  }

  /**
   * Mostrar notificación de éxito
   */
  success(message: string, duration?: number): void {
    this.show({
      message,
      type: 'success',
      duration,
      action: 'OK'
    });
  }

  /**
   * Mostrar notificación de error
   */
  error(message: string, duration?: number): void {
    this.show({
      message,
      type: 'error',
      duration,
      action: 'Entendido'
    });
  }

  /**
   * Mostrar notificación de advertencia
   */
  warning(message: string, duration?: number): void {
    this.show({
      message,
      type: 'warning',
      duration,
      action: 'Aceptar'
    });
  }

  /**
   * Mostrar notificación informativa
   */
  info(message: string, duration?: number): void {
    this.show({
      message,
      type: 'info',
      duration
    });
  }

  /**
   * Cerrar todas las notificaciones abiertas
   */
  dismissAll(): void {
    this.snackBar.dismiss();
  }
}
