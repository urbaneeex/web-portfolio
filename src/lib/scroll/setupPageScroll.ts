import type { WorkChapterOptions } from "./workChapter";
import { setupWorkChapter } from "./workChapter";

/** Punto de entrada: registra la fase Work enlazada al fin del hero. */
export function setupPageScroll(work: WorkChapterOptions) {
  return setupWorkChapter(work);
}
