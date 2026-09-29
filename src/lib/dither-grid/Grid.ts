import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders";

export type GridProperties = {
  name?: string;
  rows?: number;
  columns?: number;
  cellSize?: number;
  cellThickness?: number;
  spacing?: number;
  gridType?: number;
  cellColor?: string;
  image?: string;
  activeThresholdMapId?: string;
  onImageLoad?: () => void;
};

type ThresholdMap = {
  id: string;
  name: string;
  data: number[];
};

export class Grid {
  drawn = false;
  shown = false;
  gridProperties: GridProperties;
  cellProperties: ReturnType<Grid["calculateCellProperties"]>;
  thresholdMaps: ThresholdMap[];
  activeThresholdMapId: string;

  group!: THREE.Group;
  geometry!: THREE.BoxGeometry;
  material!: THREE.ShaderMaterial;
  instance!: THREE.InstancedMesh;
  attributes!: Record<string, THREE.InstancedBufferAttribute>;

  constructor(gridProperties: GridProperties) {
    this.gridProperties = gridProperties;
    this.cellProperties = this.calculateCellProperties(gridProperties);
    this.thresholdMaps = [
      {
        id: "bayer4x4",
        name: "Bayer 4x4",
        data: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
      },
      {
        id: "bayer8x8",
        name: "Bayer 8x8",
        data: [
          0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38,
          60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
          15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
        ],
      },
      {
        id: "halftone",
        name: "Halftone",
        data: [
          24, 10, 12, 26, 35, 47, 49, 37, 8, 0, 2, 14, 45, 59, 61, 51, 22, 6, 4, 16, 43, 57, 63, 53,
          30, 20, 18, 28, 33, 41, 55, 39, 34, 46, 48, 36, 25, 11, 13, 27, 44, 58, 60, 50, 9, 1, 3, 15,
          42, 56, 62, 52, 23, 7, 5, 17, 32, 40, 54, 38, 31, 21, 19, 29,
        ],
      },
      {
        id: "voidAndCluster",
        name: "Void and Cluster",
        data: [
          131, 187, 8, 78, 50, 18, 134, 89, 155, 102, 29, 95, 184, 73, 22, 86, 113, 171, 142, 105, 34,
          166, 9, 60, 151, 128, 40, 110, 168, 137, 45, 28, 64, 188, 82, 54, 124, 189, 80, 13, 156, 56,
          7, 61, 186, 121, 154, 6, 108, 177, 24, 100, 38, 176, 93, 123, 83, 148, 96, 17, 88, 133, 44,
          145, 69, 161, 139, 72, 30, 181, 115, 27, 163, 47, 178, 65, 164, 14, 120, 48, 5, 127, 153, 52,
          190, 58, 126, 81, 116, 21, 106, 77, 173, 92, 191, 63, 99, 12, 76, 144, 4, 185, 37, 149, 192,
          39, 135, 23, 117, 31, 170, 132, 35, 172, 103, 66, 129, 79, 3, 97, 57, 159, 70, 141, 53, 94,
          114, 20, 49, 158, 19, 146, 169, 122, 183, 11, 104, 180, 2, 165, 152, 87, 182, 118, 91, 42, 67,
          25, 84, 147, 43, 85, 125, 68, 16, 136, 71, 10, 193, 112, 160, 138, 51, 111, 162, 26, 194, 46,
          174, 107, 41, 143, 33, 74, 1, 101, 195, 15, 75, 140, 109, 90, 32, 62, 157, 98, 167, 119, 179,
          59, 36, 130, 175, 55, 0, 150,
        ],
      },
    ];
    this.activeThresholdMapId =
      gridProperties.activeThresholdMapId ?? this.thresholdMaps[0].id;
  }

  calculateCellProperties(gridProperties: GridProperties) {
    const rows = gridProperties.rows ?? 1;
    const columns = gridProperties.columns ?? 1;
    const cellSize = gridProperties.cellSize ?? 1;
    const cellThickness = gridProperties.cellThickness ?? cellSize;
    const spacing = gridProperties.spacing ?? 1;
    const objectCount = rows * columns;
    const properties: Array<{
      id: number;
      x: number;
      y: number;
      z: number;
      row: number;
      column: number;
      cellSize: number;
      cellThickness: number;
    }> = [];

    for (let i = 0; i < objectCount; i++) {
      const row = Math.floor(i / columns);
      const column = i % columns;
      const x = (column - (columns - 1) / 2) * spacing;
      const y = (-row + (rows - 1) / 2) * spacing;

      properties.push({
        id: i,
        x,
        y,
        z: 0,
        row,
        column,
        cellSize,
        cellThickness,
      });
    }

    return properties;
  }

  calculateAttributes() {
    const calculateThreshold = (
      row: number,
      column: number,
      matrixConfig: ThresholdMap,
    ) => {
      const { data } = matrixConfig;
      const size = Math.sqrt(data.length);
      const scale = data.length;
      const matrixRow = row % size;
      const matrixColumn = column % size;
      const index = matrixColumn + matrixRow * size;
      return data[index] / scale;
    };

    const count = this.cellProperties.length;
    const rowArray = new Float32Array(count);
    const columnArray = new Float32Array(count);
    const thresholdArrays: Record<string, Float32Array> = {};

    this.thresholdMaps.forEach((config) => {
      thresholdArrays[config.id] = new Float32Array(count);
    });

    for (let i = 0; i < count; i++) {
      const { row, column } = this.cellProperties[i];
      rowArray[i] = row;
      columnArray[i] = column;
      this.thresholdMaps.forEach((config) => {
        thresholdArrays[config.id][i] = calculateThreshold(row, column, config);
      });
    }

    const attributes: Record<string, THREE.InstancedBufferAttribute> = {
      aRow: new THREE.InstancedBufferAttribute(rowArray, 1),
      aColumn: new THREE.InstancedBufferAttribute(columnArray, 1),
    };

    this.thresholdMaps.forEach((config) => {
      attributes[config.id] = new THREE.InstancedBufferAttribute(
        thresholdArrays[config.id],
        1,
      );
    });

    return attributes;
  }

  init() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const attributes = this.calculateAttributes();

    geometry.setAttribute("aRow", attributes.aRow);
    geometry.setAttribute("aColumn", attributes.aColumn);
    geometry.setAttribute("aThreshold", attributes[this.activeThresholdMapId]);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uRowSize: { value: this.gridProperties.rows ?? 1 },
        uColumnSize: { value: this.gridProperties.columns ?? 1 },
        uGridOffsetStart: { value: 0 },
        uGridOffsetEnd: { value: 0 },
        uTexture: { value: null },
        uTextureAspect: { value: 1 },
        uAspectCover: { value: 0 },
        uGridAspect: {
          value:
            (this.gridProperties.columns ?? 1) /
            Math.max(1, this.gridProperties.rows ?? 1),
        },
        uDitherProgress: { value: 0 },
        uClearBackground: { value: 0 },
        uMouse:          { value: new THREE.Vector2(0, 0) },
        uMouseRadius:    { value: 11.0 },
        uMouseStrength:  { value: 8.0 },
        uMouseActive:    { value: 0.0 },
        uWaveCenter:     { value: new THREE.Vector2(0, 0) },
        uWaveTravel:     { value: 0 },
        uWaveActive:     { value: 0 },
        uContour:        { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
        uGlyphMode:      { value: 0 },
        uGlyphCount:     { value: 1 },
        uGlyphTime:      { value: 0 },
        uGlyphGrid:      { value: new THREE.Vector2(1, 1) },
        uGlyphs:         { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
      },
    });

    if (this.gridProperties.gridType === 1 && this.gridProperties.image) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        this.gridProperties.image,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          material.uniforms.uTexture.value = texture;
          const img = texture.image as HTMLImageElement | { width: number; height: number };
          if (img?.width && img?.height) {
            material.uniforms.uTextureAspect.value = img.width / img.height;
          }
          material.needsUpdate = true;
          this.gridProperties.onImageLoad?.();
        },
        undefined,
        () => {
          this.gridProperties.onImageLoad?.();
        },
      );
    }

    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      this.cellProperties.length,
    );

    const group = new THREE.Group();
    group.add(mesh);

    this.group = group;
    this.geometry = geometry;
    this.material = material;
    this.instance = mesh;
    this.attributes = attributes;

    for (let i = 0; i < this.cellProperties.length; i++) {
      const { x, y, z, cellSize, cellThickness } = this.cellProperties[i];
      const objectRef = new THREE.Object3D();
      objectRef.position.set(x, y, z);
      objectRef.scale.set(cellSize, cellSize, cellThickness);
      objectRef.updateMatrix();
      this.instance.setMatrixAt(i, objectRef.matrix);
    }

    this.instance.instanceMatrix.needsUpdate = true;
    this.drawn = true;
  }

  showAt(scene: THREE.Scene) {
    if (!this.drawn) this.init();
    if (!this.shown) {
      scene.add(this.group);
      this.shown = true;
    }
  }

  hideFrom(scene: THREE.Scene) {
    if (this.shown) {
      scene.remove(this.group);
      this.shown = false;
    }
  }

  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    const texture = this.material?.uniforms.uTexture.value as THREE.Texture | null;
    texture?.dispose();
  }
}
