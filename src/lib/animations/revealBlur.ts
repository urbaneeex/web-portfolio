import { gsap } from "gsap";

/** Revelación blur — aparición palabra a palabra (opacity + blur → nítido). */
export const REVEAL_BLUR_ANIMATION = {
  id: "reveal-blur",
  label: "Revelación blur",
  defaults: {
    blurFrom: 12,
    duration: 1,
    stagger: 0.2,
    ease: "power1.out",
  },
} as const;

export type RevealBlurOptions = {
  blurFrom?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
};

export type RevealBlurState = {
  opacity: number;
  blur: number;
};

/** Estado blur+opacity para una palabra según progreso de scroll (0→1). */
export function revealBlurProgress(
  progress: number,
  start: number,
  end: number,
  blurFrom = REVEAL_BLUR_ANIMATION.defaults.blurFrom,
): RevealBlurState {
  if (progress <= start) {
    return { opacity: 0, blur: blurFrom };
  }
  if (progress >= end) {
    return { opacity: 1, blur: 0 };
  }

  const t = (progress - start) / (end - start);
  const eased = 1 - Math.pow(1 - t, 2.6);

  return {
    opacity: eased,
    blur: blurFrom * (1 - eased),
  };
}

/** Reparte el reveal blur escalonado entre N líneas en un tramo de scroll. */
export function revealBlurStaggerProgress(
  progress: number,
  lineIndex: number,
  lineCount: number,
  rangeStart: number,
  rangeEnd: number,
  blurFrom = REVEAL_BLUR_ANIMATION.defaults.blurFrom,
): RevealBlurState {
  if (lineCount <= 0) {
    return { opacity: 1, blur: 0 };
  }

  const span = Math.max(0.001, rangeEnd - rangeStart);
  const staggerSpread = span * 0.45;
  const lineWindow = span * 0.48;
  const offset =
    lineCount > 1 ? (lineIndex / (lineCount - 1)) * staggerSpread : 0;

  return revealBlurProgress(
    progress,
    rangeStart + offset,
    rangeStart + offset + lineWindow,
    blurFrom,
  );
}

export function revealBlur(
  targets: gsap.TweenTarget,
  options: RevealBlurOptions = {},
): gsap.core.Tween {
  const { blurFrom, duration, stagger, ease } = {
    ...REVEAL_BLUR_ANIMATION.defaults,
    ...options,
  };

  return gsap.fromTo(
    targets,
    { opacity: 0, filter: `blur(${blurFrom}px)` },
    {
      opacity: 1,
      filter: "blur(0px)",
      duration,
      stagger,
      ease,
      onComplete: () => {
        gsap.set(targets, { clearProps: "opacity,filter" });
      },
    },
  );
}
