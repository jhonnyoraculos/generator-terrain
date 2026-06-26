export type TerrainDiffuseLayerKey = 'grass' | 'dirt' | 'rock' | 'snow';
export type TerrainNormalLayerKey = 'grassNormal' | 'dirtNormal' | 'rockNormal' | 'snowNormal';
export type TextureLayerKey = TerrainDiffuseLayerKey | TerrainNormalLayerKey | 'detailNormal';

export interface TerrainTextureAsset {
  name: string;
  url: string;
  file?: File;
}

export type TerrainTextureSet = Partial<Record<TextureLayerKey, TerrainTextureAsset>>;

export interface TerrainTextureSettings {
  enabled: boolean;
  blendStrength: number;
  repeat: number;
  repeatX: number;
  repeatZ: number;
  bakeResolution: number;
  terrainNormalEnabled: boolean;
  terrainNormalStrength: number;
  detailNormalStrength: number;
  macroVariation: number;
}

export const TEXTURE_LAYER_LABELS: Record<TextureLayerKey, string> = {
  grass: 'Grama / vegetacao',
  grassNormal: 'Normal grama',
  dirt: 'Terra / solo exposto',
  dirtNormal: 'Normal terra',
  rock: 'Pedra / encosta',
  rockNormal: 'Normal pedra',
  snow: 'Neve / topo claro',
  snowNormal: 'Normal neve',
  detailNormal: 'Normal de detalhe',
};
