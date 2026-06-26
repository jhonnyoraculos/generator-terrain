import type { TerrainData, TerrainParams } from '../types/terrain';
import type { TerrainTextureSettings } from '../types/textures';

export interface TerrainTextureTile {
  index: number;
  x: number;
  z: number;
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  segmentsX: number;
  segmentsZ: number;
}

export function shouldUseTextureBlocks(settings: TerrainTextureSettings) {
  return Boolean(settings.textureBlocksEnabled);
}

export function getTextureBlockSize(
  terrainOrParams: TerrainData | TerrainParams,
  settings: TerrainTextureSettings,
) {
  const terrainSegments = Math.max(1, Math.round(terrainOrParams.resolution) - 1);
  return Math.max(1, Math.min(terrainSegments, Math.round(settings.textureBlockSize || 32)));
}

export function getTextureBlockResolution(settings: TerrainTextureSettings) {
  return Math.max(128, Math.min(4096, Math.round(settings.textureBlockResolution || 1024)));
}

export function createTerrainTextureTiles(
  terrain: TerrainData,
  settings: TerrainTextureSettings,
) {
  const tiles: TerrainTextureTile[] = [];
  const last = terrain.resolution - 1;
  const blockSize = getTextureBlockSize(terrain, settings);
  let index = 0;
  let z = 0;

  for (let startRow = 0; startRow < last; startRow += blockSize) {
    const endRow = Math.min(last, startRow + blockSize);
    let x = 0;

    for (let startCol = 0; startCol < last; startCol += blockSize) {
      const endCol = Math.min(last, startCol + blockSize);
      tiles.push({
        index,
        x,
        z,
        startCol,
        endCol,
        startRow,
        endRow,
        u0: startCol / last,
        u1: endCol / last,
        v0: startRow / last,
        v1: endRow / last,
        segmentsX: endCol - startCol,
        segmentsZ: endRow - startRow,
      });
      index += 1;
      x += 1;
    }

    z += 1;
  }

  return tiles;
}

export function estimateTextureTileCount(
  params: TerrainParams,
  settings: TerrainTextureSettings,
) {
  const terrainSegments = Math.max(1, Math.round(params.resolution) - 1);
  const blockSize = getTextureBlockSize(params, settings);
  const x = Math.ceil(terrainSegments / blockSize);
  const z = Math.ceil(terrainSegments / blockSize);
  return { x, z, total: x * z, blockSize };
}
