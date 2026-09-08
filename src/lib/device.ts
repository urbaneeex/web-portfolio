/** Viewport estrecho — simplifica scroll y WebGL en móvil. */
export const isMobileViewport = () =>
  window.matchMedia("(max-width: 767px)").matches;

/** Grid dither hero: equilibrio detalle/rendimiento en móvil (PC usa 400). */
export const MOBILE_HERO_DITHER_GRID = 320;

/** Tope de devicePixelRatio en canvas WebGL móvil. */
export const MOBILE_DITHER_PIXEL_RATIO = 2;
