import type { TerrainData, TerrainMaskData, TerrainParams, TerrainStats } from '../types/terrain';
import {
  SimplexNoise2D,
  clamp,
  createSeededRandom,
  fbm2D,
  lerp,
  ridgedFbm2D,
  smoothstep,
} from './noise';

const MIN_RESOLUTION = 33;
const MAX_RESOLUTION = 513;

export function sanitizeTerrainParams(params: TerrainParams): TerrainParams {
  return {
    ...params,
    seed: params.seed.trim() || 'terrain-forge',
    width: Math.max(1, params.width),
    depth: Math.max(1, params.depth),
    resolution: Math.round(clamp(params.resolution, MIN_RESOLUTION, MAX_RESOLUTION)),
    maxHeight: Math.max(1, params.maxHeight),
    noiseScale: Math.max(1, params.noiseScale),
    octaves: Math.round(clamp(params.octaves, 1, 9)),
    persistence: clamp(params.persistence, 0.1, 0.9),
    lacunarity: clamp(params.lacunarity, 1.2, 3.5),
    smoothing: clamp(params.smoothing, 0, 1),
    mountainIntensity: clamp(params.mountainIntensity, 0, 2.5),
    hillIntensity: clamp(params.hillIntensity, 0, 2),
    erosion: clamp(params.erosion, 0, 1),
    plainLevel: clamp(params.plainLevel, 0, 1),
    valleyStrength: clamp(params.valleyStrength, 0, 1.8),
    randomness: clamp(params.randomness, 0, 1),
    verticalExaggeration: clamp(params.verticalExaggeration, 0.1, 4),
  };
}

export function isUnityFriendlyResolution(resolution: number) {
  const value = resolution - 1;
  return value > 0 && (value & (value - 1)) === 0;
}

export function generateTerrain(
  inputParams: TerrainParams,
  inputTerrainMask?: TerrainMaskData,
): TerrainData {
  const params = sanitizeTerrainParams(inputParams);
  const terrainMask = sanitizeTerrainMask(inputTerrainMask);
  const resolution = params.resolution;
  const count = resolution * resolution;
  const noise = new SimplexNoise2D(params.seed);
  const random = createSeededRandom(`${params.seed}:offsets`);
  const offsetX = random() * 10000 - 5000;
  const offsetZ = random() * 10000 - 5000;
  const heights = new Float32Array(count);

  for (let row = 0; row < resolution; row += 1) {
    const z01 = row / (resolution - 1);
    const worldZ = (z01 - 0.5) * params.depth;

    for (let col = 0; col < resolution; col += 1) {
      const x01 = col / (resolution - 1);
      const worldX = (x01 - 0.5) * params.width;
      const sx = (worldX + offsetX) / params.noiseScale;
      const sz = (worldZ + offsetZ) / params.noiseScale;

      const continent = fbm2D(noise, sx * 0.5, sz * 0.5, 5, 0.54, 2.05) * 0.5 + 0.5;
      const macroRidge = ridgedFbm2D(
        noise,
        sx * 1.05 + 37.1,
        sz * 1.05 - 19.4,
        params.octaves,
        params.persistence,
        params.lacunarity,
      );
      const secondaryRidge = ridgedFbm2D(
        noise,
        sx * 1.8 - 11.9,
        sz * 1.8 + 91.3,
        Math.max(2, params.octaves - 2),
        params.persistence,
        params.lacunarity,
      );
      const hills = fbm2D(
        noise,
        sx * 2.45 + 143.2,
        sz * 2.45 - 88.5,
        Math.max(2, params.octaves - 1),
        0.58,
        2.05,
      ) * 0.5 + 0.5;
      const valleyLines = Math.pow(
        1 - Math.abs(noise.noise2D(sx * 0.85 - 203.4, sz * 0.85 + 73.7)),
        2.8,
      );
      const reliefMask = sampleTerrainMask(terrainMask, x01, z01);
      const reliefStrength = smoothstep(0.02, 0.98, reliefMask);
      const mountainMask = lerp(0.04, 1, reliefStrength);
      const hillMask = lerp(0.1, 1, reliefStrength);
      const valleyMask = lerp(0.28, 1, reliefStrength);
      const highlandMask = smoothstep(0.34, 0.82, continent);
      const plainMask = clamp(
        params.plainLevel * Math.pow(1 - smoothstep(0.18, 0.72, continent), 1.8) +
          (1 - reliefStrength) * 0.7,
        0,
        0.95,
      );

      let height =
        continent * 0.25 +
        Math.pow(hills, 1.4) * params.hillIntensity * 0.24 * hillMask +
        Math.pow(macroRidge, 2.15) *
          params.mountainIntensity *
          (0.48 + highlandMask * 0.72) *
          mountainMask +
        Math.pow(secondaryRidge, 2.5) * params.mountainIntensity * 0.18 * mountainMask -
        valleyLines * params.valleyStrength * (0.16 + highlandMask * 0.34) * valleyMask;

      height = lerp(height, height * 0.22 + continent * 0.06, plainMask);

      const micro = fbm2D(noise, sx * 6.2 + 7.7, sz * 6.2 - 41.2, 3, 0.5, 2.2);
      height += micro * params.randomness * 0.075 * lerp(0.25, 1, reliefStrength);

      if (params.edgeFalloff) {
        const aspectX = params.width >= params.depth ? params.depth / params.width : 1;
        const aspectZ = params.depth >= params.width ? params.width / params.depth : 1;
        const dx = (x01 - 0.5) / aspectX;
        const dz = (z01 - 0.5) / aspectZ;
        const distance = Math.sqrt(dx * dx + dz * dz) * 1.65;
        const falloff = 1 - smoothstep(0.56, 0.94, distance);
        height *= falloff;
      }

      heights[row * resolution + col] = Math.max(0, height);
    }
  }

  normalizeInPlace(heights, 1);
  applySmoothing(heights, resolution, params.smoothing);
  applyThermalErosion(heights, resolution, params.erosion);
  normalizeInPlace(heights, params.maxHeight);

  const stats = createStats(heights, resolution);
  return {
    width: params.width,
    depth: params.depth,
    resolution,
    heights,
    params,
    stats,
    terrainMask,
  };
}

function sanitizeTerrainMask(mask?: TerrainMaskData) {
  if (!mask?.enabled) {
    return undefined;
  }

  const resolution = Math.round(clamp(mask.resolution, 2, 512));
  if (mask.values.length !== resolution * resolution) {
    return undefined;
  }

  const values = new Float32Array(mask.values.length);
  for (let index = 0; index < mask.values.length; index += 1) {
    values[index] = clamp(mask.values[index], 0, 1);
  }

  return {
    enabled: true,
    resolution,
    values,
  };
}

function sampleTerrainMask(mask: TerrainMaskData | undefined, u: number, v: number) {
  if (!mask) {
    return 1;
  }

  const max = mask.resolution - 1;
  const x = clamp(u, 0, 1) * max;
  const y = clamp(v, 0, 1) * max;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(max, x0 + 1);
  const y1 = Math.min(max, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = mask.values[y0 * mask.resolution + x0];
  const b = mask.values[y0 * mask.resolution + x1];
  const c = mask.values[y1 * mask.resolution + x0];
  const d = mask.values[y1 * mask.resolution + x1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function normalizeInPlace(heights: Float32Array, targetMax: number) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const height of heights) {
    min = Math.min(min, height);
    max = Math.max(max, height);
  }

  const range = max - min || 1;
  for (let i = 0; i < heights.length; i += 1) {
    heights[i] = ((heights[i] - min) / range) * targetMax;
  }
}

function applySmoothing(heights: Float32Array, resolution: number, smoothing: number) {
  if (smoothing <= 0) {
    return;
  }

  const iterations = Math.max(1, Math.round(smoothing * 5));
  const blend = 0.12 + smoothing * 0.34;
  const scratch = new Float32Array(heights.length);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    scratch.set(heights);

    for (let row = 1; row < resolution - 1; row += 1) {
      for (let col = 1; col < resolution - 1; col += 1) {
        const index = row * resolution + col;
        const average =
          (scratch[index] * 4 +
            scratch[index - 1] +
            scratch[index + 1] +
            scratch[index - resolution] +
            scratch[index + resolution] +
            scratch[index - resolution - 1] +
            scratch[index - resolution + 1] +
            scratch[index + resolution - 1] +
            scratch[index + resolution + 1]) /
          12;
        heights[index] = lerp(scratch[index], average, blend);
      }
    }
  }
}

function applyThermalErosion(heights: Float32Array, resolution: number, erosion: number) {
  if (erosion <= 0) {
    return;
  }

  const iterations = Math.max(1, Math.round(erosion * 9));
  const talus = 0.022 + (1 - erosion) * 0.035;
  const transferStrength = 0.16 * erosion;
  const delta = new Float32Array(heights.length);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    delta.fill(0);

    for (let row = 1; row < resolution - 1; row += 1) {
      for (let col = 1; col < resolution - 1; col += 1) {
        const index = row * resolution + col;
        const current = heights[index];
        let totalDiff = 0;
        const left = index - 1;
        const right = index + 1;
        const down = index - resolution;
        const up = index + resolution;
        const dLeft = Math.max(0, current - heights[left] - talus);
        const dRight = Math.max(0, current - heights[right] - talus);
        const dDown = Math.max(0, current - heights[down] - talus);
        const dUp = Math.max(0, current - heights[up] - talus);
        totalDiff = dLeft + dRight + dDown + dUp;

        if (totalDiff <= 0) {
          continue;
        }

        const amount = Math.min(current, totalDiff * transferStrength);
        delta[index] -= amount;
        delta[left] += amount * (dLeft / totalDiff);
        delta[right] += amount * (dRight / totalDiff);
        delta[down] += amount * (dDown / totalDiff);
        delta[up] += amount * (dUp / totalDiff);
      }
    }

    for (let i = 0; i < heights.length; i += 1) {
      heights[i] = Math.max(0, heights[i] + delta[i]);
    }
  }
}

function createStats(heights: Float32Array, resolution: number): TerrainStats {
  let heightMin = Number.POSITIVE_INFINITY;
  let heightMax = Number.NEGATIVE_INFINITY;

  for (const height of heights) {
    heightMin = Math.min(heightMin, height);
    heightMax = Math.max(heightMax, height);
  }

  return {
    vertices: resolution * resolution,
    triangles: (resolution - 1) * (resolution - 1) * 2,
    heightMin,
    heightMax,
    unityFriendlyResolution: isUnityFriendlyResolution(resolution),
  };
}
