import { gsap } from "gsap";

/** Set visual: letras + 2, 9 — posición aleatoria por casilla. */
const GRID_LETTERS = ["a", "r", "k", "a", "p", "p", "@", "*", "2", "9"] as const;
const GRID_SHADES = ["#050505", "#0a0a0a", "#111111", "#181818", "#222222"];

export const WORK_GRID = {
  cols: 56,
  rows: 34,
  switchDuration: 0.88,
  bandMin: 0.25,
  bandMax: 0.3,
  bandTilt: 0.12,
  symbolDensity: 0.65,
  bandFill: 0.86,
  shuffleIntervalMs: 72,
} as const;

export type TransitionFrame = {
  outgoingMask: string;
  trail: number;
};

type GridCell = {
  el: HTMLSpanElement;
  row: number;
  col: number;
  bandNoise: number;
  hasSymbol: boolean;
};

const randomLetter = () =>
  GRID_LETTERS[Math.floor(Math.random() * GRID_LETTERS.length)] ?? "a";

const randomShade = () =>
  GRID_SHADES[Math.floor(Math.random() * GRID_SHADES.length)] ?? "#0a0a0a";

export class WorkPreviewGrid {
  private frame: HTMLElement;
  private gridEl: HTMLDivElement;
  private cells: GridCell[] = [];
  private timeline: gsap.core.Timeline | null = null;
  private shuffleTimer: ReturnType<typeof setInterval> | null = null;
  private readonly cols = WORK_GRID.cols;
  private readonly rows = WORK_GRID.rows;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private bandWidth =
    WORK_GRID.bandMin +
    Math.random() * (WORK_GRID.bandMax - WORK_GRID.bandMin);

  constructor(frame: HTMLElement) {
    this.frame = frame;
    this.maskCanvas = document.createElement("canvas");
    const ctx = this.maskCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }
    this.maskCtx = ctx;

    this.gridEl = document.createElement("div");
    this.gridEl.className = "work-preview__grid";
    this.gridEl.setAttribute("aria-hidden", "true");
    this.gridEl.style.setProperty("--grid-cols", String(this.cols));
    this.gridEl.style.setProperty("--grid-rows", String(this.rows));
    this.frame.appendChild(this.gridEl);
    this.buildCells();
    this.refreshBandNoise();
  }

  private buildCells() {
    const fragment = document.createDocumentFragment();

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const el = document.createElement("span");
        el.className = "work-preview__cell";
        el.style.opacity = "0";
        el.style.transform = "scale(0.88)";
        fragment.appendChild(el);
        this.cells.push({
          el,
          row,
          col,
          bandNoise: 0,
          hasSymbol: false,
        });
      }
    }

    this.gridEl.appendChild(fragment);
  }

  rollBandWidth() {
    this.bandWidth =
      WORK_GRID.bandMin +
      Math.random() * (WORK_GRID.bandMax - WORK_GRID.bandMin);
  }

  refreshBandNoise() {
    for (const cell of this.cells) {
      cell.bandNoise = Math.random();
    }
  }

  private halfBand() {
    return this.bandWidth / 2;
  }

  private cellNormY(row: number, col: number) {
    const rowNorm = row / Math.max(1, this.rows - 1);
    const colNorm = col / Math.max(1, this.cols - 1);
    return rowNorm + (colNorm - 0.5) * WORK_GRID.bandTilt;
  }

  private cellRevealThreshold(cell: GridCell, trail: number) {
    return trail - this.halfBand() + cell.bandNoise * this.bandWidth;
  }

  /** Cada casilla se revela sola — sin franja horizontal completa adelantada. */
  private isCellRevealed(cell: GridCell, trail: number) {
    const y = this.cellNormY(cell.row, cell.col);
    return y < this.cellRevealThreshold(cell, trail);
  }

  private isInBand(cell: GridCell, trail: number) {
    const hb = this.halfBand();
    const y = this.cellNormY(cell.row, cell.col);
    return y >= trail - hb && y <= trail + hb;
  }

  private shouldCellBeActive(cell: GridCell, trail: number) {
    if (this.isCellRevealed(cell, trail)) return false;
    if (!this.isInBand(cell, trail)) return false;
    return cell.bandNoise >= 1 - WORK_GRID.bandFill;
  }

  /** Saliente visible solo en casillas aún no reveladas (máscara binaria por celda). */
  private shouldShowOutgoing(cell: GridCell, trail: number) {
    return !this.isCellRevealed(cell, trail);
  }

  private buildOutgoingMask(trail: number) {
    this.maskCanvas.width = this.cols;
    this.maskCanvas.height = this.rows;
    this.maskCtx.imageSmoothingEnabled = false;
    this.maskCtx.clearRect(0, 0, this.cols, this.rows);
    this.maskCtx.fillStyle = "#fff";

    for (const cell of this.cells) {
      if (!this.shouldShowOutgoing(cell, trail)) continue;
      this.maskCtx.fillRect(cell.col, cell.row, 1, 1);
    }

    return this.maskCanvas.toDataURL("image/png");
  }

  private applyBandSweep(trail: number) {
    for (const cell of this.cells) {
      const active = this.shouldCellBeActive(cell, trail);

      if (active) {
        if (!cell.el.classList.contains("is-active")) {
          this.activateCell(cell);
        }
        continue;
      }

      if (cell.el.classList.contains("is-active")) {
        this.deactivateCell(cell);
      }
    }
  }

  static trailFromProgress(progress: number, bandWidth: number) {
    const t = Math.max(0, Math.min(1, progress));
    return t * (1 + bandWidth) - bandWidth / 2;
  }

  applyTransitionProgress(progress: number, animateGrid: boolean): TransitionFrame {
    const trail = WorkPreviewGrid.trailFromProgress(progress, this.bandWidth);

    if (animateGrid) {
      this.applyBandSweep(trail);
    } else {
      this.revealFully();
    }

    return {
      outgoingMask: this.buildOutgoingMask(trail),
      trail,
    };
  }

  private pickHasSymbol() {
    return Math.random() < WORK_GRID.symbolDensity;
  }

  private applyCellSymbol(cell: GridCell) {
    cell.el.textContent = cell.hasSymbol ? randomLetter() : "";
    cell.el.classList.toggle("is-empty", !cell.hasSymbol);
  }

  private activateCell(cell: GridCell) {
    cell.hasSymbol = this.pickHasSymbol();
    this.applyCellSymbol(cell);
    cell.el.style.backgroundColor = randomShade();
    cell.el.style.opacity = "1";
    cell.el.style.transform = "scale(1)";
    cell.el.classList.add("is-active");
  }

  private deactivateCell(cell: GridCell) {
    cell.hasSymbol = false;
    cell.el.classList.remove("is-active", "is-empty");
    cell.el.textContent = "";
    cell.el.style.backgroundColor = "";
    cell.el.style.opacity = "0";
    cell.el.style.transform = "scale(0.88)";
  }

  private hasActiveCells() {
    return this.cells.some((cell) => cell.el.classList.contains("is-active"));
  }

  shuffleActiveSymbols() {
    if (!this.hasActiveCells()) return;

    for (const cell of this.cells) {
      if (!cell.el.classList.contains("is-active")) continue;

      const roll = Math.random();

      if (cell.hasSymbol) {
        if (roll < 0.34) {
          cell.el.textContent = randomLetter();
        } else if (roll < 0.4) {
          cell.hasSymbol = false;
          cell.el.textContent = "";
          cell.el.classList.add("is-empty");
        }
        continue;
      }

      if (roll < 0.14) {
        cell.hasSymbol = true;
        cell.el.classList.remove("is-empty");
        cell.el.textContent = randomLetter();
      }
    }
  }

  startShuffleLoop() {
    this.stopShuffleLoop();
    this.shuffleTimer = setInterval(() => {
      this.shuffleActiveSymbols();
    }, WORK_GRID.shuffleIntervalMs);
  }

  private stopShuffleLoop() {
    if (this.shuffleTimer) {
      clearInterval(this.shuffleTimer);
      this.shuffleTimer = null;
    }
  }

  kill() {
    this.stopShuffleLoop();
    this.timeline?.kill();
    this.timeline = null;
  }

  coverFully() {
    this.kill();
    this.rollBandWidth();
    for (const cell of this.cells) {
      this.deactivateCell(cell);
    }
  }

  revealFully() {
    for (const cell of this.cells) {
      this.deactivateCell(cell);
    }
    if (!this.hasActiveCells()) {
      this.stopShuffleLoop();
    }
  }

  tickSymbols() {
    if (!this.hasActiveCells()) {
      this.stopShuffleLoop();
      return;
    }
    if (!this.shuffleTimer) {
      this.startShuffleLoop();
    }
    this.shuffleActiveSymbols();
  }

  destroy() {
    this.kill();
    this.gridEl.remove();
    this.cells = [];
  }
}
