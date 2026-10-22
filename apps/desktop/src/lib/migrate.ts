import { hostOf, improveImage, isCodeFile } from "@myndshelf/core";
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

  if (!(await flags.get("code-medium-1"))) {
    await flags.set("code-medium-1");
    // arquivos de código guardados como "texto"/"objeto" viram disquetes
    const { creations, updateCreation } = library.getState();
    for (const c of creations) {
      if (c.medium !== "code" && isCodeFile(c.fileName)) updateCreation(c.id, { medium: "code" });
    }
  }
}
