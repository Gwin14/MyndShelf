import { toast } from "./toast";

let busy: Promise<unknown> | null = null;

/**
 * Os seletores do sistema (arquivos, galeria, câmera) só abrem um por vez:
 * um segundo toque enquanto o primeiro está aberto é ignorado, e falhas viram aviso.
 */
export async function exclusive<T>(open: () => Promise<T>): Promise<T | undefined> {
  if (busy) return undefined;
  const run = open();
  busy = run;
  try {
    return await run;
  } catch (e) {
    toast(e instanceof Error && /in progress/i.test(e.message) ? "Já tem um seletor aberto." : "Não deu para abrir o seletor.");
    return undefined;
  } finally {
    busy = null;
  }
}
