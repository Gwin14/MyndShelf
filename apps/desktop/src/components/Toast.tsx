import { useToast } from "../lib/toast";

export function ToastHost() {
  const t = useToast((s) => s.toast);
  const dismiss = useToast((s) => s.dismiss);
  if (!t) return null;
  return (
    <div className="toast" key={t.id} role="status">
      <span className="toast-star">✦</span>
      <span>{t.message}</span>
      {t.action && (
        <button
          className="toast-action mono"
          onClick={() => {
            t.action!.run();
            dismiss();
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}
