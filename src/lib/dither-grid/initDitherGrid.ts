import * as THREE from "three";
import { createTimeline, animate } from "animejs";
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
  } = options;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");

  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);
  camera.near = 1;
  camera.far = 2000;

  const cameraAnchor = new THREE.Group();
  cameraAnchor.name = "cameraAnchor";
  cameraAnchor.add(camera);
  scene.add(cameraAnchor);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

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

  /** Móvil: frustum con aspecto de pantalla; `half` define la altura visible (2·half/viewAspect) */
  const portraitFrustum = (half: number, cx: number, cy: number) => ({
    left: cx - half,
    right: cx + half,
    top: cy + half / viewAspect,
    bottom: cy - half / viewAspect,
  });

  /** half tal que la altura visible = contentH·zoom (prioridad altura, no ancho) */
  const portraitHalfForHeight = (contentH: number, zoom: number) =>
    (contentH * zoom * viewAspect) / 2;

  /** Retrato: fracción del ensanche total (1/viewAspect) */
  const PORTRAIT_WIDTH_STRETCH = 0.6;
  /** Retrato: desplaza la vista un poco a la izq. → la imagen se ve más a la derecha */
  const PORTRAIT_PAN_X = 0.02;

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
      applyFrustumFitAspectPreserve(fitBlend);
      return;
    }

    const scaleX =
      viewAspect >= 1
        ? lerp(1, viewAspect, fitBlend)
        : lerp(1, 1 + (1 / viewAspect - 1) * PORTRAIT_WIDTH_STRETCH, fitBlend);
    imageGrid.group.scale.set(scaleX, 1, 1);

    const { cx, cy, contentW, contentH } = getContentBoundsInCameraSpace();
    const zoom = Math.max(camera.zoom, 0.001);
    const frameCx =
      viewAspect < 1 ? cx - contentW * PORTRAIT_PAN_X * fitBlend : cx;

    const contain = getContainFrustum(viewAspect);
    const containHalfW = (contain.right - contain.left) / 2;
    const containHalfH = (contain.top - contain.bottom) / 2;

    let startLeft: number;
    let startRight: number;
    let startTop: number;
    let startBottom: number;

    if (viewAspect < 1) {
      const startHalf = Math.max(contentW, contentH) / 2;
      ({ left: startLeft, right: startRight, top: startTop, bottom: startBottom } =
        portraitFrustum(startHalf, frameCx, cy));
    } else {
      startLeft = cx - containHalfW;
      startRight = cx + containHalfW;
      startTop = cy + containHalfH;
      startBottom = cy - containHalfH;
    }

    let endLeft: number;
    let endRight: number;
    let endTop: number;
    let endBottom: number;

    if (viewAspect < 1) {
      const endHalf = portraitHalfForHeight(contentH, zoom);
      ({ left: endLeft, right: endRight, top: endTop, bottom: endBottom } =
        portraitFrustum(endHalf, frameCx, cy));
    } else {
      /* PC: sin cambios — cover por ancho */
      const coverW = Math.max(contentW, contentH * viewAspect);
      const coverH = coverW / viewAspect;
      const endHalfW = (coverW * zoom) / 2;
      const endHalfH = (coverH * zoom) / 2;
      endLeft = cx - endHalfW;
      endRight = cx + endHalfW;
      endTop = cy + endHalfH;
      endBottom = cy - endHalfH;
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
    window.dispatchEvent(new CustomEvent("dither-animation-complete"));
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
    renderer.setPixelRatio(Math.min(pixelRatio, 2));
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
    dispose() {
      if (enableMouseRepel) {
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseleave", onMouseLeave);
      }
      if (mouseRafId) {
        cancelAnimationFrame(mouseRafId);
        mouseRafId = 0;
      }
      resizeObserver.disconnect();
      timeline.pause();
      timeline.cancel();
      imageGrid.hideFrom(scene);
      imageGrid.dispose();
      renderer.dispose();
    },
  };
}
