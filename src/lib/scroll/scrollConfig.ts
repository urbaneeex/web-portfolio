/**
 * Scroll nativo del viewport móvil (sin Lenis).
 * La rueda a 1 va el doble de rápido que escritorio (Lenis 0.48).
 * La inercia por defecto de GSAP dura 2.8s y se come secciones enteras.
 */
export const MOBILE_SCROLL = {
  wheelSpeed: 0.46,
  momentum: 1.35,
} as const;

/** Lenis — scroll suave global (más bajo lerp / wheel = más lento). */
export const LENIS_SCROLL = {
  lerp: 0.042,
  duration: 2.35,
  wheelMultiplier: 0.48,
  touchMultiplier: 1.05,
  scrollToDuration: 3.6,
} as const;

/** Constantes compartidas del timeline de scroll (hero → work). */
export const HERO_SCROLL = {
  pinEnd: "+=175%",
  scrub: 1.15,
  zoomPhaseEnd: 0.5,
  introEnterEnd: 0.72,
  introExitEnd: 0.92,
  clickTargetProgress: 0.58,
  clickStartMax: 0.025,
  clickDuration: 3.4,
  /** Progreso del pin donde About está legible (nav). */
  aboutNavProgress: 0.62,
} as const;

export const WORK_SCROLL = {
  /** Compensa altura del hero en el pin-spacer (margin-top en Work). */
  overlapVh: 100,
  /** Progreso hero donde Work empieza a asomarse (solapa salida About). */
  handoffHeroStart: 0.8,
  /** Progreso hero donde Work ya es plenamente visible. */
  handoffHeroEnd: 0.97,
  /** Desplazamiento inicial al entrar Work (px). */
  enterOffsetY: 56,
  scrollPerProjectVh: 34,
  /** Duración del typewriter al cambiar de proyecto (no ligado al scroll). */
  typewriterDuration: 0.32,
  /** Fracción inicial de cada tramo con imagen estable (sin grid). */
  projectHoldShare: 0.45,
  /** Hold extra en Arkapp (primer proyecto). */
  firstProjectHoldShare: 0.55,
  /** Primer tramo del tour reservado a la entrada de la preview. */
  previewEnterShare: 0.1,
  scrub: 0.38,
  /** Duración del scroll al hacer click en un proyecto. */
  clickScrollDuration: 1.75,
  /** Duración de la transición grid directa al clicar (origen → destino). */
  clickTransitionDuration: 1.75,
} as const;

export const SKILLS_SCROLL = {
  scrollPerStackVh: 40,
  stackHoldShare: 0.45,
  firstStackHoldShare: 0.55,
  labelTypewriterDuration: 0.32,
  scrub: 0.38,
  enterOffsetY: 52,
  entranceScrub: 0.45,
} as const;

export const CONTACT_SCROLL = {
  /** Desplazamiento inicial al entrar (vh). */
  riseOffsetVh: 16,
  /** Fin del scrub cuando el borde superior llega aquí. */
  riseScrollEnd: "top 22%",
  scrub: 0.55,
} as const;

export const SCROLL_EVENTS = {
  heroReady: "hero-scroll-ready",
  heroComplete: "hero-scroll-complete",
  workReady: "work-section-ready",
  heroZoomChange: "hero-zoom-change",
} as const;
