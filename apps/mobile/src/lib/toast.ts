import { create } from "zustand";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run(): void };
}

interface ToastState {
  toast: Toast | null;
  show(message: string, action?: Toast["action"], ms?: number): void;
  dismiss(): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  toast: null,
  show(message, action, ms = 4500) {
    clearTimeout(timer);
    const id = Date.now();
    set({ toast: { id, message, action } });
    timer = setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), ms);
  },
  dismiss: () => set({ toast: null }),
}));

export const toast = (message: string, action?: Toast["action"], ms?: number) => useToast.getState().show(message, action, ms);
