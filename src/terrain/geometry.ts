import * as THREE from 'three';
import type { TerrainData } from '../types/terrain';
import { estimateSlope01 } from './normals';
import { clamp, lerp, smoothstep } from './noise';

export interface TerrainGeometryOptions {
  verticalExaggeration: number;
  includeVertexColors: boolean;
}

const COLOR_LOW = [0.12, 0.32, 0.19] as const;
const COLOR_GRASS = [0.24, 0.45, 0.24] as const;
const COLOR_EARTH = [0.42, 0.34, 0.24] as const;
const COLOR_ROCK = [0.48, 0.49, 0.47] as const;
const COLOR_HIGH_ROCK = [0.62, 0.62, 0.59] as const;
const COLOR_SNOW = [0.9, 0.92, 0.88] as const;

export function createTerrainGeometry(terrain: TerrainData, options: TerrainGeometryOptions) {
  const { width, depth, resolution, heights } = terrain;
  const vertexCount = resolution * resolution;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indexCount = (resolution - 1) * (resolution - 1) * 6;
  const indices =
    vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const heightRange = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);

  let vertexOffset = 0;
  for (let row = 0; row < resolution; row += 1) {
    const z = (row / (resolution - 1) - 0.5) * depth;

    for (let col = 0; col < resolution; col += 1) {
      const index = row * resolution + col;
      const x = (col / (resolution - 1) - 0.5) * width;
      const y = heights[index] * options.verticalExaggeration;
      positions[vertexOffset] = x;
      positions[vertexOffset + 1] = y;
      positions[vertexOffset + 2] = z;

      const normalizedHeight = (heights[index] - terrain.stats.heightMin) / heightRange;
      const slope = estimateSlope01(terrain, row, col, options.verticalExaggeration);
      const color = getHeightColor(normalizedHeight, slope);
      colors[vertexOffset] = color[0];
      colors[vertexOffset + 1] = color[1];
      colors[vertexOffset + 2] = color[2];
      vertexOffset += 3;
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < resolution - 1; row += 1) {
    for (let col = 0; col < resolution - 1; col += 1) {
      const i0 = row * resolution + col;
      const i1 = i0 + 1;
      const i2 = i0 + resolution;
      const i3 = i2 + 1;

      indices[indexOffset] = i0;
      indices[indexOffset + 1] = i2;
      indices[indexOffset + 2] = i1;
      indices[indexOffset + 3] = i1;
      indices[indexOffset + 4] = i2;
      indices[indexOffset + 5] = i3;
      indexOffset += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  if (!options.includeVertexColors) {
    geometry.deleteAttribute('color');
  }

  return geometry;
}

export function getHeightColor(height: number, slope: number): [number, number, number] {
  const h = clamp(height, 0, 1);
  let color: [number, number, number];

  if (h < 0.18) {
    color = mix(COLOR_LOW, COLOR_GRASS, smoothstep(0.02, 0.18, h));
  } else if (h < 0.42) {
    color = mix(COLOR_GRASS, COLOR_EARTH, smoothstep(0.18, 0.42, h));
  } else if (h < 0.7) {
    color = mix(COLOR_EARTH, COLOR_ROCK, smoothstep(0.42, 0.7, h));
  } else if (h < 0.86) {
    color = mix(COLOR_ROCK, COLOR_HIGH_ROCK, smoothstep(0.7, 0.86, h));
  } else {
    color = mix(COLOR_HIGH_ROCK, COLOR_SNOW, smoothstep(0.82, 1, h));
  }

  const exposedRock = smoothstep(0.16, 0.58, slope) * (1 - smoothstep(0.82, 0.98, h) * 0.55);
  return mix(color, COLOR_ROCK, exposedRock);
}

function mix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
