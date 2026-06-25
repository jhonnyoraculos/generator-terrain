export type TextureLayerKey = 'grass' | 'dirt' | 'rock' | 'snow' | 'detailNormal';

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
  bakeResolution: number;
  terrainNormalEnabled: boolean;
  terrainNormalStrength: number;
  detailNormalStrength: number;
  macroVariation: number;
}

export const TEXTURE_LAYER_LABELS: Record<TextureLayerKey, string> = {
  grass: 'Grama / vegetacao',
  dirt: 'Terra / solo exposto',
  rock: 'Pedra / encosta',
  snow: 'Neve / topo claro',
  detailNormal: 'Normal de detalhe',
};
