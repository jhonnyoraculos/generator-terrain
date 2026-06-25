import type { TerrainData } from '../types/terrain';

export interface TerrainNormal {
  x: number;
  y: number;
  z: number;
}

export function getHeightAt(heights: Float32Array, resolution: number, row: number, col: number) {
  const safeRow = Math.min(resolution - 1, Math.max(0, row));
  const safeCol = Math.min(resolution - 1, Math.max(0, col));
  return heights[safeRow * resolution + safeCol];
}

export function computeTerrainNormal(
  terrain: TerrainData,
  row: number,
  col: number,
  verticalExaggeration: number,
): TerrainNormal {
  const { heights, resolution, width, depth } = terrain;
  const cellWidth = width / (resolution - 1);
  const cellDepth = depth / (resolution - 1);
  const left = getHeightAt(heights, resolution, row, col - 1) * verticalExaggeration;
  const right = getHeightAt(heights, resolution, row, col + 1) * verticalExaggeration;
  const down = getHeightAt(heights, resolution, row - 1, col) * verticalExaggeration;
  const up = getHeightAt(heights, resolution, row + 1, col) * verticalExaggeration;
  const dx = (right - left) / (2 * cellWidth);
  const dz = (up - down) / (2 * cellDepth);
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const length = Math.hypot(nx, ny, nz) || 1;

  return {
    x: nx / length,
    y: ny / length,
    z: nz / length,
  };
}

export function estimateSlope01(terrain: TerrainData, row: number, col: number, verticalExaggeration: number) {
  const normal = computeTerrainNormal(terrain, row, col, verticalExaggeration);
  return Math.min(1, Math.max(0, 1 - normal.y));
}
