type ToastType = 'info' | 'success' | 'warn' | 'error';
type Listener = (toast: Toast) => void;

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

class ToastBus {
  private listeners: Listener[] = [];
  private nextId = 1;

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  push(message: string, type: ToastType = 'info', duration = 3000): void {
    const toast: Toast = { id: this.nextId++, message, type, duration };
    for (const l of this.listeners) l(toast);
  }
}

export const toastBus = new ToastBus();
export const toast = {
  info: (m: string, d?: number) => toastBus.push(m, 'info', d),
  success: (m: string, d?: number) => toastBus.push(m, 'success', d),
  warn: (m: string, d?: number) => toastBus.push(m, 'warn', d),
  error: (m: string, d?: number) => toastBus.push(m, 'error', d)
};
