import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initDitherGrid } from "../dither-grid/initDitherGrid";
import { CONTACT_SCROLL } from "./scrollConfig";

gsap.registerPlugin(ScrollTrigger);

const CONTACT_IMAGE = "/contact-def.png";

export type ContactChapterOptions = {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
};

/** Contact estático: imagen formada + hover de píxeles. Sin pin ni zoom por scroll. */
export function setupContactChapter({ section, canvas }: ContactChapterOptions) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  section.classList.add("is-contact-active");

  let riseTween: gsap.core.Tween | null = null;

  if (!reduceMotion) {
    riseTween = gsap.fromTo(
      section,
      {
        y: () => (window.innerHeight * CONTACT_SCROLL.riseOffsetVh) / 100,
      },
      {
        y: 0,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: CONTACT_SCROLL.riseScrollEnd,
          scrub: CONTACT_SCROLL.scrub,
          invalidateOnRefresh: true,
        },
      },
    );
  }

  const controller = initDitherGrid({
    canvas,
    imageUrl: CONTACT_IMAGE,
    initialProgress: 1,
    preserveImageAspect: true,
    imageCover: true,
    gridColumns: 300,
    gridRows: 169,
    enableMouseRepel: !reduceMotion,
  });

  return () => {
    riseTween?.scrollTrigger?.kill();
    riseTween?.kill();
    riseTween = null;
    gsap.set(section, { clearProps: "transform" });
    controller.dispose();
    section.classList.remove("is-contact-active");
  };
}
