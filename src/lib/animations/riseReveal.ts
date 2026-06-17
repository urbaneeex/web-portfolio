/** Revelación ascendente — el contenido sube de abajo arriba al revelarse. */
export const RISE_REVEAL_ANIMATION = {
  id: "rise-reveal",
  label: "Revelación ascendente",
  defaults: {
    distance: 56,
    easePower: 3,
  },
} as const;

export type RiseRevealOptions = {
  distance?: number;
  easePower?: number;
};

export type RiseRevealState = {
  opacity: number;
  y: number;
};

export function riseRevealProgress(
  progress: number,
  start: number,
  end: number,
  options: RiseRevealOptions = {},
): RiseRevealState {
  const { distance, easePower } = {
    ...RISE_REVEAL_ANIMATION.defaults,
    ...options,
  };

  if (progress <= start) return { opacity: 0, y: distance };
  if (progress >= end) return { opacity: 1, y: 0 };

  const t = (progress - start) / (end - start);
  const eased = 1 - Math.pow(1 - t, easePower);

  return {
    opacity: eased,
    y: distance * (1 - eased),
  };
}

/** Parallax por scroll: entra desde abajo, se asienta y sigue subiendo. */
export const SCROLL_PARALLAX_DEFAULTS = {
  distance: 120,
  settleY: 36,
  exitY: -64,
  easePower: 2.35,
} as const;

export type ScrollParallaxOptions = {
  distance?: number;
  settleY?: number;
  exitY?: number;
  easePower?: number;
};

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function scrollParallaxProgress(
  progress: number,
  revealStart: number,
  revealEnd: number,
  driftEnd: number,
  options: ScrollParallaxOptions = {},
): RiseRevealState {
  const { distance, settleY, exitY, easePower } = {
    ...SCROLL_PARALLAX_DEFAULTS,
    ...options,
  };

  if (progress <= revealStart) {
    return { opacity: 0, y: distance };
  }

  if (progress < revealEnd) {
    const t = (progress - revealStart) / (revealEnd - revealStart);
    const eased = 1 - Math.pow(1 - t, easePower);
    return {
      opacity: eased,
      y: distance + (settleY - distance) * eased,
    };
  }

  if (progress < driftEnd) {
    const t = (progress - revealEnd) / (driftEnd - revealEnd);
    return {
      opacity: 1,
      y: settleY + (exitY - settleY) * smoothstep(t),
    };
  }

  return { opacity: 1, y: exitY };
}

/** Sube desde fuera del borde inferior y sigue ascendiendo todo el tramo de scroll. */
export function scrollRiseFromBottom(
  localProgress: number,
  revealStart: number,
  fadeInEnd: number,
  riseEnd: number,
  startY: number,
  endY: number,
  easePower = 2.15,
): RiseRevealState {
  if (localProgress <= revealStart) {
    return { opacity: 0, y: startY };
  }

  const fadeSpan = Math.max(0.001, fadeInEnd - revealStart);
  const opacity = Math.min(1, (localProgress - revealStart) / fadeSpan);

  const riseSpan = Math.max(0.001, riseEnd - revealStart);
  const riseT = Math.min(1, (localProgress - revealStart) / riseSpan);
  const eased = 1 - Math.pow(1 - riseT, easePower);

  return {
    opacity,
    y: startY + (endY - startY) * eased,
  };
}
