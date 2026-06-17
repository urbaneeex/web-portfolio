import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HERO_SCROLL, SCROLL_EVENTS } from "./scrollConfig";
import {
  getHeroScrollTrigger,
  HERO_SCROLL_ID,
  scrollYForTriggerProgress,
} from "./scrollDirector";
import { lenisScrollToY } from "./initLenis";

export const ABOUT_SECTION_PROGRESS = HERO_SCROLL.aboutNavProgress;

export function scrollToAboutSection(duration = 2.65) {
  const st = ScrollTrigger.getById(HERO_SCROLL_ID);
  if (!st) {
    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  lenisScrollToY(scrollYForTriggerProgress(st, ABOUT_SECTION_PROGRESS), {
    duration,
  });
}

export function scrollToWorkSection() {
  const heroST = getHeroScrollTrigger();
  if (!heroST) {
    document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  lenisScrollToY(heroST.end, { duration: 3.2 });
}

export function setupAboutNavLinks() {
  document.querySelectorAll<HTMLAnchorElement>('a[href="#about"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToAboutSection();
    });
  });
}

export function setupWorkNavLinks() {
  document.querySelectorAll<HTMLAnchorElement>('a[href="#work"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToWorkSection();
    });
  });
}

/** Registra enlaces de nav que dependen del timeline de scroll. */
export function setupScrollNavLinks() {
  setupAboutNavLinks();
  setupWorkNavLinks();
}
