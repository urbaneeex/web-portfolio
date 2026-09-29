import * as THREE from "three";
import { createTimeline, animate } from "animejs";
import { isMobileViewport, MOBILE_DITHER_PIXEL_RATIO } from "../device";
import { Grid } from "./Grid";

export type DitherGridOptions = {
  canvas: HTMLCanvasElement;
  imageUrl?: string;
  /** Progreso visual inicial: 0 = zoom in, 1 = imagen formada. Hero usa 1. */
  initialProgress?: number;
  /**
   * Grid con ratio de la imagen (sin scaleX). Usar en imágenes landscape como Contact.
   */
  preserveImageAspect?: boolean;
  /** Con preserveImageAspect: rellena el viewport (cover) sin bandas laterales. */
  imageCover?: boolean;
  gridColumns?: number;
  gridRows?: number;
  onAnimationComplete?: () => void;
  /** Activa el efecto de repulsión del ratón sobre las celdas. */
  enableMouseRepel?: boolean;
  /** Radio del alboroto. El contacto usa el valor por defecto. */
  mouseRadius?: number;
  /** Empuje de los píxeles. El contacto usa el valor por defecto. */
  mouseStrength?: number;
  /** El hero escucha este evento. Las demás instancias no deben emitirlo. */
  emitReadyEvent?: boolean;
  /** El blanco del dither no se pinta, para dejar ver la cuadrícula de la página. */
  clearBackground?: boolean;
  /** La figura y el fondo se pintan con letras que van cambiando. */
  glyphField?: boolean;
};

export function initDitherGrid(options: DitherGridOptions) {
  const {
    canvas,
    imageUrl = "/dithering-object.jpg",
    initialProgress = 1,
    preserveImageAspect = false,
    imageCover = false,
    gridColumns = 400,
    gridRows = preserveImageAspect ? 225 : 400,
    onAnimationComplete,
    enableMouseRepel = false,
    mouseRadius = 11,
    mouseStrength = 8,
    emitReadyEvent = true,
    clearBackground = false,
    glyphField = false,
  } = options;

  const scene = new THREE.Scene();
  if (!clearBackground) scene.background = new THREE.Color("#ffffff");

  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);
  camera.near = 1;
  camera.far = 2000;

  const cameraAnchor = new THREE.Group();
  cameraAnchor.name = "cameraAnchor";
  cameraAnchor.add(camera);
  scene.add(cameraAnchor);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: clearBackground,
      antialias: !isMobileViewport(),
      powerPreference: isMobileViewport() ? "low-power" : "high-performance",
    });
    if (clearBackground) renderer.setClearColor(0x000000, 0);
  } catch {
    canvas.classList.add("is-ready");
    onAnimationComplete?.();
    if (emitReadyEvent) {
      window.dispatchEvent(new CustomEvent("dither-animation-complete"));
    }
    return {
      setScrollZoom: () => {},
      setScrollZoomIn: () => {},
      setFigureWave: () => {},
      dispose: () => {},
    };
  }

  const FINAL_ZOOM = 0.9;
  const INITIAL_ZOOM = 70;
  const INITIAL_DITHER = 0.04;
  /** Escala UI de zoom (igual que el indicador en Hero) */
  const ZOOM_UI_MIN = 9;
  const ZOOM_UI_MAX = 100;
  const ZOOM_UI_DITHER_THRESHOLD = 60;
  /** Dither mínimo con zoom UI < 60 vs >= 60 */
  const SCROLL_DITHER_MIN_ABOVE_60 = 0.75;
  const SCROLL_DITHER_MIN_FROM_60 = 0.04;
  let onImageReady: (() => void) | undefined;

  const imageGrid = new Grid({
    name: "image-grid",
    rows: gridRows,
    columns: gridColumns,
    cellSize: 1,
    cellThickness: 0.5,
    spacing: 1,
    gridType: 1,
    cellColor: "#AAAAAA",
    image: imageUrl,
    activeThresholdMapId: "voidAndCluster",
    onImageLoad: () => onImageReady?.(),
  });
  imageGrid.showAt(scene);

  camera.zoom = FINAL_ZOOM;
  camera.updateProjectionMatrix();
  cameraAnchor.position.set(0, 0, 0);
  cameraAnchor.rotation.set(0, 0, 0);

  imageGrid.material.uniforms.uDitherProgress.value = 1;
  imageGrid.material.uniforms.uMouseRadius.value = mouseRadius;
  imageGrid.material.uniforms.uMouseStrength.value = mouseStrength;
  imageGrid.material.uniforms.uClearBackground.value = clearBackground ? 1 : 0;
  if (clearBackground) {
    imageGrid.material.transparent = true;
    imageGrid.material.depthWrite = false;
  }
  imageGrid.material.uniforms.uGridOffsetStart.value = 0;
  imageGrid.material.uniforms.uGridOffsetEnd.value = 0.35;

  let isPlaying = false;
  let didNotifyComplete = false;
  let textureReady = false;
  let savedProgress = 1;

  let viewAspect = 1;
  let timeline!: ReturnType<typeof createTimeline>;

  const gridHalfW = (gridColumns - 1) / 2;
  const gridHalfH = (gridRows - 1) / 2;
  const GRID_SIZE = Math.max(gridColumns, gridRows);

  const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  /** 0 = encuadre original (inmersivo), 1 = fit 100% al final */
  const getFitBlend = (progress: number) => smoothstep(0.5, 0.88, progress);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const getContainFrustum = (aspect: number) => {
    const h = GRID_SIZE / 2;
    if (aspect < 1) {
      return { left: -h, right: h, top: h / aspect, bottom: -h / aspect };
    }
    return { left: -h * aspect, right: h * aspect, top: h, bottom: -h };
  };

  const getContentBoundsInCameraSpace = () => {
    const halfW = gridHalfW;
    const halfH = gridHalfH;
    const corners = [
      new THREE.Vector3(-halfW, -halfH, 0),
      new THREE.Vector3(halfW, -halfH, 0),
      new THREE.Vector3(-halfW, halfH, 0),
      new THREE.Vector3(halfW, halfH, 0),
    ];

    imageGrid.group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const corner of corners) {
      const p = corner.clone().applyMatrix4(imageGrid.group.matrixWorld);
      p.applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      contentW: maxX - minX,
      contentH: maxY - minY,
    };
  };

  /**
   * Punto de la foto que cae en el centro de la pantalla.
   * Más alto = el retrato se desplaza a la izquierda (la cara se separa del borde).
   */
  const PORTRAIT_CENTER_X = 0.47;
  /** >1 aleja la cámara. 1 llena la altura. */
  const PORTRAIT_ZOOM_OUT = 1.32;
  /** Fracción de pantalla sobre la foto. 1 - 1/zoom pega el borde inferior a la pantalla. */
  const PORTRAIT_TOP_INSET = 1 - 1 / PORTRAIT_ZOOM_OUT;

  const uvGridAspect = gridColumns / Math.max(gridRows, 1);

  /**
   * Reposo en vertical: proporción real, torso a ras del borde inferior,
   * cara con aire a la derecha.
   */
  const portraitRestFrame = (
    cx: number,
    cy: number,
    contentW: number,
    contentH: number,
    zoom: number,
  ) => {
    const texAspect = Math.max(
      imageGrid.material.uniforms.uTextureAspect.value || 1,
      0.001,
    );
    const cropW = Math.min(1, uvGridAspect / texAspect);
    const cropX0 = (1 - cropW) / 2;
    const stCenter = (PORTRAIT_CENTER_X - cropX0) / cropW;

    const visibleH = contentH * PORTRAIT_ZOOM_OUT;
    const visibleW = visibleH * Math.max(viewAspect, 0.001);
    const focusX = cx + (stCenter - 0.5) * contentW;
    const imageTop = cy + contentH / 2;
    const focusY = imageTop + PORTRAIT_TOP_INSET * visibleH - visibleH / 2;
    const halfW = (visibleW * zoom) / 2;
    const halfH = (visibleH * zoom) / 2;

    return {
      focusX,
      focusY,
      left: focusX - halfW,
      right: focusX + halfW,
      top: focusY + halfH,
      bottom: focusY - halfH,
    };
  };

  const applyCoverFrustum = (
    cx: number,
    cy: number,
    contentW: number,
    contentH: number,
    zoom: number,
  ) => {
    const coverW = Math.max(contentW, contentH * viewAspect);
    const coverH = coverW / viewAspect;
    const endHalfW = (coverW * zoom) / 2;
    const endHalfH = (coverH * zoom) / 2;
    return {
      left: cx - endHalfW,
      right: cx + endHalfW,
      top: cy + endHalfH,
      bottom: cy - endHalfH,
    };
  };

  const applyFrustumFitAspectPreserve = (fitBlend: number) => {
    imageGrid.group.scale.set(1, 1, 1);

    const { cx, cy, contentW, contentH } = getContentBoundsInCameraSpace();
    const zoom = Math.max(camera.zoom, 0.001);
    const gridAspect = contentW / Math.max(contentH, 0.001);

    const visibleFraction = Math.max(FINAL_ZOOM / zoom, 0.004);
    const startHalfW = (contentW * visibleFraction) / 2;
    const startHalfH = (contentH * visibleFraction) / 2;

    let endHalfW: number;
    let endHalfH: number;

    if (viewAspect >= gridAspect) {
      if (imageCover) {
        endHalfW = (contentW * zoom) / 2;
        endHalfH = endHalfW / viewAspect;
      } else {
        endHalfH = (contentH * zoom) / 2;
        endHalfW = endHalfH * viewAspect;
      }
    } else {
      if (imageCover) {
        endHalfH = (contentH * zoom) / 2;
        endHalfW = endHalfH * viewAspect;
      } else {
        endHalfW = (contentW * zoom) / 2;
        endHalfH = endHalfW / viewAspect;
      }
    }

    const halfW = lerp(startHalfW, endHalfW, fitBlend);
    const halfH = lerp(startHalfH, endHalfH, fitBlend);

    camera.left = cx - halfW;
    camera.right = cx + halfW;
    camera.top = cy + halfH;
    camera.bottom = cy - halfH;
    camera.updateProjectionMatrix();
  };

  const applyFrustumFit = (fitBlend: number) => {
    if (preserveImageAspect) {
      imageGrid.material.uniforms.uAspectCover.value = 0;
      applyFrustumFitAspectPreserve(fitBlend);
      return;
    }

    // En vertical, recortar la foto sin estirarla. En horizontal se conserva el encuadre de escritorio.
    imageGrid.material.uniforms.uAspectCover.value = viewAspect < 1 ? 1 : 0;

    const scaleX =
      viewAspect >= 1 ? lerp(1, viewAspect, fitBlend) : 1;
    imageGrid.group.scale.set(scaleX, 1, 1);

    const { cx, cy, contentW, contentH } = getContentBoundsInCameraSpace();
    const zoom = Math.max(camera.zoom, 0.001);

    const contain = getContainFrustum(viewAspect);
    const containHalfW = (contain.right - contain.left) / 2;
    const containHalfH = (contain.top - contain.bottom) / 2;

    let startLeft: number;
    let startRight: number;
    let startTop: number;
    let startBottom: number;

    let endLeft: number;
    let endRight: number;
    let endTop: number;
    let endBottom: number;

    if (viewAspect < 1) {
      const rest = portraitRestFrame(cx, cy, contentW, contentH, zoom);
      const startHalf = Math.max(contentW, contentH) / 2;
      startLeft = rest.focusX - startHalf;
      startRight = rest.focusX + startHalf;
      startTop = rest.focusY + startHalf / viewAspect;
      startBottom = rest.focusY - startHalf / viewAspect;
      ({ left: endLeft, right: endRight, top: endTop, bottom: endBottom } = rest);
    } else {
      startLeft = cx - containHalfW;
      startRight = cx + containHalfW;
      startTop = cy + containHalfH;
      startBottom = cy - containHalfH;
      ({ left: endLeft, right: endRight, top: endTop, bottom: endBottom } =
        applyCoverFrustum(cx, cy, contentW, contentH, zoom));
    }

    camera.left = lerp(startLeft, endLeft, fitBlend);
    camera.right = lerp(startRight, endRight, fitBlend);
    camera.top = lerp(startTop, endTop, fitBlend);
    camera.bottom = lerp(startBottom, endBottom, fitBlend);
    camera.updateProjectionMatrix();
  };

  const notifyCompleteOnce = () => {
    if (didNotifyComplete) return;
    didNotifyComplete = true;
    onAnimationComplete?.();
    if (emitReadyEvent) {
      window.dispatchEvent(new CustomEvent("dither-animation-complete"));
    }
  };

  const drawFrame = (p: number) => {
    applyFrustumFit(getFitBlend(p));
    renderer.render(scene, camera);
  };

  const progressToZoomUi = (p: number) => {
    const zoomOut = 1 - Math.max(0, Math.min(1, p));
    return zoomOut * (ZOOM_UI_MAX - ZOOM_UI_MIN) + ZOOM_UI_MIN;
  };

  const getScrollDitherMin = (p: number) => {
    const zoomUi = progressToZoomUi(p);
    return zoomUi >= ZOOM_UI_DITHER_THRESHOLD
      ? SCROLL_DITHER_MIN_FROM_60
      : SCROLL_DITHER_MIN_ABOVE_60;
  };

  /** Dither al alejar: suave hasta zoom 60, luego puede bajar a 0.3 */
  const getScrollDither = (p: number) => {
    const zoomOut = 1 - Math.max(0, Math.min(1, p));
    const t = zoomOut * zoomOut * (3 - 2 * zoomOut);
    return lerp(1, getScrollDitherMin(p), t);
  };

  /** p: 0 = zoom alejado, 1 = imagen formada */
  const applyVisualProgress = (iterationProgress: number, animateDither = false) => {
    const p = Math.max(0, Math.min(1, iterationProgress));
    savedProgress = p;
    isPlaying = false;
    timeline.pause();
    if (animateDither) {
      timeline.seek(p * timeline.iterationDuration, true);
    }
    camera.zoom = lerp(INITIAL_ZOOM, FINAL_ZOOM, p);
    camera.updateProjectionMatrix();
    imageGrid.material.uniforms.uDitherProgress.value = animateDither
      ? lerp(INITIAL_DITHER, 1, p)
      : getScrollDither(p);
    if (textureReady) drawFrame(p);
  };

  const applyTimelineProgress = (iterationProgress: number) => {
    applyVisualProgress(iterationProgress, true);
  };

  const revealScene = () => {
    if (textureReady) return;
    if (!imageGrid.material.uniforms.uTexture.value) return;
    textureReady = true;
    applyTimelineProgress(savedProgress);
    canvas.classList.add("is-ready");
    notifyCompleteOnce();
  };

  const renderFrame = () => {
    if (!textureReady) return;
    drawFrame(savedProgress);
  };

  let figureCenterX = 0;
  let figureCenterY = 0;
  let figureMeasured = false;
  let figureMeasureKey = "";
  let contourTexture: THREE.DataTexture | null = null;

  const coverSt = (
    stX: number,
    stY: number,
    srcAspect: number,
    dstAspect: number,
    aspectCover: boolean,
  ) => {
    let x = stX;
    let y = stY;
    if (srcAspect > dstAspect) {
      const scale = dstAspect / srcAspect;
      const fit = aspectCover ? scale : 1 / scale;
      x = (x - 0.5) * fit + 0.5;
    } else {
      const scale = srcAspect / dstAspect;
      const fit = aspectCover ? scale : 1 / scale;
      y = (y - 0.5) * fit + 0.5;
    }
    return { x, y };
  };

  /** Centro y tamaño de la silueta oscura, en el espacio de la rejilla. */
  const measureFigure = () => {
    const aspectCover = viewAspect < 1 && !preserveImageAspect;
    const key = `${viewAspect.toFixed(3)}:${aspectCover ? 1 : 0}`;
    if (figureMeasured && key === figureMeasureKey) return;

    const tex = imageGrid.material.uniforms.uTexture.value as THREE.Texture | null;
    const img = tex?.image as HTMLImageElement | undefined;
    if (!img?.width || !img?.height) return;

    const sample = 180;
    const probe = document.createElement("canvas");
    probe.width = sample;
    probe.height = sample;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, sample, sample);
    const pixels = ctx.getImageData(0, 0, sample, sample).data;

    const srcAspect = img.width / img.height;
    const dstAspect = gridColumns / Math.max(gridRows, 1);
    const count = gridColumns * gridRows;
    const lum = new Float32Array(count);
    const at = (col: number, row: number) => {
      const stX = col / (gridColumns - 1);
      const stY = (gridRows - 1 - row) / (gridRows - 1);
      const uv = coverSt(stX, stY, srcAspect, dstAspect, aspectCover);
      if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return 1;
      const px = Math.min(sample - 1, Math.max(0, Math.floor(uv.x * (sample - 1))));
      const py = Math.min(sample - 1, Math.max(0, Math.floor((1 - uv.y) * (sample - 1))));
      const i = (py * sample + px) * 4;
      return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255);
    };

    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let row = 0; row < gridRows; row += 1) {
      for (let col = 0; col < gridColumns; col += 1) {
        const value = at(col, row);
        lum[row * gridColumns + col] = value;
        if (value > 0.42) continue;
        sx += col - (gridColumns - 1) / 2;
        sy += -row + (gridRows - 1) / 2;
        n += 1;
      }
    }
    if (n < 8) return;

    const outside = new Uint8Array(count);
    const stack: number[] = [];
    const pushBg = (col: number, row: number) => {
      if (col < 0 || row < 0 || col >= gridColumns || row >= gridRows) return;
      const i = row * gridColumns + col;
      if (outside[i] || lum[i] < 0.88) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let col = 0; col < gridColumns; col += 1) {
      pushBg(col, 0);
      pushBg(col, gridRows - 1);
    }
    for (let row = 0; row < gridRows; row += 1) {
      pushBg(0, row);
      pushBg(gridColumns - 1, row);
    }
    while (stack.length) {
      const i = stack.pop() as number;
      const col = i % gridColumns;
      const row = (i - col) / gridColumns;
      pushBg(col + 1, row);
      pushBg(col - 1, row);
      pushBg(col, row + 1);
      pushBg(col, row - 1);
    }

    const data = new Uint8Array(count * 4);
    const write = (col: number, row: number, weight: number, nx: number, ny: number) => {
      if (col < 0 || row < 0 || col >= gridColumns || row >= gridRows) return;
      if (lum[row * gridColumns + col] > 0.42) return;
      const len = Math.hypot(nx, ny);
      if (len < 0.001) return;
      const stY = (gridRows - 1 - row) / (gridRows - 1);
      const iy = Math.round(stY * (gridRows - 1));
      const p = (iy * gridColumns + col) * 4;
      const next = Math.round(weight * 255);
      if (data[p] >= next) return;
      data[p] = next;
      data[p + 1] = Math.round((nx / len * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round((ny / len * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    };

    for (let row = 0; row < gridRows; row += 1) {
      for (let col = 0; col < gridColumns; col += 1) {
        const i = row * gridColumns + col;
        if (lum[i] > 0.42) continue;
        let nx = 0;
        let ny = 0;
        if (col + 1 < gridColumns && outside[i + 1]) nx += 1;
        if (col > 0 && outside[i - 1]) nx -= 1;
        if (row > 0 && outside[i - gridColumns]) ny += 1;
        if (row + 1 < gridRows && outside[i + gridColumns]) ny -= 1;
        if (nx === 0 && ny === 0) continue;
        write(col, row, 1, nx, ny);
        write(col + 1, row, 0.45, nx, ny);
        write(col - 1, row, 0.45, nx, ny);
        write(col, row - 1, 0.45, nx, ny);
        write(col, row + 1, 0.45, nx, ny);
      }
    }

    contourTexture?.dispose();
    contourTexture = new THREE.DataTexture(data, gridColumns, gridRows, THREE.RGBAFormat);
    contourTexture.flipY = false;
    contourTexture.magFilter = THREE.LinearFilter;
    contourTexture.minFilter = THREE.LinearFilter;
    contourTexture.wrapS = THREE.ClampToEdgeWrapping;
    contourTexture.wrapT = THREE.ClampToEdgeWrapping;
    contourTexture.colorSpace = THREE.NoColorSpace;
    contourTexture.needsUpdate = true;
    imageGrid.material.uniforms.uContour.value = contourTexture;

    figureCenterX = sx / n;
    figureCenterY = sy / n;
    figureMeasured = true;
    figureMeasureKey = key;
  };

  /** Onda suave que recorre el contorno. t 0 = empieza, 1 = da la vuelta. */
  const setFigureWave = (t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    measureFigure();
    const uniforms = imageGrid.material.uniforms;
    const scaleX = imageGrid.group.scale.x || 1;
    const scaleY = imageGrid.group.scale.y || 1;
    uniforms.uWaveCenter.value.set(figureCenterX * scaleX, figureCenterY * scaleY);
    uniforms.uWaveTravel.value = clamped;
    uniforms.uWaveActive.value = Math.sin(clamped * Math.PI);
  };

  /** scroll 0 = imagen formada, scroll 1 = zoom in (hero) */
  const setScrollZoom = (scrollProgress: number) => {
    applyVisualProgress(1 - Math.max(0, Math.min(1, scrollProgress)), false);
  };

  /** scroll 0 = zoom in, scroll 1 = imagen formada (contact, inverso del hero) */
  const setScrollZoomIn = (scrollProgress: number) => {
    applyVisualProgress(Math.max(0, Math.min(1, scrollProgress)), false);
  };

  timeline = createTimeline({
    onUpdate: () => {
      renderFrame();
    },
    onComplete: () => {
      const fromPlayback = isPlaying;
      isPlaying = false;
      renderFrame();
      if (fromPlayback) notifyCompleteOnce();
    },
  });

  const updateDitherProgress = animate(imageGrid.material.uniforms.uDitherProgress, {
    value: 1,
    from: { value: INITIAL_DITHER },
    duration: 10000,
    ease: "linear",
  });
  timeline.sync(updateDitherProgress, 0);

  const zoomOut = animate(camera, {
    zoom: FINAL_ZOOM,
    from: { zoom: INITIAL_ZOOM },
    duration: 14000,
    onUpdate: () => {
      camera.updateProjectionMatrix();
    },
    ease: "inOutSine",
  });
  timeline.sync(zoomOut, 0);
  timeline.pause();
  const clampedInitial = Math.max(0, Math.min(1, initialProgress));
  applyTimelineProgress(clampedInitial);

  onImageReady = () => revealScene();

  const resize = (width: number, height: number, pixelRatio: number) => {
    viewAspect = width / height;
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      Math.min(pixelRatio, isMobileViewport() ? MOBILE_DITHER_PIXEL_RATIO : 2),
    );
    if (textureReady && !isPlaying) applyVisualProgress(savedProgress, false);
  };

  const onResize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    resize(width, height, window.devicePixelRatio);
  };

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(canvas);
  onResize();
  if (imageGrid.material.uniforms.uTexture.value) {
    revealScene();
  }

  let glyphTexture: THREE.CanvasTexture | null = null;
  let glyphRaf = 0;

  const paintGlyphAtlas = () => {
    const cols = 8;
    const rows = 4;
    const cell = 64;
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, cols * rows);
    const atlas = document.createElement("canvas");
    atlas.width = cols * cell;
    atlas.height = rows * cell;
    const ctx = atlas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, atlas.width, atlas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.floor(cell * 0.72)}px "Aux Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < chars.length; i += 1) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      ctx.fillText(chars[i], c * cell + cell / 2, r * cell + cell / 2 + 2);
    }
    glyphTexture?.dispose();
    glyphTexture = new THREE.CanvasTexture(atlas);
    glyphTexture.colorSpace = THREE.NoColorSpace;
    glyphTexture.flipY = true;
    glyphTexture.minFilter = THREE.LinearFilter;
    glyphTexture.magFilter = THREE.LinearFilter;
    glyphTexture.generateMipmaps = false;
    glyphTexture.needsUpdate = true;
    const uniforms = imageGrid.material.uniforms;
    uniforms.uGlyphs.value = glyphTexture;
    uniforms.uGlyphCount.value = chars.length;
    uniforms.uGlyphGrid.value.set(cols, rows);
    uniforms.uGlyphMode.value = 1;
    if (textureReady) drawFrame(savedProgress);
  };

  const tickGlyphs = (now: number) => {
    imageGrid.material.uniforms.uGlyphTime.value = now * 0.001;
    if (textureReady) drawFrame(savedProgress);
    glyphRaf = requestAnimationFrame(tickGlyphs);
  };

  if (glyphField) {
    const startGlyphs = () => {
      paintGlyphAtlas();
      if (!glyphRaf) glyphRaf = requestAnimationFrame(tickGlyphs);
    };
    const ready = document.fonts?.load?.('600 64px "Aux Mono"');
    if (ready) ready.then(startGlyphs).catch(startGlyphs);
    else startGlyphs();
  }

  // ── Mouse repel ──────────────────────────────────────────────────────────
  let mouseRafId = 0;
  let mouseTargetActive = 0;
  let mouseActiveValue = 0;
  const mousePos    = new THREE.Vector2(-9999, -9999);
  const mouseTarget = new THREE.Vector2(-9999, -9999);

  /**
   * Convierte coordenadas de pantalla (canvas) a espacio world del grid.
   * La cámara ortográfica permite despejar XY directamente desde el frustum.
   */
  const screenToWorld = (clientX: number, clientY: number): THREE.Vector2 => {
    const rect   = canvas.getBoundingClientRect();
    const ndcX   = ((clientX - rect.left)  / rect.width)  * 2 - 1;
    const ndcY   = -((clientY - rect.top)  / rect.height) * 2 + 1;
    const zoom   = Math.max(camera.zoom, 0.001);
    const halfW  = (camera.right - camera.left)   / (2 * zoom);
    const halfH  = (camera.top   - camera.bottom) / (2 * zoom);
    const cx     = (camera.left  + camera.right)  / 2;
    const cy     = (camera.top   + camera.bottom) / 2;
    return new THREE.Vector2(cx + ndcX * halfW, cy + ndcY * halfH);
  };

  const runMouseLoop = () => {
    mousePos.lerp(mouseTarget, 0.1);
    const lerpRate = mouseTargetActive > 0.5 ? 0.1 : 0.06;
    mouseActiveValue += (mouseTargetActive - mouseActiveValue) * lerpRate;

    const uniforms = imageGrid.material.uniforms;
    uniforms.uMouse.value.set(mousePos.x, mousePos.y);
    uniforms.uMouseActive.value = mouseActiveValue;

    if (textureReady) drawFrame(savedProgress);

    if (mouseActiveValue > 0.005 || mouseTargetActive > 0.5) {
      mouseRafId = requestAnimationFrame(runMouseLoop);
    } else {
      mouseRafId = 0;
      uniforms.uMouseActive.value = 0;
      if (textureReady) drawFrame(savedProgress);
    }
  };

  const startMouseLoop = () => {
    if (!mouseRafId) mouseRafId = requestAnimationFrame(runMouseLoop);
  };

  const onMouseMove = (e: MouseEvent) => {
    mouseTarget.copy(screenToWorld(e.clientX, e.clientY));
    mouseTargetActive = 1;
    startMouseLoop();
  };

  const onMouseLeave = () => {
    mouseTargetActive = 0;
    startMouseLoop();
  };

  if (enableMouseRepel) {
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
  }
  // ── End Mouse repel ───────────────────────────────────────────────────────

  return {
    setScrollZoom,
    setScrollZoomIn,
    setFigureWave,
    dispose() {
      if (enableMouseRepel) {
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseleave", onMouseLeave);
      }
      if (mouseRafId) {
        cancelAnimationFrame(mouseRafId);
        mouseRafId = 0;
      }
      if (glyphRaf) {
        cancelAnimationFrame(glyphRaf);
        glyphRaf = 0;
      }
      glyphTexture?.dispose();
      resizeObserver.disconnect();
      timeline.pause();
      timeline.cancel();
      imageGrid.hideFrom(scene);
      contourTexture?.dispose();
      imageGrid.dispose();
      renderer.dispose();
    },
  };
}
