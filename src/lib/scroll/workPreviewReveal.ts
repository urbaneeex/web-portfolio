import { gsap } from "gsap";
import { WorkPreviewGrid } from "./workPreviewGrid";

export type ScrubbedTransition = {
  outgoingSrc: string;
  outgoingAlt: string;
  incomingSrc: string;
  incomingAlt: string;
  progress: number;
};

export type WorkPreviewRevealController = {
  setScrubbedTransition: (options: ScrubbedTransition) => void;
  commitProject: (
    image: HTMLImageElement,
    link: HTMLElement,
    src: string,
    alt: string,
  ) => void;
  resetHidden: (image: HTMLElement, link: HTMLElement) => void;
  setRevealed: (image: HTMLElement, link: HTMLElement) => void;
  tickSymbols: () => void;
  kill: () => void;
  destroy: () => void;
};

export function createWorkPreviewReveal(
  frame: HTMLElement,
): WorkPreviewRevealController {
  const grid = new WorkPreviewGrid(frame);
  const outgoingImage = frame.querySelector<HTMLImageElement>(
    "[data-work-preview-image]",
  );

  const incomingImage = document.createElement("img");
  incomingImage.className = "work-preview__image work-preview__image--incoming";
  incomingImage.setAttribute("data-work-preview-image-incoming", "");
  incomingImage.decoding = "async";
  incomingImage.hidden = true;
  incomingImage.alt = "";

  if (outgoingImage) {
    outgoingImage.classList.add("work-preview__image--outgoing");
    frame.insertBefore(incomingImage, outgoingImage);
  } else {
    frame.prepend(incomingImage);
  }

  let scrubSegmentKey = "";

  const clearOutgoingMask = (image: HTMLElement) => {
    gsap.set(image, {
      clearProps:
        "clipPath,maskImage,webkitMaskImage,maskSize,webkitMaskSize,maskRepeat,webkitMaskRepeat",
    });
  };

  const hideIncoming = () => {
    incomingImage.hidden = true;
    clearOutgoingMask(incomingImage);
  };

  const setTransitionMode = (active: boolean) => {
    outgoingImage?.classList.toggle("is-transitioning", active);
    incomingImage.classList.toggle("is-transitioning", active);
  };

  const applyTransitionFrame = (frameData: { outgoingMask: string } | null) => {
    if (!outgoingImage) return;

    gsap.set(incomingImage, {
      opacity: 1,
      scale: 1,
      filter: "none",
      clearProps: "clipPath",
    });

    if (!frameData) {
      clearOutgoingMask(outgoingImage);
      gsap.set(outgoingImage, { opacity: 1, scale: 1, filter: "none" });
      return;
    }

    const mask = `url("${frameData.outgoingMask}")`;
    gsap.set(outgoingImage, {
      opacity: 1,
      scale: 1,
      filter: "none",
      maskImage: mask,
      webkitMaskImage: mask,
      maskSize: "100% 100%",
      webkitMaskSize: "100% 100%",
      maskRepeat: "no-repeat",
      webkitMaskRepeat: "no-repeat",
      clearProps: "clipPath",
    });
  };

  const ensureImageSrc = (
    image: HTMLImageElement,
    src: string,
    alt: string,
  ) => {
    if (image.getAttribute("src") !== src) {
      image.src = src;
    }
    image.alt = alt;
  };

  return {
    setScrubbedTransition: ({
      outgoingSrc,
      outgoingAlt,
      incomingSrc,
      incomingAlt,
      progress,
    }) => {
      if (!outgoingImage) return;

      const segmentKey = `${outgoingSrc}→${incomingSrc}`;
      if (segmentKey !== scrubSegmentKey) {
        scrubSegmentKey = segmentKey;
        grid.rollBandWidth();
        grid.refreshBandNoise();
      }

      ensureImageSrc(outgoingImage, outgoingSrc, outgoingAlt);
      ensureImageSrc(incomingImage, incomingSrc, incomingAlt);

      const t = Math.max(0, Math.min(1, progress));

      if (t <= 0.001) {
        grid.kill();
        grid.revealFully();
        hideIncoming();
        setTransitionMode(false);
        applyTransitionFrame(null);
        return;
      }

      if (t >= 0.999) {
        grid.kill();
        grid.revealFully();
        hideIncoming();
        setTransitionMode(false);
        outgoingImage.src = incomingSrc;
        outgoingImage.alt = incomingAlt;
        applyTransitionFrame(null);
        return;
      }

      setTransitionMode(true);
      incomingImage.hidden = false;
      grid.startShuffleLoop();

      const frameData = grid.applyTransitionProgress(t, true);
      applyTransitionFrame(frameData);
    },

    commitProject: (image, link, src, alt) => {
      grid.kill();
      grid.revealFully();
      hideIncoming();
      setTransitionMode(false);
      scrubSegmentKey = "";
      image.src = src;
      image.alt = alt;
      applyTransitionFrame(null);
      gsap.set(link, { opacity: 1 });
    },

    resetHidden: (image, link) => {
      grid.kill();
      grid.coverFully();
      hideIncoming();
      setTransitionMode(false);
      scrubSegmentKey = "";
      gsap.set(image, {
        opacity: 1,
        scale: 1,
        filter: "none",
        clipPath: "inset(0 0 100% 0)",
      });
      gsap.set(link, { opacity: 0 });
    },

    setRevealed: (image, link) => {
      grid.kill();
      grid.revealFully();
      hideIncoming();
      setTransitionMode(false);
      scrubSegmentKey = "";
      applyTransitionFrame(null);
      gsap.set(link, { opacity: 1 });
    },

    tickSymbols: () => grid.tickSymbols(),

    kill: () => {
      grid.kill();
      hideIncoming();
      setTransitionMode(false);
      if (outgoingImage) clearOutgoingMask(outgoingImage);
    },

    destroy: () => {
      grid.destroy();
      incomingImage.remove();
      outgoingImage?.classList.remove(
        "work-preview__image--outgoing",
        "is-transitioning",
      );
    },
  };
}

export function clearPreviewMotionProps(
  image: HTMLElement,
  link: HTMLElement,
) {
  gsap.set(image, {
    clearProps:
      "opacity,transform,filter,clipPath,maskImage,webkitMaskImage,maskSize,webkitMaskSize,maskRepeat,webkitMaskRepeat",
  });
  gsap.set(link, { clearProps: "opacity" });
}
