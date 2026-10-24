import { create } from "zustand";

/** A nebulosa desliza um pouco a cada seção, como no desktop. */
export const useCosmos = create<{ shift: number; setShift(n: number): void }>((set) => ({
  shift: 0,
  setShift: (shift) => set({ shift }),
}));
