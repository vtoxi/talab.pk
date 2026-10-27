import { Injectable, inject, signal } from '@angular/core';
import { I18n } from './i18n.service';

export interface ConfirmModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  icon?: string;
}

export interface AlertModalOptions {
  title?: string;
  message: string;
  buttonText?: string;
  icon?: string;
}

export interface ActiveModalState {
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  icon: string;
  resolve: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  private i18n = inject(I18n);
  active = signal<ActiveModalState | null>(null);

  confirm(options: ConfirmModalOptions): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.active.set({
        type: 'confirm',
        title: options.title ?? this.i18n.t('Are you sure?'),
        message: options.message,
        confirmText: options.confirmText ?? this.i18n.t('Confirm'),
        cancelText: options.cancelText ?? this.i18n.t('Cancel'),
        danger: options.danger ?? false,
        icon: options.icon ?? (options.danger ? '⚠️' : '❓'),
        resolve,
      });
    });
  }

  alert(options: AlertModalOptions): Promise<void> {
    return new Promise<void>(resolve => {
      this.active.set({
        type: 'alert',
        title: options.title ?? this.i18n.t('Notice'),
        message: options.message,
        confirmText: options.buttonText ?? this.i18n.t('OK'),
        cancelText: '',
        danger: false,
        icon: options.icon ?? 'ℹ️',
        resolve: () => resolve(),
      });
    });
  }

  respond(confirmed: boolean) {
    const current = this.active();
    if (!current) return;
    this.active.set(null);
    current.resolve(confirmed);
  }
}
