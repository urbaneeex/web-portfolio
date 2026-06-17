import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { skillStacks } from "../../data/skills";
import { SKILLS_SCROLL, SCROLL_EVENTS } from "./scrollConfig";
import {
  getWorkTourEnd,
  refreshScrollLayout,
  SKILLS_TOUR_SCROLL_ID,
} from "./scrollDirector";

gsap.registerPlugin(ScrollTrigger);

export type SkillsChapterOptions = {
  section: HTMLElement;
  trackEl: HTMLElement;
  stageEl: HTMLElement;
  labelEl: HTMLElement;
  layers: HTMLElement[];
};

type StackIcon = {
  inner: HTMLElement;
  rotate: string;
  scale: number;
};

const tourScrollSpan = (stackCount: number) =>
  window.innerHeight *
  (SKILLS_SCROLL.scrollPerStackVh * Math.max(1, stackCount)) /
  100;

const mapProgress = (progress: number, start: number, end: number) => {
  if (progress <= start) return 0;
  if (progress >= end) return 1;
  return (progress - start) / Math.max(0.001, end - start);
};

const segmentHoldShare = (index: number) =>
  index === 0
    ? SKILLS_SCROLL.firstStackHoldShare
    : SKILLS_SCROLL.stackHoldShare;

const segmentTransitionT = (
  fromIndex: number,
  toIndex: number,
  segmentT: number,
) => {
  if (fromIndex === toIndex) return 0;

  const hold = segmentHoldShare(fromIndex);
  if (segmentT <= hold) return 0;

  return mapProgress(segmentT, hold, 1);
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.4);
const easeIn = (t: number) => Math.pow(t, 2.15);

/** Primera fase: salida. Segunda fase: entrada con stagger. */
const EXIT_SHARE = 0.42;

export function setupSkillsChapter({
  section,
  trackEl,
  stageEl,
  labelEl,
  layers,
}: SkillsChapterOptions) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const stacks = skillStacks;
  const count = stacks.length;
  let tourTrigger: ScrollTrigger | null = null;
  let entranceTrigger: ScrollTrigger | null = null;
  let activeStackIndex = -1;
  let typewriterTween: gsap.core.Tween | null = null;
  let entranceComplete = false;

  const headerEl = section.querySelector<HTMLElement>(".skills-section__header");

  const stackIcons: StackIcon[][] = layers.map((layer) =>
    [...layer.querySelectorAll<HTMLElement>(".skills-stack__icon")].map((li) => {
      const inner = li.querySelector<HTMLElement>(".skills-stack__icon-inner");
      return {
        inner: inner ?? li,
        rotate: li.style.getPropertyValue("--rotate") || "0deg",
        scale: Number.parseFloat(li.style.getPropertyValue("--scale") || "1"),
      };
    }),
  );

  const showLabelImmediate = (text: string) => {
    typewriterTween?.kill();
    typewriterTween = null;
    labelEl.textContent = text;
  };

  const playLabelTypewriter = (text: string) => {
    typewriterTween?.kill();
    labelEl.textContent = "";

    const state = { chars: 0 };
    typewriterTween = gsap.to(state, {
      chars: text.length,
      duration: SKILLS_SCROLL.labelTypewriterDuration,
      ease: "power2.out",
      onUpdate: () => {
        labelEl.textContent = text.slice(0, Math.round(state.chars));
      },
      onComplete: () => {
        labelEl.textContent = text;
        typewriterTween = null;
      },
    });
  };

  const activateStackLabel = (index: number, force = false) => {
    const label = stacks[index]?.label ?? "";
    if (!force && index === activeStackIndex) return;
    activeStackIndex = index;
    playLabelTypewriter(label);
  };

  const setIconVisual = (
    icon: StackIcon,
    state: {
      opacity: number;
      scaleMul?: number;
      y?: number;
      blur?: number;
    },
  ) => {
    const scaleMul = state.scaleMul ?? 1;
    const y = state.y ?? 0;
    const blur = state.blur ?? 0;

    gsap.set(icon.inner, {
      opacity: state.opacity,
      transform: `rotate(${icon.rotate}) scale(${icon.scale * scaleMul}) translateY(${y}px)`,
      filter: blur > 0.01 ? `blur(${blur}px)` : "none",
    });
  };

  const resetStackIcons = (stackIndex: number) => {
    stackIcons[stackIndex]?.forEach((icon) => {
      gsap.set(icon.inner, { clearProps: "opacity,transform,filter" });
    });
  };

  const setLayerVisibility = (visibleIndex: number) => {
    layers.forEach((layer, i) => {
      layer.classList.remove("is-stack-transitioning");
      gsap.set(layer, { opacity: i === visibleIndex ? 1 : 0 });
    });
  };

  const setSkillsVisibility = (
    opacity: number,
    y: number,
    entering: boolean,
  ) => {
    gsap.set(section, { opacity, y });
    section.classList.toggle("is-skills-entering", entering && opacity > 0.04);
    section.classList.toggle("is-skills-ready", opacity > 0.18);
  };

  const hideSkills = () => {
    entranceComplete = false;
    setSkillsVisibility(0, SKILLS_SCROLL.enterOffsetY, false);
    section.classList.remove("is-skills-ready");
    if (headerEl) gsap.set(headerEl, { opacity: 0, y: 20 });
    gsap.set(labelEl, { opacity: 0, y: 12 });
    layers.forEach((layer, i) => {
      layer.classList.remove("is-stack-transitioning");
      gsap.set(layer, { opacity: i === 0 ? 1 : 0 });
    });
    stackIcons[0]?.forEach((icon) => {
      setIconVisual(icon, { opacity: 0, scaleMul: 0.5, y: 24 });
    });
  };

  const finishEntrance = () => {
    entranceComplete = true;
    setSkillsVisibility(1, 0, false);
    section.classList.add("is-skills-ready");
    layers[0]?.classList.remove("is-stack-transitioning");
    resetStackIcons(0);
    if (headerEl) gsap.set(headerEl, { opacity: 1, y: 0 });
    gsap.set(labelEl, { opacity: 1, y: 0 });
    setLayerVisibility(0);
    showLabelImmediate(stacks[0]?.label ?? "Frontend");
    activeStackIndex = 0;
  };

  const applyEntranceProgress = (progress: number) => {
    const eased = 1 - Math.pow(1 - progress, 2.35);
    setSkillsVisibility(eased, SKILLS_SCROLL.enterOffsetY * (1 - eased), progress < 0.99);

    if (headerEl) {
      const headerT = mapProgress(eased, 0, 0.6);
      gsap.set(headerEl, {
        opacity: headerT,
        y: 22 * (1 - headerT),
      });
    }

    layers[0]?.classList.add("is-stack-transitioning");
    gsap.set(layers[0], { opacity: 1 });
    layers.slice(1).forEach((layer) => gsap.set(layer, { opacity: 0 }));

    const iconEase = mapProgress(eased, 0.18, 1);
    stackIcons[0]?.forEach((icon, i) => {
      const stagger = (i / Math.max(1, stackIcons[0].length - 1)) * 0.36;
      const local = easeIn(
        mapProgress(iconEase, stagger, Math.min(1, stagger + 0.72)),
      );
      setIconVisual(icon, {
        opacity: local,
        scaleMul: 0.54 + local * 0.46,
        y: (1 - local) * 22,
        blur: (1 - local) * 3,
      });
    });

    const labelT = mapProgress(eased, 0.5, 1);
    gsap.set(labelEl, {
      opacity: labelT,
      y: 14 * (1 - labelT),
    });

    if (progress >= 0.99) {
      finishEntrance();
    }
  };

  const applyStackVisual = (
    fromIndex: number,
    toIndex: number,
    transitionT: number,
  ) => {
    if (fromIndex === toIndex || transitionT <= 0.001) {
      layers.forEach((layer) => layer.classList.remove("is-stack-transitioning"));
      setLayerVisibility(fromIndex);
      resetStackIcons(fromIndex);
      if (activeStackIndex !== fromIndex) {
        showLabelImmediate(stacks[fromIndex]?.label ?? "");
        activeStackIndex = fromIndex;
      }
      return;
    }

    if (transitionT >= 0.999) {
      layers.forEach((layer) => layer.classList.remove("is-stack-transitioning"));
      setLayerVisibility(toIndex);
      resetStackIcons(toIndex);
      if (activeStackIndex !== toIndex) {
        activateStackLabel(toIndex, true);
      }
      return;
    }

    layers.forEach((layer, i) => {
      const isActive = i === fromIndex || i === toIndex;
      layer.classList.toggle("is-stack-transitioning", isActive);
      gsap.set(layer, { opacity: isActive ? 1 : 0 });
    });

    const fromIcons = stackIcons[fromIndex] ?? [];
    const toIcons = stackIcons[toIndex] ?? [];

    if (transitionT < EXIT_SHARE) {
      const exitP = easeOut(transitionT / EXIT_SHARE);

      fromIcons.forEach((icon, i) => {
        const stagger = (i / Math.max(1, fromIcons.length - 1)) * 0.3;
        const local = mapProgress(exitP, stagger, Math.min(1, stagger + 0.7));
        setIconVisual(icon, {
          opacity: 1 - local,
          scaleMul: 1 - local * 0.4,
          y: -local * 20,
          blur: local * 6,
        });
      });

      toIcons.forEach((icon) => {
        setIconVisual(icon, { opacity: 0, scaleMul: 0.52, y: 22, blur: 5 });
      });
    } else {
      const enterP = easeIn((transitionT - EXIT_SHARE) / (1 - EXIT_SHARE));

      fromIcons.forEach((icon) => {
        setIconVisual(icon, { opacity: 0, scaleMul: 0.48, y: -16, blur: 6 });
      });

      toIcons.forEach((icon, i) => {
        const stagger = (i / Math.max(1, toIcons.length - 1)) * 0.34;
        const local = mapProgress(enterP, stagger, Math.min(1, stagger + 0.72));
        setIconVisual(icon, {
          opacity: local,
          scaleMul: 0.56 + local * 0.44,
          y: (1 - local) * 26,
          blur: (1 - local) * 4.5,
        });
      });

      if (activeStackIndex !== toIndex) {
        activateStackLabel(toIndex);
      }
    }
  };

  const applyTourProgress = (progress: number) => {
    if (count === 0) return;

    const clamped = Math.max(0, Math.min(1, progress));
    const scaled = clamped * count;
    const fromIndex = Math.min(count - 1, Math.max(0, Math.floor(scaled)));
    const toIndex = Math.min(count - 1, fromIndex + 1);
    const segmentT = fromIndex === toIndex ? 0 : scaled - fromIndex;
    const transitionT = segmentTransitionT(fromIndex, toIndex, segmentT);

    applyStackVisual(fromIndex, toIndex, transitionT);
  };

  const handleTourUpdate = (progress: number) => {
    if (!entranceComplete) return;

    if (progress <= 0.001) {
      ensureInitialStack();
      return;
    }

    applyTourProgress(progress);
  };

  const ensureInitialStack = () => {
    applyStackVisual(0, 0, 0);
    showLabelImmediate(stacks[0]?.label ?? "Frontend");
    activeStackIndex = 0;
  };

  const syncTrackHeight = () => {
    const span = tourScrollSpan(count);
    trackEl.style.minHeight = `${span + window.innerHeight}px`;
  };

  const destroyTour = () => {
    typewriterTween?.kill();
    typewriterTween = null;
    tourTrigger?.kill();
    tourTrigger = null;
    entranceTrigger?.kill();
    entranceTrigger = null;
    activeStackIndex = -1;
    entranceComplete = false;
    trackEl.style.removeProperty("min-height");
    layers.forEach((layer) => layer.classList.remove("is-stack-transitioning"));
    stackIcons.forEach((_, i) => resetStackIcons(i));
    gsap.set(section, { clearProps: "opacity,transform" });
    if (headerEl) gsap.set(headerEl, { clearProps: "opacity,transform" });
    gsap.set(labelEl, { clearProps: "opacity,transform" });
  };

  const createEntrance = () => {
    entranceTrigger?.kill();
    entranceTrigger = ScrollTrigger.create({
      trigger: trackEl,
      start: "top 92%",
      end: "top 52%",
      scrub: SKILLS_SCROLL.entranceScrub,
      invalidateOnRefresh: true,
      onEnter: () => applyEntranceProgress(entranceTrigger?.progress ?? 0),
      onUpdate: (self) => applyEntranceProgress(self.progress),
      onLeave: () => finishEntrance(),
      onEnterBack: (self) => applyEntranceProgress(self.progress),
      onLeaveBack: () => hideSkills(),
    });

    if (entranceTrigger.progress >= 0.99) {
      finishEntrance();
    }
  };

  const applyReducedMotion = () => {
    entranceComplete = true;
    section.classList.add("is-skills-ready");
    gsap.set(section, { opacity: 1, y: 0 });
    showLabelImmediate(stacks[stacks.length - 1]?.label ?? "");
    setLayerVisibility(count - 1);
    resetStackIcons(count - 1);
  };

  if (reduceMotion) {
    applyReducedMotion();
    return () => {};
  }

  const createTour = () => {
    if (count === 0 || getWorkTourEnd() <= 0) return;

    destroyTour();
    syncTrackHeight();
    hideSkills();
    createEntrance();

    tourTrigger = ScrollTrigger.create({
      id: SKILLS_TOUR_SCROLL_ID,
      trigger: trackEl,
      start: () => getWorkTourEnd() + window.innerHeight,
      end: () => getWorkTourEnd() + window.innerHeight + tourScrollSpan(count),
      scrub: SKILLS_SCROLL.scrub,
      invalidateOnRefresh: true,
      onEnter: () => {
        if (entranceComplete) ensureInitialStack();
      },
      onUpdate: (self) => handleTourUpdate(self.progress),
      onLeave: () => handleTourUpdate(1),
      onEnterBack: (self) => handleTourUpdate(self.progress),
      onLeaveBack: () => ensureInitialStack(),
    });

    if (tourTrigger.isActive && entranceComplete) {
      handleTourUpdate(tourTrigger.progress);
    }
  };

  section.classList.add("is-skills-tour-active");
  stageEl.classList.add("is-skills-tour-stage");

  hideSkills();

  const init = () => {
    createTour();
    refreshScrollLayout();
    syncTrackHeight();
    ScrollTrigger.refresh();
  };

  const workSection = document.querySelector<HTMLElement>("[data-work-section]");
  if (workSection?.classList.contains("is-work-ready")) {
    init();
  } else {
    hideSkills();
    window.addEventListener(SCROLL_EVENTS.workReady, init, { once: true });
  }

  window.addEventListener("resize", syncTrackHeight);

  return () => {
    window.removeEventListener("resize", syncTrackHeight);
    destroyTour();
    section.classList.remove("is-skills-tour-active", "is-skills-ready", "is-skills-entering");
    stageEl.classList.remove("is-skills-tour-stage");
  };
}
