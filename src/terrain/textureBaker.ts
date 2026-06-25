import * as THREE from 'three';
import type { TerrainData } from '../types/terrain';
import type {
  TerrainDiffuseLayerKey,
  TerrainTextureAsset,
  TerrainTextureSettings,
  TerrainTextureSet,
  TextureLayerKey,
} from '../types/textures';
import { getHeightColor } from './geometry';
import { computeTerrainNormal } from './normals';
import { clamp, lerp, smoothstep } from './noise';

interface PreparedTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const FALLBACK_COLORS: Record<TerrainDiffuseLayerKey, [number, number, number]> = {
  grass: [88, 136, 76],
  dirt: [121, 101, 72],
  rock: [132, 128, 116],
  snow: [224, 225, 214],
};

const FALLBACK_NORMAL = [128, 128, 255] as [number, number, number];

export function hasTerrainTextures(textures: TerrainTextureSet) {
  return Boolean(textures.grass || textures.dirt || textures.rock || textures.snow);
}

export function hasTextureNormals(textures: TerrainTextureSet) {
  return Boolean(
    textures.grassNormal ||
      textures.dirtNormal ||
      textures.rockNormal ||
      textures.snowNormal ||
      textures.detailNormal,
  );
}

export async function createBakedTerrainTexture(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
) {
  const canvas = await createBakedTerrainTextureCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export async function createBakedTerrainTextureBlob(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
) {
  const canvas = await createBakedTerrainTextureCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Falha ao serializar a textura bakeada.'));
    }, 'image/png');
  });
}

export async function createBakedNormalMapBlob(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
) {
  const canvas = await createCombinedNormalCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    true,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Falha ao serializar o normal map combinado.'));
    }, 'image/png');
  });
}

export async function createBakedNormalTexture(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
) {
  const canvas = await createCombinedNormalCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    true,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export async function loadDetailNormalTexture(
  textures: TerrainTextureSet,
  repeat: number,
) {
  if (!textures.detailNormal) {
    return null;
  }

  const texture = await new THREE.TextureLoader().loadAsync(textures.detailNormal.url);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

export async function createPreviewNormalTexture(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
) {
  if (!settings.terrainNormalEnabled && !hasTextureNormals(textures)) {
    return null;
  }

  const canvas = await createCombinedNormalCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    false,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

async function createBakedTerrainTextureCanvas(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
) {
  const size = Math.max(128, Math.round(settings.bakeResolution));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D indisponivel para bakear texturas.');
  }

  const [grass, dirt, rock, snow] = await Promise.all([
    prepareTexture(textures.grass, FALLBACK_COLORS.grass),
    prepareTexture(textures.dirt, FALLBACK_COLORS.dirt),
    prepareTexture(textures.rock, FALLBACK_COLORS.rock),
    prepareTexture(textures.snow, FALLBACK_COLORS.snow),
  ]);

  const image = context.createImageData(size, size);
  const heightRange = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);
  const repeat = Math.max(1, settings.repeat);

  for (let y = 0; y < size; y += 1) {
    const v = y / Math.max(1, size - 1);
    const row = Math.round(v * (terrain.resolution - 1));

    for (let x = 0; x < size; x += 1) {
      const u = x / Math.max(1, size - 1);
      const col = Math.round(u * (terrain.resolution - 1));
      const height = terrain.heights[row * terrain.resolution + col];
      const height01 = clamp((height - terrain.stats.heightMin) / heightRange, 0, 1);
      const normal = computeTerrainNormal(terrain, row, col, verticalExaggeration);
      const slope = clamp(1 - normal.y, 0, 1);

      const weights = getTextureWeights(height01, slope);
      const sampledGrass = samplePreparedTexture(grass, u, v, repeat);
      const sampledDirt = samplePreparedTexture(dirt, u, v, repeat);
      const sampledRock = samplePreparedTexture(rock, u, v, repeat);
      const sampledSnow = samplePreparedTexture(snow, u, v, repeat);
      const textured = applyTerrainColorVariation(
        mixFour(sampledGrass, sampledDirt, sampledRock, sampledSnow, weights),
        u,
        v,
        height01,
        slope,
        settings.macroVariation,
      );
      const heightColor = getHeightColor(height01, slope).map((value) => value * 255) as [
        number,
        number,
        number,
      ];
      const textureInfluence = clamp(
        settings.blendStrength * (0.55 + weights.rock * 0.25 + weights.dirt * 0.1),
        0,
        1,
      );
      const finalColor = [
        lerp(heightColor[0], textured[0], textureInfluence),
        lerp(heightColor[1], textured[1], textureInfluence),
        lerp(heightColor[2], textured[2], textureInfluence),
      ];

      const offset = (y * size + x) * 4;
      image.data[offset] = finalColor[0];
      image.data[offset + 1] = finalColor[1];
      image.data[offset + 2] = finalColor[2];
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function getTextureWeights(height: number, slope: number) {
  const steep = smoothstep(0.26, 0.62, slope);
  const snow = smoothstep(0.82, 0.96, height) * (1 - steep * 0.45);
  const rock =
    smoothstep(0.55, 0.9, height) * 0.42 +
    steep * (0.55 + smoothstep(0.42, 0.82, height) * 0.3);
  const dirt =
    smoothstep(0.06, 0.28, height) *
      (1 - smoothstep(0.58, 0.86, height)) *
      (0.72 + steep * 0.22);
  const grass =
    (1 - smoothstep(0.46, 0.82, height)) * (1 - steep * 0.52) +
    smoothstep(0.08, 0.24, height) * 0.35;
  const total = grass + dirt + rock + snow || 1;

  return {
    grass: grass / total,
    dirt: dirt / total,
    rock: rock / total,
    snow: snow / total,
  };
}

async function createCombinedNormalCanvas(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
  forceTerrainNormal: boolean,
) {
  const requestedSize = Math.round(settings.bakeResolution);
  const size = forceTerrainNormal
    ? Math.max(128, Math.min(4096, requestedSize))
    : Math.max(128, Math.min(1024, requestedSize));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D indisponivel para gerar normal map de preview.');
  }

  const [grassNormal, dirtNormal, rockNormal, snowNormal, detailNormal] = await Promise.all([
    prepareNormalTexture(textures.grassNormal),
    prepareNormalTexture(textures.dirtNormal),
    prepareNormalTexture(textures.rockNormal),
    prepareNormalTexture(textures.snowNormal),
    prepareNormalTexture(textures.detailNormal),
  ]);
  const image = context.createImageData(size, size);
  const repeat = Math.max(1, settings.repeat);
  const terrainStrength = forceTerrainNormal || settings.terrainNormalEnabled
    ? clamp(settings.terrainNormalStrength, 0, 2)
    : 0;
  const textureNormalStrength =
    hasTextureNormals(textures) ? clamp(settings.detailNormalStrength, 0, 2) : 0;
  const heightRange = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);

  for (let y = 0; y < size; y += 1) {
    const v = y / Math.max(1, size - 1);
    const row = Math.round(v * (terrain.resolution - 1));

    for (let x = 0; x < size; x += 1) {
      const u = x / Math.max(1, size - 1);
      const col = Math.round(u * (terrain.resolution - 1));
      const height = terrain.heights[row * terrain.resolution + col];
      const height01 = clamp((height - terrain.stats.heightMin) / heightRange, 0, 1);
      const terrainNormal = computeTerrainNormal(terrain, row, col, verticalExaggeration);
      let nx = terrainNormal.x * terrainStrength;
      let ny = terrainNormal.z * terrainStrength;
      let nz = terrainStrength > 0 ? Math.max(0.08, terrainNormal.y) : 1;
      const slope = clamp(1 - terrainNormal.y, 0, 1);
      const weights = getTextureWeights(height01, slope);

      if (textureNormalStrength > 0) {
        const blendedLayerNormal = mixFourNormals(
          sampleNormalTexture(grassNormal, u, v, repeat),
          sampleNormalTexture(dirtNormal, u, v, repeat),
          sampleNormalTexture(rockNormal, u, v, repeat),
          sampleNormalTexture(snowNormal, u, v, repeat),
          weights,
        );
        nx += blendedLayerNormal[0] * textureNormalStrength;
        ny += blendedLayerNormal[1] * textureNormalStrength;
        nz += (blendedLayerNormal[2] - 1) * textureNormalStrength * 0.72;
      }

      if (detailNormal && textureNormalStrength > 0) {
        const detail = sampleNormalTexture(detailNormal, u, v, repeat);
        nx += detail[0] * textureNormalStrength;
        ny += detail[1] * textureNormalStrength;
        nz += (detail[2] - 1) * textureNormalStrength * 0.52;
      }

      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;

      const offset = (y * size + x) * 4;
      image.data[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

async function prepareTexture(
  asset: TerrainTextureSet[TextureLayerKey],
  fallbackColor: [number, number, number],
): Promise<PreparedTexture> {
  if (!asset) {
    return createSolidTexture(fallbackColor);
  }

  const image = await loadImage(asset.url).catch(() => null);
  if (!image) {
    return createSolidTexture(fallbackColor);
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return createSolidTexture(fallbackColor);
  }
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    width: canvas.width,
    height: canvas.height,
    data,
  };
}

async function prepareNormalTexture(asset: TerrainTextureAsset | undefined) {
  return asset ? prepareTexture(asset, FALLBACK_NORMAL) : null;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Falha ao carregar textura.'));
    image.src = url;
  });
}

function createSolidTexture(color: [number, number, number]): PreparedTexture {
  return {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([color[0], color[1], color[2], 255]),
  };
}

function samplePreparedTexture(texture: PreparedTexture, u: number, v: number, repeat: number) {
  const wrappedU = wrap(u * repeat);
  const wrappedV = wrap(v * repeat);
  const x = wrappedU * texture.width - 0.5;
  const y = wrappedV * texture.height - 0.5;
  const x0 = positiveModulo(Math.floor(x), texture.width);
  const y0 = positiveModulo(Math.floor(y), texture.height);
  const x1 = (x0 + 1) % texture.width;
  const y1 = (y0 + 1) % texture.height;
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const c00 = getPixel(texture, x0, y0);
  const c10 = getPixel(texture, x1, y0);
  const c01 = getPixel(texture, x0, y1);
  const c11 = getPixel(texture, x1, y1);
  return [
    bilerp(c00[0], c10[0], c01[0], c11[0], tx, ty),
    bilerp(c00[1], c10[1], c01[1], c11[1], tx, ty),
    bilerp(c00[2], c10[2], c01[2], c11[2], tx, ty),
  ] as [
    number,
    number,
    number,
  ];
}

function sampleNormalTexture(
  texture: PreparedTexture | null,
  u: number,
  v: number,
  repeat: number,
) {
  if (!texture) {
    return [0, 0, 1] as [number, number, number];
  }

  const color = samplePreparedTexture(texture, u, v, repeat);
  const normal = [
    (color[0] / 255) * 2 - 1,
    (color[1] / 255) * 2 - 1,
    (color[2] / 255) * 2 - 1,
  ] as [number, number, number];
  return normalizeNormal(normal);
}

function getPixel(texture: PreparedTexture, x: number, y: number) {
  const offset = (y * texture.width + x) * 4;
  return [texture.data[offset], texture.data[offset + 1], texture.data[offset + 2]] as [
    number,
    number,
    number,
  ];
}

function mixFour(
  grass: [number, number, number],
  dirt: [number, number, number],
  rock: [number, number, number],
  snow: [number, number, number],
  weights: ReturnType<typeof getTextureWeights>,
) {
  return [
    grass[0] * weights.grass + dirt[0] * weights.dirt + rock[0] * weights.rock + snow[0] * weights.snow,
    grass[1] * weights.grass + dirt[1] * weights.dirt + rock[1] * weights.rock + snow[1] * weights.snow,
    grass[2] * weights.grass + dirt[2] * weights.dirt + rock[2] * weights.rock + snow[2] * weights.snow,
  ] as [number, number, number];
}

function mixFourNormals(
  grass: [number, number, number],
  dirt: [number, number, number],
  rock: [number, number, number],
  snow: [number, number, number],
  weights: ReturnType<typeof getTextureWeights>,
) {
  return normalizeNormal([
    grass[0] * weights.grass + dirt[0] * weights.dirt + rock[0] * weights.rock + snow[0] * weights.snow,
    grass[1] * weights.grass + dirt[1] * weights.dirt + rock[1] * weights.rock + snow[1] * weights.snow,
    grass[2] * weights.grass + dirt[2] * weights.dirt + rock[2] * weights.rock + snow[2] * weights.snow,
  ]);
}

function normalizeNormal(normal: [number, number, number]) {
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  return [
    normal[0] / length,
    normal[1] / length,
    normal[2] / length,
  ] as [number, number, number];
}

function wrap(value: number) {
  return value - Math.floor(value);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function bilerp(
  c00: number,
  c10: number,
  c01: number,
  c11: number,
  tx: number,
  ty: number,
) {
  return lerp(lerp(c00, c10, tx), lerp(c01, c11, tx), ty);
}

function applyTerrainColorVariation(
  color: [number, number, number],
  u: number,
  v: number,
  height: number,
  slope: number,
  strength: number,
) {
  const safeStrength = clamp(strength, 0, 1);
  if (safeStrength <= 0) {
    return color;
  }

  const macro =
    valueNoise(u * 7.5 + 13.1, v * 7.5 - 2.7) * 0.55 +
    valueNoise(u * 19.0 - 4.5, v * 19.0 + 8.3) * 0.3 +
    valueNoise(u * 43.0 + 1.2, v * 43.0 - 9.1) * 0.15;
  const coolWarm = valueNoise(u * 5.0 - 21.0, v * 5.0 + 3.0) - 0.5;
  const shade = 1 + (macro - 0.5) * safeStrength * 0.38 - slope * safeStrength * 0.08;
  const greenPush = (1 - height) * (1 - slope) * safeStrength * 16;
  const rockPush = slope * safeStrength * 10;

  return [
    clamp(color[0] * shade + coolWarm * 5 + rockPush, 0, 255),
    clamp(color[1] * shade + greenPush - rockPush * 0.2, 0, 255),
    clamp(color[2] * shade - coolWarm * 4, 0, 255),
  ] as [number, number, number];
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return bilerp(a, b, c, d, sx, sy);
}

function hash2(x: number, y: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
