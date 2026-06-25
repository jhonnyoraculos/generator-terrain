import * as THREE from 'three';
import type { TerrainData } from '../types/terrain';
import type { TerrainTextureSettings, TerrainTextureSet, TextureLayerKey } from '../types/textures';
import { getHeightColor } from './geometry';
import { computeTerrainNormal } from './normals';
import { clamp, lerp, smoothstep } from './noise';

interface PreparedTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const FALLBACK_COLORS: Record<Exclude<TextureLayerKey, 'detailNormal'>, [number, number, number]> = {
  grass: [88, 136, 76],
  dirt: [121, 101, 72],
  rock: [132, 128, 116],
  snow: [224, 225, 214],
};

export function hasTerrainTextures(textures: TerrainTextureSet) {
  return Boolean(textures.grass || textures.dirt || textures.rock || textures.snow);
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
      const textured = mixFour(sampledGrass, sampledDirt, sampledRock, sampledSnow, weights);
      const heightColor = getHeightColor(height01, slope).map((value) => value * 255) as [
        number,
        number,
        number,
      ];
      const finalColor = [
        lerp(heightColor[0], textured[0], settings.blendStrength),
        lerp(heightColor[1], textured[1], settings.blendStrength),
        lerp(heightColor[2], textured[2], settings.blendStrength),
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
  const snow = smoothstep(0.78, 0.94, height) * (1 - smoothstep(0.4, 0.72, slope) * 0.35);
  const rock =
    smoothstep(0.42, 0.82, height) * 0.75 +
    smoothstep(0.18, 0.56, slope) * (1 - snow * 0.3);
  const dirt =
    smoothstep(0.08, 0.28, height) * (1 - smoothstep(0.58, 0.86, height)) * 0.95 +
    smoothstep(0.18, 0.42, slope) * 0.35;
  const grass = Math.max(0.08, 1 - snow * 1.2 - rock * 0.55 - dirt * 0.25);
  const total = grass + dirt + rock + snow || 1;

  return {
    grass: grass / total,
    dirt: dirt / total,
    rock: rock / total,
    snow: snow / total,
  };
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
  const x = Math.floor(wrappedU * texture.width) % texture.width;
  const y = Math.floor(wrappedV * texture.height) % texture.height;
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

function wrap(value: number) {
  return value - Math.floor(value);
}
