import * as Haptics from "expo-haptics";

/** Toques leves: confirmam sem chamar atenção. */
export const tap = () => void Haptics.selectionAsync().catch(() => {});
export const press = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const warn = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
