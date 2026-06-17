import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getLenis, lenisScrollToY } from "./initLenis";
import { SCROLL_EVENTS, WORK_SCROLL } from "./scrollConfig";
import {
  getHeroScrollEnd,
  getHeroScrollTrigger,
  refreshScrollLayout,
  WORK_TOUR_SCROLL_ID,
} from "./scrollDirector";
import {
  clearPreviewMotionProps,
  createWorkPreviewReveal,
  type WorkPreviewRevealController,
} from "./workPreviewReveal";

gsap.registerPlugin(ScrollTrigger);

export type WorkChapterOptions = {
  section: HTMLElement;
  trackEl: HTMLElement;
  stageEl: HTMLElement;
  items: HTMLButtonElement[];
  previewPanel: HTMLElement;
  previewFrame: HTMLElement;
  previewImage: HTMLImageElement;
  openLink: HTMLAnchorElement;
};

const tourScrollSpan = (projectCount: number) =>
  window.innerHeight *
  (WORK_SCROLL.scrollPerProjectVh * Math.max(1, projectCount)) /
  100;

const mapProgress = (progress: number, start: number, end: number) => {
  if (progress <= start) return 0;
  if (progress >= end) return 1;
  return (progress - start) / Math.max(0.001, end - start);
};

const smoothstep = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const tourProgressFromScroll = (scrollProgress: number) =>
  Math.max(0, Math.min(1, scrollProgress));

const scrollProgressFromTour = (tourProgress: number) =>
  Math.max(0, Math.min(1, tourProgress));

const segmentHoldShare = (index: number) =>
  index === 0
    ? WORK_SCROLL.firstProjectHoldShare
    : WORK_SCROLL.projectHoldShare;

/** Progreso del tour en el centro de la zona estable de un proyecto. */
const tourProgressForProjectIndex = (index: number, count: number) => {
  const clampedIndex = Math.max(0, Math.min(count - 1, index));
  const hold = segmentHoldShare(clampedIndex);
  return (clampedIndex + hold * 0.5) / Math.max(1, count);
};

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

const scrollYForProjectIndex = (index: number, count: number) => {
  const st = ScrollTrigger.getById(WORK_TOUR_SCROLL_ID);
  if (!st || count === 0) return null;

  const progress = scrollProgressFromTour(tourProgressForProjectIndex(index, count));
  return st.start + (st.end - st.start) * progress;
};

let programmaticScrollLock = false;
let programmaticScrollTargetIndex: number | null = null;
let programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null;
let getCurrentProjectIndexHandler: (() => number) | null = null;
let startDirectClickTransitionHandler:
  | ((fromIndex: number, toIndex: number, onComplete: () => void) => void)
  | null = null;
let killDirectClickTransitionHandler: (() => void) | null = null;
let commitPreviewAtIndexHandler: ((index: number) => void) | null = null;
let activateItemImmediateHandler: ((index: number) => void) | null = null;

const clearProgrammaticScrollLock = () => {
  if (programmaticScrollTimer) {
    clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = null;
  }
  killDirectClickTransitionHandler?.();
  programmaticScrollLock = false;
  programmaticScrollTargetIndex = null;
};

const finishProgrammaticClick = (targetIndex: number) => {
  if (!programmaticScrollLock) return;

  if (programmaticScrollTimer) {
    clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = null;
  }

  programmaticScrollLock = false;
  programmaticScrollTargetIndex = null;

  commitPreviewAtIndexHandler?.(targetIndex);
  activateItemImmediateHandler?.(targetIndex);
};

export function scrollToWorkProject(
  index: number,
  items: HTMLButtonElement[],
) {
  const y = scrollYForProjectIndex(index, items.length);
  if (y == null) return;

  const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
  const fromIndex = getCurrentProjectIndexHandler?.() ?? 0;

  clearProgrammaticScrollLock();
  programmaticScrollLock = true;
  programmaticScrollTargetIndex = clampedIndex;

  const finishClick = () => finishProgrammaticClick(clampedIndex);

  programmaticScrollTimer = setTimeout(
    finishClick,
    (WORK_SCROLL.clickScrollDuration + 0.35) * 1000,
  );

  startDirectClickTransitionHandler?.(fromIndex, clampedIndex, finishClick);

  lenisScrollToY(y, {
    duration: WORK_SCROLL.clickScrollDuration,
  });
}

export function setupWorkChapter({
  section,
  trackEl,
  stageEl,
  items,
  previewPanel,
  previewFrame,
  previewImage,
  openLink,
}: WorkChapterOptions) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const count = items.length;
  let tourTrigger: ScrollTrigger | null = null;
  let lastPreviewIndex = -1;
  let activeItemIndex = -1;
  let typewriterTween: gsap.core.Tween | null = null;
  let workRevealed = false;
  /** Evita que el handoff del hero re-muestre Work al volver desde el tour. */
  let handoffSuppressed = false;

  /** Sincroniza preview inicial; asignado tras crear previewReveal. */
  let syncInitialPreview: () => void = () => {};

  const setWorkVisibility = (opacity: number, y: number, entering: boolean) => {
    gsap.set(section, { opacity, y });
    section.classList.toggle("is-work-entering", entering && opacity > 0.04);
    section.classList.toggle("is-work-ready", opacity > 0.18);
  };

  const revealWork = () => {
    workRevealed = true;
    handoffSuppressed = false;
    setWorkVisibility(1, 0, false);
    section.classList.add("is-work-ready");
    syncInitialPreview();
    window.dispatchEvent(new CustomEvent(SCROLL_EVENTS.workReady));
  };

  const hideWork = () => {
    workRevealed = false;
    setWorkVisibility(0, WORK_SCROLL.enterOffsetY, false);
    section.classList.remove("is-work-ready", "is-work-entering");
  };

  const updateHeroHandoff = (heroProgress: number) => {
    if (tourTrigger?.isActive) return;

    if (handoffSuppressed) {
      if (heroProgress < WORK_SCROLL.handoffHeroStart) {
        handoffSuppressed = false;
        hideWork();
      }
      return;
    }

    const scrollY = getLenis()?.scroll ?? window.scrollY ?? 0;
    const heroEnd = getHeroScrollEnd();
    if (heroEnd > 0 && scrollY >= heroEnd - 1) {
      syncInitialPreview();
      return;
    }

    const eased = smoothstep(
      mapProgress(
        heroProgress,
        WORK_SCROLL.handoffHeroStart,
        WORK_SCROLL.handoffHeroEnd,
      ),
    );

    if (eased <= 0) {
      if (!workRevealed) hideWork();
      return;
    }

    setWorkVisibility(eased, WORK_SCROLL.enterOffsetY * (1 - eased), true);

    if (eased > 0.04) {
      syncInitialPreview();
    }

    if (eased >= 0.98) {
      workRevealed = true;
    }
  };

  const resetItem = (item: HTMLButtonElement) => {
    item.classList.remove("is-active", "is-work-hover");
    item.setAttribute("aria-selected", "false");
    const typedEl = item.querySelector<HTMLElement>(".work-item__typed");
    if (typedEl) typedEl.textContent = "";
  };

  const playTypewriter = (item: HTMLButtonElement) => {
    const label = item.dataset.projectTitle ?? "";
    const typedEl = item.querySelector<HTMLElement>(".work-item__typed");
    if (!typedEl) return;

    typewriterTween?.kill();
    typedEl.textContent = "";

    item.classList.add("is-active", "is-work-hover");
    item.setAttribute("aria-selected", "true");

    const state = { chars: 0 };
    typewriterTween = gsap.to(state, {
      chars: label.length,
      duration: WORK_SCROLL.typewriterDuration,
      ease: "power2.out",
      onUpdate: () => {
        typedEl.textContent = label.slice(0, Math.round(state.chars));
      },
      onComplete: () => {
        typedEl.textContent = label;
        typewriterTween = null;
      },
    });
  };

  const applyReducedMotion = () => {
    items.forEach((item, i) => {
      if (i === 0) {
        const label = item.dataset.projectTitle ?? "";
        const typedEl = item.querySelector<HTMLElement>(".work-item__typed");
        item.classList.add("is-active", "is-work-hover");
        item.setAttribute("aria-selected", "true");
        if (typedEl) typedEl.textContent = label;
      } else {
        resetItem(item);
      }
    });

    const first = items[0];
    if (first) {
      previewImage.src = first.dataset.projectImage ?? previewImage.src;
      previewImage.alt = first.dataset.projectAlt ?? "";
      openLink.href = first.dataset.projectHref ?? "#";
      lastPreviewIndex = 0;
    }

    gsap.set(previewImage, { opacity: 1 });
    gsap.set(openLink, { opacity: 1 });
    previewPanel.classList.add("is-preview-visible");
    revealWork();
  };

  if (reduceMotion) {
    applyReducedMotion();
    return () => {};
  }

  const previewReveal: WorkPreviewRevealController =
    createWorkPreviewReveal(previewFrame);

  const updatePanelMeta = (index: number) => {
    const item = items[index];
    if (!item) return;

    const { projectTitle, projectHref, projectAlt, projectId } = item.dataset;
    previewPanel.setAttribute("aria-labelledby", `work-tab-${projectId}`);
    openLink.href = projectHref ?? "#";
    openLink.setAttribute("aria-label", `Open ${projectTitle ?? "project"}`);
    if (projectAlt) openLink.setAttribute("title", projectAlt);
  };

  const showListItemImmediate = (item: HTMLButtonElement) => {
    const label = item.dataset.projectTitle ?? "";
    const typedEl = item.querySelector<HTMLElement>(".work-item__typed");

    typewriterTween?.kill();
    typewriterTween = null;

    item.classList.add("is-active", "is-work-hover");
    item.setAttribute("aria-selected", "true");
    if (typedEl) typedEl.textContent = label;
  };

  const activateListItemImmediate = (index: number) => {
    activeItemIndex = index;

    typewriterTween?.kill();
    typewriterTween = null;

    items.forEach((item, i) => {
      if (i !== index) resetItem(item);
    });

    const item = items[index];
    if (item) showListItemImmediate(item);

    updatePanelMeta(index);
  };

  const commitPreviewAtIndex = (index: number) => {
    const item = items[index];
    if (!item) return;

    const src = item.dataset.projectImage ?? "";
    const alt =
      item.dataset.projectAlt ??
      item.dataset.projectTitle ??
      "Project preview";

    previewReveal.commitProject(previewImage, openLink, src, alt);
    lastPreviewIndex = index;
    previewPanel.classList.add("is-preview-visible");
    gsap.set(openLink, { opacity: 1 });
  };

  const getCurrentProjectIndex = () => {
    if (lastPreviewIndex >= 0) return lastPreviewIndex;
    if (activeItemIndex >= 0) return activeItemIndex;
    return 0;
  };

  let clickTransitionTween: gsap.core.Tween | null = null;

  const killDirectClickTransition = () => {
    clickTransitionTween?.kill();
    clickTransitionTween = null;
  };

  const playDirectClickTransition = (
    fromIndex: number,
    toIndex: number,
    onComplete: () => void,
  ) => {
    killDirectClickTransition();

    const from = Math.max(0, Math.min(count - 1, fromIndex));
    const to = Math.max(0, Math.min(count - 1, toIndex));

    if (from === to) {
      commitPreviewAtIndex(to);
      activateListItemImmediate(to);
      onComplete();
      return;
    }

    commitPreviewAtIndex(from);
    activateListItem(to);

    const state = { t: 0 };

    clickTransitionTween = gsap.to(state, {
      t: 1,
      duration: WORK_SCROLL.clickTransitionDuration,
      ease: "power2.inOut",
      onUpdate: () => {
        applyScrubbedPreview(from, to, state.t);
        previewReveal.tickSymbols();
      },
      onComplete: () => {
        clickTransitionTween = null;
        onComplete();
      },
    });
  };

  const activateListItem = (index: number, force = false) => {
    if (!force && index === activeItemIndex) return;
    activeItemIndex = index;

    typewriterTween?.kill();
    typewriterTween = null;

    items.forEach((item, i) => {
      if (i !== index) resetItem(item);
    });

    const item = items[index];
    if (item) playTypewriter(item);

    updatePanelMeta(index);
  };

  const ensureInitialProject = () => {
    const first = items[0];
    if (!first) return;

    items.forEach((item, i) => {
      if (i !== 0) resetItem(item);
    });

    showListItemImmediate(first);
    activeItemIndex = 0;
    updatePanelMeta(0);

    const src = first.dataset.projectImage ?? "";
    const alt =
      first.dataset.projectAlt ??
      first.dataset.projectTitle ??
      "Project preview";

    previewReveal.commitProject(previewImage, openLink, src, alt);
    lastPreviewIndex = 0;

    previewPanel.classList.add("is-preview-visible");
    gsap.set(openLink, { opacity: 1 });
  };

  syncInitialPreview = ensureInitialProject;

  const applyScrubbedPreview = (
    fromIndex: number,
    toIndex: number,
    localT: number,
  ) => {
    const fromItem = items[fromIndex];
    const toItem = items[toIndex];
    if (!fromItem) return;

    const outgoingSrc = fromItem.dataset.projectImage ?? "";
    const outgoingAlt =
      fromItem.dataset.projectAlt ??
      fromItem.dataset.projectTitle ??
      "Project preview";
    const incomingSrc = toItem?.dataset.projectImage ?? outgoingSrc;
    const incomingAlt =
      toItem?.dataset.projectAlt ??
      toItem?.dataset.projectTitle ??
      outgoingAlt;

    if (fromIndex === toIndex || localT <= 0.001) {
      if (lastPreviewIndex !== fromIndex) {
        previewReveal.commitProject(
          previewImage,
          openLink,
          outgoingSrc,
          outgoingAlt,
        );
        lastPreviewIndex = fromIndex;
      }
      previewPanel.classList.add("is-preview-visible");
      return;
    }

    if (localT >= 0.999) {
      previewReveal.commitProject(
        previewImage,
        openLink,
        incomingSrc,
        incomingAlt,
      );
      lastPreviewIndex = toIndex;
      previewPanel.classList.add("is-preview-visible");
      return;
    }

    lastPreviewIndex = -1;

    previewReveal.setScrubbedTransition({
      outgoingSrc,
      outgoingAlt,
      incomingSrc,
      incomingAlt,
      progress: localT,
    });

    gsap.set(openLink, {
      opacity: Math.max(0.35, Math.min(1, 0.35 + localT * 0.65)),
    });
    previewPanel.classList.add("is-preview-visible");
  };

  const applyTourProgress = (progress: number) => {
    if (count === 0) return;

    const clamped = Math.max(0, Math.min(1, progress));
    const scaled = clamped * count;
    const fromIndex = Math.min(count - 1, Math.max(0, Math.floor(scaled)));
    const toIndex = Math.min(count - 1, fromIndex + 1);
    const segmentT = fromIndex === toIndex ? 0 : scaled - fromIndex;
    const transitionT = segmentTransitionT(fromIndex, toIndex, segmentT);
    const listIndex = transitionT >= 0.5 ? toIndex : fromIndex;

    activateListItem(listIndex);
    applyScrubbedPreview(fromIndex, toIndex, transitionT);
  };

  const syncTrackHeight = () => {
    const span = tourScrollSpan(count);
    trackEl.style.minHeight = `${span + window.innerHeight}px`;
  };

  const destroyTour = () => {
    typewriterTween?.kill();
    typewriterTween = null;
    killDirectClickTransition();
    previewReveal.kill();
    activeItemIndex = -1;
    tourTrigger?.kill();
    tourTrigger = null;
    lastPreviewIndex = -1;
    clearPreviewMotionProps(previewImage, openLink);
    previewPanel.classList.remove("is-preview-visible");
    trackEl.style.removeProperty("min-height");
  };

  const handleTourUpdate = (progress: number) => {
    previewReveal.tickSymbols();

    if (programmaticScrollLock) return;

    const tourP = tourProgressFromScroll(progress);

    if (tourP <= 0.001) {
      ensureInitialProject();
      return;
    }

    applyTourProgress(tourP);
  };

  const createTour = () => {
    const heroST = getHeroScrollTrigger();
    if (!heroST || count === 0) return;

    destroyTour();
    syncTrackHeight();

    tourTrigger = ScrollTrigger.create({
      id: WORK_TOUR_SCROLL_ID,
      trigger: trackEl,
      start: () => getHeroScrollEnd(),
      end: () => getHeroScrollEnd() + tourScrollSpan(count),
      scrub: WORK_SCROLL.scrub,
      invalidateOnRefresh: true,
      onEnter: () => {
        revealWork();
        ensureInitialProject();
      },
      onUpdate: (self) => handleTourUpdate(self.progress),
      onLeave: () => handleTourUpdate(1),
      onEnterBack: (self) => {
        handoffSuppressed = false;
        revealWork();
        handleTourUpdate(self.progress);
      },
      onLeaveBack: () => {
        handoffSuppressed = true;
        activeItemIndex = -1;
        lastPreviewIndex = -1;
        typewriterTween?.kill();
        typewriterTween = null;
        hideWork();
        previewReveal.resetHidden(previewImage, openLink);
      },
    });

    if (tourTrigger.isActive) {
      revealWork();
      handleTourUpdate(tourTrigger.progress);
    } else {
      previewReveal.resetHidden(previewImage, openLink);
    }
  };

  const onHeroProgress = (event: Event) => {
    const detail = (event as CustomEvent<{ progress?: number }>).detail;
    if (detail?.progress == null) return;
    updateHeroHandoff(detail.progress);
  };

  const onHeroComplete = () => {
    handoffSuppressed = false;
    revealWork();
  };

  const onHeroReady = () => {
    createTour();
    refreshScrollLayout();
    syncTrackHeight();

    const heroST = getHeroScrollTrigger();
    if (heroST) {
      updateHeroHandoff(heroST.progress);
      if (heroST.progress >= 0.999) revealWork();
    }
  };

  window.addEventListener(SCROLL_EVENTS.heroComplete, onHeroComplete);
  window.addEventListener(SCROLL_EVENTS.heroZoomChange, onHeroProgress);

  if (getHeroScrollTrigger()) {
    onHeroReady();
  } else {
    window.addEventListener(SCROLL_EVENTS.heroReady, onHeroReady, { once: true });
  }

  section.classList.add("is-scroll-tour-active");
  stageEl.classList.add("is-work-tour-stage");
  getCurrentProjectIndexHandler = getCurrentProjectIndex;
  startDirectClickTransitionHandler = playDirectClickTransition;
  killDirectClickTransitionHandler = killDirectClickTransition;
  activateItemImmediateHandler = activateListItemImmediate;
  commitPreviewAtIndexHandler = commitPreviewAtIndex;

  return () => {
    getCurrentProjectIndexHandler = null;
    startDirectClickTransitionHandler = null;
    killDirectClickTransitionHandler = null;
    activateItemImmediateHandler = null;
    commitPreviewAtIndexHandler = null;
    clearProgrammaticScrollLock();
    handoffSuppressed = false;
    window.removeEventListener(SCROLL_EVENTS.heroComplete, onHeroComplete);
    window.removeEventListener(SCROLL_EVENTS.heroZoomChange, onHeroProgress);
    window.removeEventListener(SCROLL_EVENTS.heroReady, onHeroReady);
    destroyTour();
    previewReveal.destroy();
    gsap.set(section, { clearProps: "opacity,transform" });
    section.classList.remove("is-work-ready", "is-scroll-tour-active");
    stageEl.classList.remove("is-work-tour-stage");
    workRevealed = false;
  };
}
