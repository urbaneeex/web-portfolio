import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { isMobileViewport } from "../device";
import { LENIS_SCROLL, MOBILE_SCROLL } from "./scrollConfig";

let lenis: Lenis | null = null;
let tickerFn: ((time: number) => void) | null = null;

export function initLenis() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || lenis || isMobileViewport()) return lenis;

  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis({
    lerp: LENIS_SCROLL.lerp,
    duration: LENIS_SCROLL.duration,
    smoothWheel: true,
    wheelMultiplier: LENIS_SCROLL.wheelMultiplier,
    touchMultiplier: LENIS_SCROLL.touchMultiplier,
    syncTouch: false,
    anchors: true,
  });

  lenis.on("scroll", ScrollTrigger.update);

  tickerFn = (time: number) => {
    lenis?.raf(time * 1000);
  };
  gsap.ticker.add(tickerFn);
  gsap.ticker.lagSmoothing(0);

  ScrollTrigger.refresh();

  return lenis;
}

export function getLenis() {
  return lenis;
}

/** Misma config al arrancar y al reabrir el scroll tras cerrar el menú. */
export function enableMobileScrollNormalizer() {
  if (!isMobileViewport()) return;
  ScrollTrigger.normalizeScroll({
    allowNestedScroll: true,
    wheelSpeed: MOBILE_SCROLL.wheelSpeed,
    momentum: MOBILE_SCROLL.momentum,
  });
}

export type LenisScrollToOptions = {
  duration?: number;
  immediate?: boolean;
  onComplete?: () => void;
};

/** Scroll suave a una posición Y — sincronizado con ScrollTrigger vía Lenis. */
export function lenisScrollToY(targetY: number, options: LenisScrollToOptions = {}) {
  const { duration = LENIS_SCROLL.scrollToDuration, immediate = false, onComplete } = options;
  const easing = (t: number) => 1 - Math.pow(1 - t, 3);

  if (!lenis) {
    window.scrollTo({ top: targetY, behavior: immediate ? "auto" : "smooth" });
    onComplete?.();
    return;
  }

  const currentY = lenis.scroll;
  if (immediate || Math.abs(currentY - targetY) < 2) {
    lenis.scrollTo(targetY, { immediate: true, lock: false });
    onComplete?.();
    return;
  }

  lenis.scrollTo(targetY, {
    duration,
    immediate: false,
    lock: true,
    easing,
    onComplete,
  });
}

export function destroyLenis() {
  if (tickerFn) {
    gsap.ticker.remove(tickerFn);
    tickerFn = null;
  }
  lenis?.destroy();
  lenis = null;
}
