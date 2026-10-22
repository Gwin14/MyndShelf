import { hostOf, improveImage } from "@myndshelf/core";
import { refreshCapture } from "./capture";
import { flags, library } from "./store";

/** Correções de dados para itens guardados antes de uma melhoria na leitura de metadados. */
export async function migrate() {
  await library.persist.rehydrate();

  if (!(await flags.get("fix-covers-1"))) {
    await flags.set("fix-covers-1");
    const { captures, updateCapture } = library.getState();
    for (const c of captures) {
      // capas do Apple Music com faixas brancas → versão quadrada
      const better = improveImage(c.image);
      if (better && better !== c.image) updateCapture(c.id, { image: better });
      // links da Amazon: relê a página para reconhecer livros, capa e autor
      if (/(^|\.)amazon\./.test(hostOf(c.url))) void refreshCapture(c.id);
    }
  }
}
