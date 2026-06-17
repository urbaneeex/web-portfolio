import { ScrollTrigger } from "gsap/ScrollTrigger";

export const HERO_SCROLL_ID = "hero-scroll";
export const WORK_TOUR_SCROLL_ID = "work-scroll-tour";
export const SKILLS_TOUR_SCROLL_ID = "skills-scroll-tour";

export function getHeroScrollTrigger(): ScrollTrigger | undefined {
  return ScrollTrigger.getById(HERO_SCROLL_ID);
}

export function getWorkTourScrollTrigger(): ScrollTrigger | undefined {
  return ScrollTrigger.getById(WORK_TOUR_SCROLL_ID);
}

export function getSkillsTourScrollTrigger(): ScrollTrigger | undefined {
  return ScrollTrigger.getById(SKILLS_TOUR_SCROLL_ID);
}

/** Posición Y (px) donde termina el pin del hero. */
export function getHeroScrollEnd(): number {
  return getHeroScrollTrigger()?.end ?? 0;
}

/** Posición Y (px) donde termina el tour de Work. */
export function getWorkTourEnd(): number {
  return getWorkTourScrollTrigger()?.end ?? getHeroScrollEnd();
}

export function scrollYForTriggerProgress(
  trigger: ScrollTrigger,
  progress: number,
): number {
  const p = Math.max(0, Math.min(1, progress));
  return trigger.start + (trigger.end - trigger.start) * p;
}

export function refreshScrollLayout() {
  ScrollTrigger.refresh();
}
