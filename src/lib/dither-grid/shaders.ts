export const simplexNoise = `
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec3 permute(vec3 x) {
    return mod289(((x*34.0)+10.0)*x);
  }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

export const vertexShader = `
  uniform float uRowSize;
  uniform float uColumnSize;
  uniform float uDitherProgress;
  uniform float uGridOffsetStart;
  uniform float uGridOffsetEnd;
  uniform sampler2D uTexture;
  uniform float uTextureAspect;
  uniform float uGridAspect;

  uniform vec2  uMouse;
  uniform float uMouseRadius;
  uniform float uMouseStrength;
  uniform float uMouseActive;

  attribute float aRow;
  attribute float aColumn;
  attribute float aThreshold;

  varying vec3 vColor;
  varying vec3 vNormal;

  ${simplexNoise}

  vec2 coverUV(vec2 st, float srcAspect, float dstAspect) {
    vec2 uv = st;
    if (srcAspect > dstAspect) {
      float scale = dstAspect / srcAspect;
      uv.x = (uv.x - 0.5) / scale + 0.5;
    } else {
      float scale = srcAspect / dstAspect;
      uv.y = (uv.y - 0.5) / scale + 0.5;
    }
    return uv;
  }

  void main() {
    vec2 st = vec2(aColumn, uRowSize - 1.0 - aRow) / vec2(uColumnSize - 1.0, uRowSize - 1.0);
    vec2 uv = coverUV(st, uTextureAspect, uGridAspect);
    float bayerThreshold = aThreshold;
    float rowId = aRow / uRowSize;
    float columnId = aColumn / uColumnSize;

    vec4 textureColor = texture2D(uTexture, uv);
    float initialColor = 0.0;
    float targetColor = textureColor.r;

    float cellDelayIndex = snoise(vec2(rowId, columnId) * 80.7);
    cellDelayIndex = smoothstep(-1.0, 1.0, cellDelayIndex);

    float animationDuration = 0.15;
    float animationDelay = cellDelayIndex * (1.0 - animationDuration);
    float animationEnd = animationDelay + animationDuration;
    float animationProgress = smoothstep(animationDelay, animationEnd, uDitherProgress);

    float ditheredColor = step(bayerThreshold, targetColor);
    float ditherProgress = smoothstep(0.0, 1.0, animationProgress);
    float finalColor = mix(initialColor, ditheredColor, ditherProgress);

    float cellOffsetProgress = finalColor;
    float cellOffset = mix(uGridOffsetStart, uGridOffsetEnd, cellOffsetProgress);

    // Pre-compute mouse repel
    vec2  repelOffset = vec2(0.0);
    float repelZ      = 0.0;

    if (uMouseActive > 0.0) {
      vec4 cellCenterWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec2 cellXY = cellCenterWorld.xy;

      // Hash estable por celda
      float cellHash = fract(
        sin(dot(vec2(aRow * 1.73, aColumn * 2.17), vec2(12.9898, 78.233))) * 43758.5453
      );

      // Deformación multi-capa del espacio → rompe la forma circular
      vec2 warp1 = vec2(
        snoise(cellXY * 0.07 + vec2(0.0, 9.2)),
        snoise(cellXY * 0.07 + vec2(7.4, 0.0))
      ) * uMouseRadius * 0.42;

      vec2 warp2 = vec2(
        snoise(cellXY * 0.16 + uMouse * 0.025 + vec2(3.1, 1.8)),
        snoise(cellXY * 0.21 - uMouse * 0.02 + vec2(5.4, 2.6))
      ) * uMouseRadius * 0.32;

      vec2 warpedXY = cellXY + warp1 + warp2 * 0.65;
      vec2 toCell   = warpedXY - uMouse;

      float angle = atan(toCell.y, toCell.x);
      float nPos  = snoise(cellXY * 0.09);
      float nPos2 = snoise(cellXY * 0.24 + vec2(4.1, 1.7)) * 0.6;
      float nAng  = snoise(vec2(cos(angle * 2.6), sin(angle * 2.6)) * 2.8 + uMouse * 0.03);
      float nAng2 = snoise(vec2(cos(angle * 5.3 + cellHash * 6.28), sin(angle * 5.3)) * 1.6);

      // Radio efectivo con lóbulos irregulares (no círculo)
      float radiusMul = 0.32
        + cellHash * 0.58
        + (nPos + nPos2) * 0.24
        + nAng * 0.22
        + nAng2 * 0.18;
      float effectiveR = uMouseRadius * radiusMul;

      // Distancia anisotrópica según ángulo → mancha orgánica
      float stretchA = 0.55 + 0.5 * snoise(vec2(angle * 1.9, cellHash * 5.0));
      float stretchB = 0.55 + 0.5 * snoise(vec2(angle * 3.4 + 2.1, nAng));
      vec2  toScaled = vec2(toCell.x * (0.75 + stretchA * 0.55), toCell.y * (0.75 + stretchB * 0.55));
      float d = length(toScaled);

      if (d > 0.0001 && d < effectiveR) {
        float t        = 1.0 - d / effectiveR;
        float strength = t * t * (3.0 - 2.0 * t) * uMouseStrength * uMouseActive;

        // Dirección con swirl y caos local
        vec2 dir = normalize(toCell + warp1 * 0.2);
        vec2 tangent = vec2(-dir.y, dir.x) * (cellHash - 0.5) * 1.15;
        vec2 chaos = vec2(
          snoise(vec2(aRow * 0.31 + uMouse.x * 0.01, aColumn * 0.37)),
          snoise(vec2(aRow * 0.27, aColumn * 0.43 + uMouse.y * 0.01))
        ) * strength * 0.42;

        repelOffset = (dir + tangent) * strength + chaos;
        repelZ      = strength * (0.18 + cellHash * 0.14);
      }
    }

    vec4 cellLocalPosition = vec4(position, 1.0);
    vec4 cellPosition = modelMatrix * instanceMatrix * cellLocalPosition;
    cellPosition.z  += cellOffset;
    cellPosition.xy += repelOffset;
    cellPosition.z  += repelZ;

    vec4 modelNormal = modelMatrix * instanceMatrix * vec4(normal, 0.0);

    gl_Position = projectionMatrix * viewMatrix * cellPosition;
    vColor = vec3(finalColor);
    vNormal = normalize(modelNormal.xyz);
  }
`;

export const fragmentShader = `
  varying vec3 vColor;
  varying vec3 vNormal;

  void main() {
    float shadow = dot(normalize(vec3(0.0, 1.0, 1.0)), normalize(vNormal));
    vec3 color = vColor * (0.9 + 0.6 * shadow);
    color = clamp(vec3(0.0), vec3(1.0), color);
    gl_FragColor = vec4(color, 1.0);
  }
`;
