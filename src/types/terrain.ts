export type ViewMode = 'shaded' | 'solid' | 'wireframe';

export interface TerrainParams {
  seed: string;
  width: number;
  depth: number;
  resolution: number;
  maxHeight: number;
  noiseScale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  smoothing: number;
  mountainIntensity: number;
  hillIntensity: number;
  erosion: number;
  plainLevel: number;
  valleyStrength: number;
  randomness: number;
  edgeFalloff: boolean;
  heightColors: boolean;
  verticalExaggeration: number;
}

export interface TerrainStats {
  vertices: number;
  triangles: number;
  heightMin: number;
  heightMax: number;
  unityFriendlyResolution: boolean;
}

export type TerrainLodPreviewMode = 'auto' | 'lod0' | 'lod1' | 'lod2' | 'lod3';

export interface TerrainLodLevelSettings {
  enabled: boolean;
  resolution: number;
  distance: number;
}

export interface TerrainLodSettings {
  enabled: boolean;
  previewMode: TerrainLodPreviewMode;
  levels: TerrainLodLevelSettings[];
}

export interface TerrainData {
  width: number;
  depth: number;
  resolution: number;
  heights: Float32Array;
  params: TerrainParams;
  stats: TerrainStats;
}

export interface TerrainPreset {
  id: string;
  name: string;
  params: TerrainParams;
}

export interface TerrainWorkerRequest {
  id: number;
  params: TerrainParams;
}

export interface TerrainWorkerResponse {
  id: number;
  terrain?: TerrainData;
  error?: string;
}
