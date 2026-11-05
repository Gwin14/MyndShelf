import { requireOptionalNativeModule } from "expo";

/**
 * Drive: a Estante no app Arquivos (iOS, targets/drive) e no gerenciador de
 * arquivos do Android (DriveDocumentsProvider). Some no Expo Go.
 */
interface DriveModule {
  /** guarda endereço e token para a extensão e mostra o "MyndShelf" no sistema */
  enable(url: string, token: string): Promise<void>;
  disable(): Promise<void>;
  /** pede ao sistema que busque o que mudou */
  refresh(): Promise<void>;
}

export const Drive = requireOptionalNativeModule<DriveModule>("MyndShelfDrive");
