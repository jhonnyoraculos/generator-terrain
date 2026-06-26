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

interface TextureRepeat {
  u: number;
  v: number;
}

export interface TextureBakeRegion {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  resolution?: number;
}

interface PreparedDiffuseTextures {
  grass: PreparedTexture;
  dirt: PreparedTexture;
  rock: PreparedTexture;
  snow: PreparedTexture;
}

type TextureRepeatsByLayer = Record<TerrainDiffuseLayerKey | 'detail', TextureRepeat>;

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
  region?: TextureBakeRegion,
) {
  const canvas = await createBakedTerrainTextureCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    region,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export async function createBakedTerrainTextureBlob(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
  region?: TextureBakeRegion,
) {
  const canvas = await createBakedTerrainTextureCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    region,
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
  region?: TextureBakeRegion,
) {
  const canvas = await createCombinedNormalCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    true,
    region,
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
  region?: TextureBakeRegion,
) {
  const canvas = await createCombinedNormalCanvas(
    terrain,
    textures,
    settings,
    verticalExaggeration,
    true,
    region,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
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
  region?: TextureBakeRegion,
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
    region,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

async function createBakedTerrainTextureCanvas(
  terrain: TerrainData,
  textures: TerrainTextureSet,
  settings: TerrainTextureSettings,
  verticalExaggeration: number,
  region?: TextureBakeRegion,
) {
  const bakeRegion = normalizeBakeRegion(region);
  const size = getSafeBakeResolution(
    bakeRegion.resolution ?? settings.bakeResolution,
    8192,
  );
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

  const preparedTextures: PreparedDiffuseTextures = { grass, dirt, rock, snow };
  const image = context.createImageData(size, size);
  const heightRange = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);
  const repeats = getTextureRepeats(terrain, settings);
  const sampleGrid = getDiffuseSampleGrid(size, repeats, bakeRegion);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const finalColor = sampleGrid === 1
        ? sampleTerrainDiffuseColor(
            terrain,
            preparedTextures,
            repeats,
            mapLocalToRegion(x / Math.max(1, size - 1), bakeRegion.u0, bakeRegion.u1),
            mapLocalToRegion(y / Math.max(1, size - 1), bakeRegion.v0, bakeRegion.v1),
            verticalExaggeration,
            heightRange,
            settings,
          )
        : sampleTerrainDiffuseColorSupersampled(
            terrain,
            preparedTextures,
            repeats,
            x,
            y,
            size,
            sampleGrid,
            bakeRegion,
            verticalExaggeration,
            heightRange,
            settings,
          );

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

function sampleTerrainDiffuseColorSupersampled(
  terrain: TerrainData,
  textures: PreparedDiffuseTextures,
  repeats: TextureRepeatsByLayer,
  x: number,
  y: number,
  size: number,
  sampleGrid: number,
  region: TextureBakeRegion,
  verticalExaggeration: number,
  heightRange: number,
  settings: TerrainTextureSettings,
) {
  const totalSamples = sampleGrid * sampleGrid;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (let sampleY = 0; sampleY < sampleGrid; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampleGrid; sampleX += 1) {
      const localU = clamp(
        (x + (sampleX + 0.5) / sampleGrid - 0.5) / Math.max(1, size - 1),
        0,
        1,
      );
      const localV = clamp(
        (y + (sampleY + 0.5) / sampleGrid - 0.5) / Math.max(1, size - 1),
        0,
        1,
      );
      const u = mapLocalToRegion(localU, region.u0, region.u1);
      const v = mapLocalToRegion(localV, region.v0, region.v1);
      const color = sampleTerrainDiffuseColor(
        terrain,
        textures,
        repeats,
        u,
        v,
        verticalExaggeration,
        heightRange,
        settings,
      );
      red += color[0];
      green += color[1];
      blue += color[2];
    }
  }

  return [red / totalSamples, green / totalSamples, blue / totalSamples] as [
    number,
    number,
    number,
  ];
}

function sampleTerrainDiffuseColor(
  terrain: TerrainData,
  textures: PreparedDiffuseTextures,
  repeats: TextureRepeatsByLayer,
  u: number,
  v: number,
  verticalExaggeration: number,
  heightRange: number,
  settings: TerrainTextureSettings,
) {
  const row = Math.round(v * (terrain.resolution - 1));
  const col = Math.round(u * (terrain.resolution - 1));
  const height = terrain.heights[row * terrain.resolution + col];
  const height01 = clamp((height - terrain.stats.heightMin) / heightRange, 0, 1);
  const normal = computeTerrainNormal(terrain, row, col, verticalExaggeration);
  const slope = clamp(1 - normal.y, 0, 1);
  const weights = getTextureWeights(height01, slope);
  const sampledGrass = sampleLayerTexture(
    textures.grass,
    u,
    v,
    height01,
    slope,
    repeats.grass,
    'grass',
  );
  const sampledDirt = sampleLayerTexture(
    textures.dirt,
    u,
    v,
    height01,
    slope,
    repeats.dirt,
    'dirt',
  );
  const sampledRock = sampleLayerTexture(
    textures.rock,
    u,
    v,
    height01,
    slope,
    repeats.rock,
    'rock',
  );
  const sampledSnow = sampleLayerTexture(
    textures.snow,
    u,
    v,
    height01,
    slope,
    repeats.snow,
    'snow',
  );
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
    settings.blendStrength * (0.82 + weights.rock * 0.12 + weights.dirt * 0.06),
    0,
    1,
  );

  return [
    lerp(heightColor[0], textured[0], textureInfluence),
    lerp(heightColor[1], textured[1], textureInfluence),
    lerp(heightColor[2], textured[2], textureInfluence),
  ] as [number, number, number];
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
  region?: TextureBakeRegion,
) {
  const bakeRegion = normalizeBakeRegion(region);
  const requestedSize = Math.round(settings.bakeResolution);
  const size = forceTerrainNormal
    ? getSafeBakeResolution(bakeRegion.resolution ?? requestedSize, 8192)
    : getSafeBakeResolution(bakeRegion.resolution ?? requestedSize, 2048);
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
  const repeats = getTextureRepeats(terrain, settings);
  const terrainStrength = forceTerrainNormal || settings.terrainNormalEnabled
    ? clamp(settings.terrainNormalStrength, 0, 3)
    : 0;
  const textureNormalStrength =
    hasTextureNormals(textures) ? clamp(settings.detailNormalStrength, 0, 3) : 0;
  const heightRange = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);

  for (let y = 0; y < size; y += 1) {
    const localV = y / Math.max(1, size - 1);
    const v = mapLocalToRegion(localV, bakeRegion.v0, bakeRegion.v1);
    const row = Math.round(v * (terrain.resolution - 1));

    for (let x = 0; x < size; x += 1) {
      const localU = x / Math.max(1, size - 1);
      const u = mapLocalToRegion(localU, bakeRegion.u0, bakeRegion.u1);
      const col = Math.round(u * (terrain.resolution - 1));
      const height = terrain.heights[row * terrain.resolution + col];
      const height01 = clamp((height - terrain.stats.heightMin) / heightRange, 0, 1);
      const terrainNormal = computeTerrainNormal(terrain, row, col, verticalExaggeration);
      let nx = terrainNormal.x * terrainStrength;
      let ny = -terrainNormal.z * terrainStrength;
      let nz = terrainStrength > 0 ? Math.max(0.08, terrainNormal.y) : 1;
      const slope = clamp(1 - terrainNormal.y, 0, 1);
      const weights = getTextureWeights(height01, slope);

      if (textureNormalStrength > 0) {
        const blendedLayerNormal = mixFourNormals(
          sampleNormalTexture(grassNormal, u, v, repeats.grass),
          sampleNormalTexture(dirtNormal, u, v, repeats.dirt),
          sampleNormalTexture(rockNormal, u, v, repeats.rock),
          sampleNormalTexture(snowNormal, u, v, repeats.snow),
          weights,
        );
        nx += blendedLayerNormal[0] * textureNormalStrength * 1.08;
        ny += blendedLayerNormal[1] * textureNormalStrength * 1.08;
        nz += (blendedLayerNormal[2] - 1) * textureNormalStrength * 0.9;
      }

      if (detailNormal && textureNormalStrength > 0) {
        const detail = sampleNormalTexture(detailNormal, u, v, repeats.detail);
        nx += detail[0] * textureNormalStrength;
        ny += detail[1] * textureNormalStrength;
        nz += (detail[2] - 1) * textureNormalStrength * 0.72;
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

function samplePreparedTexture(
  texture: PreparedTexture,
  u: number,
  v: number,
  repeat: TextureRepeat,
) {
  const wrappedU = wrap(u * repeat.u);
  const wrappedV = wrap(v * repeat.v);
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
  repeat: TextureRepeat,
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

function sampleLayerTexture(
  texture: PreparedTexture,
  u: number,
  v: number,
  height: number,
  slope: number,
  repeat: TextureRepeat,
  layer: TerrainDiffuseLayerKey,
) {
  const top = samplePreparedTexture(texture, u, v, repeat);
  const slopeProjection = getSlopeProjectionBlend(layer, slope);

  if (slopeProjection <= 0) {
    return top;
  }

  const heightUv = clamp(height * 1.35, 0, 1);
  const sideA = samplePreparedTexture(texture, u, heightUv, repeat);
  const sideB = samplePreparedTexture(texture, v, heightUv, repeat);
  const side = mixColor(sideA, sideB, 0.5);
  return mixColor(top, side, slopeProjection * 0.82);
}

function getSlopeProjectionBlend(layer: TerrainDiffuseLayerKey, slope: number) {
  if (layer === 'rock') {
    return smoothstep(0.18, 0.78, slope);
  }
  if (layer === 'snow') {
    return smoothstep(0.36, 0.86, slope) * 0.48;
  }
  if (layer === 'dirt') {
    return smoothstep(0.42, 0.86, slope) * 0.28;
  }
  return 0;
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

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
) {
  const amount = clamp(t, 0, 1);
  return [
    lerp(a[0], b[0], amount),
    lerp(a[1], b[1], amount),
    lerp(a[2], b[2], amount),
  ] as [number, number, number];
}

function normalizeNormal(normal: [number, number, number]) {
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  return [
    normal[0] / length,
    normal[1] / length,
    normal[2] / length,
  ] as [number, number, number];
}

function getTextureRepeat(
  terrain: TerrainData,
  settings: TerrainTextureSettings,
  layer?: TerrainDiffuseLayerKey | 'detail',
): TextureRepeat {
  const baseRepeat = Math.max(0.1, settings.repeat);
  const repeatX = Math.max(0.1, settings.repeatX ?? 1);
  const repeatZ = Math.max(0.1, settings.repeatZ ?? 1);
  const layerTiling = getLayerTiling(settings, layer);
  const maxSide = Math.max(1, terrain.width, terrain.depth);

  return {
    u: baseRepeat * (terrain.width / maxSide) * repeatX * layerTiling,
    v: baseRepeat * (terrain.depth / maxSide) * repeatZ * layerTiling,
  };
}

function getTextureRepeats(
  terrain: TerrainData,
  settings: TerrainTextureSettings,
): TextureRepeatsByLayer {
  return {
    grass: getTextureRepeat(terrain, settings, 'grass'),
    dirt: getTextureRepeat(terrain, settings, 'dirt'),
    rock: getTextureRepeat(terrain, settings, 'rock'),
    snow: getTextureRepeat(terrain, settings, 'snow'),
    detail: getTextureRepeat(terrain, settings, 'detail'),
  };
}

function getDiffuseSampleGrid(
  size: number,
  repeats: TextureRepeatsByLayer,
  region: TextureBakeRegion,
) {
  const maxRepeat = getMaxTextureRepeat(
    [repeats.grass, repeats.dirt, repeats.rock, repeats.snow],
    region,
  );
  const pixelsPerRepeat = size / Math.max(1, maxRepeat);
  return size <= 2048 && pixelsPerRepeat < 56 ? 2 : 1;
}

function getMaxTextureRepeat(repeats: TextureRepeat[], region: TextureBakeRegion) {
  const regionWidth = Math.max(0.0001, Math.abs(region.u1 - region.u0));
  const regionHeight = Math.max(0.0001, Math.abs(region.v1 - region.v0));
  return repeats.reduce(
    (max, repeat) => Math.max(max, repeat.u * regionWidth, repeat.v * regionHeight),
    1,
  );
}

function getSafeBakeResolution(resolution: number, maxResolution: number) {
  return Math.max(128, Math.min(maxResolution, Math.round(resolution)));
}

function normalizeBakeRegion(region?: TextureBakeRegion): TextureBakeRegion {
  return {
    u0: clamp(region?.u0 ?? 0, 0, 1),
    u1: clamp(region?.u1 ?? 1, 0, 1),
    v0: clamp(region?.v0 ?? 0, 0, 1),
    v1: clamp(region?.v1 ?? 1, 0, 1),
    resolution: region?.resolution,
  };
}

function mapLocalToRegion(value: number, start: number, end: number) {
  return lerp(start, end, clamp(value, 0, 1));
}

function getLayerTiling(
  settings: TerrainTextureSettings,
  layer?: TerrainDiffuseLayerKey | 'detail',
) {
  switch (layer) {
    case 'grass':
      return Math.max(0.05, settings.grassTiling ?? 1);
    case 'dirt':
      return Math.max(0.05, settings.dirtTiling ?? 1);
    case 'rock':
      return Math.max(0.05, settings.rockTiling ?? 1);
    case 'snow':
      return Math.max(0.05, settings.snowTiling ?? 1);
    default:
      return 1;
  }
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
