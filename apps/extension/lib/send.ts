import { browser } from "#imports";
import type { Message } from "../entrypoints/background";
import type { SaveResult } from "./queue";

/** Pede ao background: ele segue trabalhando mesmo se o popup fechar. */
export function send(msg: Extract<Message, { type: "save" }>): Promise<SaveResult>;
export function send(msg: Extract<Message, { type: "flush" }>): Promise<number>;
export function send(msg: Message): Promise<unknown> {
  return browser.runtime.sendMessage(msg);
}
