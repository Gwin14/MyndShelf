import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { captureText } from "../lib/capture";
import { ready } from "../lib/store";
import { toast } from "../lib/toast";

/** myndshelf://save?url=… (ou ?text=…): Atalhos do iOS e outros apps guardam direto na Captura. */
export default function Save() {
  const { url, text } = useLocalSearchParams<{ url?: string; text?: string }>();
  useEffect(() => {
    const input = String(url ?? text ?? "");
    router.replace("/");
    if (!input) return;
    void ready()
      .then(() => captureText(input))
      .then((id) => toast("Guardado na Captura ✦", id ? { label: "Abrir", run: () => router.push(`/capture/${id}`) } : undefined));
  }, [url, text]);
  return null;
}
