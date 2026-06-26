import {
  Box,
  Download,
  FileArchive,
  FileImage,
  Grid3X3,
  Image as ImageIcon,
  ImageDown,
  Mountain,
  Package,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Shuffle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type {
  TerrainLodLevelSettings,
  TerrainLodPreviewMode,
  TerrainLodSettings,
  TerrainMaskData,
  TerrainParams,
  TerrainStats,
  ViewMode,
} from '../types/terrain';
import type { TerrainPreset } from '../types/terrain';
import type {
  TerrainTextureSettings,
  TerrainTextureSet,
  TextureLayerKey,
} from '../types/textures';
import { TEXTURE_LAYER_LABELS } from '../types/textures';
import { estimateTextureTileCount, getTextureBlockSize } from '../terrain/tiles';
import { Section, SelectField, SliderField, ToggleField } from './ControlField';
import { MaskPainter } from './MaskPainter';

interface ControlPanelProps {
  params: TerrainParams;
  stats?: TerrainStats;
  presets: TerrainPreset[];
  selectedPresetId: string;
  viewMode: ViewMode;
  showGrid: boolean;
  textureSet: TerrainTextureSet;
  textureSettings: TerrainTextureSettings;
  terrainMask: TerrainMaskData;
  lodSettings: TerrainLodSettings;
  generating: boolean;
  exporting: string | null;
  warning?: string;
  onParamsChange: (params: TerrainParams) => void;
  onPresetChange: (id: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onGridChange: (showGrid: boolean) => void;
  onTextureSettingsChange: (settings: TerrainTextureSettings) => void;
  onTextureFile: (slot: TextureLayerKey, file: File | null) => void;
  onTerrainMaskChange: (mask: TerrainMaskData) => void;
  onLodSettingsChange: (settings: TerrainLodSettings) => void;
  onGenerate: () => void;
  onRandomSeed: () => void;
  onReset: () => void;
  onExportOBJ: () => void;
  onExportGLB: () => void;
  onExportHeightmap: () => void;
  onExportRaw: () => void;
  onExportTextureMap: () => void;
  onExportNormalMap: () => void;
  onExportZip: () => void;
}

type PanelTab = 'terrain' | 'paint' | 'textures' | 'export';
type TextureTilingKey = 'grassTiling' | 'dirtTiling' | 'rockTiling' | 'snowTiling';

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: 'shaded', label: 'Shaded' },
  { value: 'solid', label: 'Solido' },
  { value: 'wireframe', label: 'Wireframe' },
];

const lodPreviewModes: Array<{ value: TerrainLodPreviewMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'lod0', label: 'LOD 0' },
  { value: 'lod1', label: 'LOD 1' },
  { value: 'lod2', label: 'LOD 2' },
  { value: 'lod3', label: 'LOD 3' },
];

const textureLayerGroups: Array<{
  label: string;
  diffuse: TextureLayerKey;
  normal: TextureLayerKey;
  tilingKey: TextureTilingKey;
}> = [
  {
    label: 'Grama / vegetacao',
    diffuse: 'grass',
    normal: 'grassNormal',
    tilingKey: 'grassTiling',
  },
  {
    label: 'Terra / solo exposto',
    diffuse: 'dirt',
    normal: 'dirtNormal',
    tilingKey: 'dirtTiling',
  },
  {
    label: 'Pedra / encosta',
    diffuse: 'rock',
    normal: 'rockNormal',
    tilingKey: 'rockTiling',
  },
  {
    label: 'Neve / topo claro',
    diffuse: 'snow',
    normal: 'snowNormal',
    tilingKey: 'snowTiling',
  },
];

export function ControlPanel({
  params,
  stats,
  presets,
  selectedPresetId,
  viewMode,
  showGrid,
  textureSet,
  textureSettings,
  terrainMask,
  lodSettings,
  generating,
  exporting,
  warning,
  onParamsChange,
  onPresetChange,
  onViewModeChange,
  onGridChange,
  onTextureSettingsChange,
  onTextureFile,
  onTerrainMaskChange,
  onLodSettingsChange,
  onGenerate,
  onRandomSeed,
  onReset,
  onExportOBJ,
  onExportGLB,
  onExportHeightmap,
  onExportRaw,
  onExportTextureMap,
  onExportNormalMap,
  onExportZip,
}: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('terrain');
  const update = <K extends keyof TerrainParams>(key: K, value: TerrainParams[K]) => {
    onParamsChange({ ...params, [key]: value });
  };
  const updateTextureSettings = <K extends keyof TerrainTextureSettings>(
    key: K,
    value: TerrainTextureSettings[K],
  ) => {
    onTextureSettingsChange({ ...textureSettings, [key]: value });
  };
  const updateLodSettings = <K extends keyof TerrainLodSettings>(
    key: K,
    value: TerrainLodSettings[K],
  ) => {
    onLodSettingsChange({ ...lodSettings, [key]: value });
  };
  const lodPreviewMode = lodSettings.previewMode ?? 'auto';
  const lodLevels = normalizeLodLevels(lodSettings.levels ?? [], params.resolution);
  const updateLodLevel = (index: number, patch: Partial<TerrainLodLevelSettings>) => {
    const nextLevels = lodLevels.map((level, levelIndex) => {
      if (levelIndex !== index) {
        return level;
      }

      return {
        ...level,
        ...patch,
        enabled: levelIndex === 0 ? true : (patch.enabled ?? level.enabled),
        resolution: clampLodResolution(patch.resolution ?? level.resolution, params.resolution),
        distance: levelIndex === 0 ? 0 : Math.max(1, Math.round(patch.distance ?? level.distance)),
      };
    });
    onLodSettingsChange({ ...lodSettings, levels: nextLevels });
  };
  const exportDisabled = !stats || generating || Boolean(exporting);
  const bakeQuality = estimateTextureBakeQuality(params, textureSettings);

  return (
    <aside className="sidebar">
      <div className="brand">
        <Mountain size={30} aria-hidden="true" />
        <div>
          <h1>Terrain Forge</h1>
          <span>Procedural terrain toolkit</span>
        </div>
      </div>

      <div className="action-grid">
        <button className="primary-button" onClick={onGenerate} disabled={generating}>
          <RefreshCw size={17} aria-hidden="true" />
          {generating ? 'Gerando' : 'Gerar'}
        </button>
        <button onClick={onRandomSeed}>
          <Shuffle size={17} aria-hidden="true" />
          Random seed
        </button>
        <button onClick={onReset}>
          <RotateCcw size={17} aria-hidden="true" />
          Reset
        </button>
      </div>

      {warning ? <div className="warning">{warning}</div> : null}

      <div className="panel-tabs" role="tablist" aria-label="Painel Terrain Forge">
        <button
          className={activeTab === 'terrain' ? 'active' : ''}
          onClick={() => setActiveTab('terrain')}
          role="tab"
          aria-selected={activeTab === 'terrain'}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          Terreno
        </button>
        <button
          className={activeTab === 'paint' ? 'active' : ''}
          onClick={() => setActiveTab('paint')}
          role="tab"
          aria-selected={activeTab === 'paint'}
        >
          <Paintbrush size={15} aria-hidden="true" />
          Pintura
        </button>
        <button
          className={activeTab === 'textures' ? 'active' : ''}
          onClick={() => setActiveTab('textures')}
          role="tab"
          aria-selected={activeTab === 'textures'}
        >
          <Paintbrush size={15} aria-hidden="true" />
          Texturas
        </button>
        <button
          className={activeTab === 'export' ? 'active' : ''}
          onClick={() => setActiveTab('export')}
          role="tab"
          aria-selected={activeTab === 'export'}
        >
          <Download size={15} aria-hidden="true" />
          Exportar
        </button>
      </div>

      {activeTab === 'terrain' ? (
        <div className="tab-body" role="tabpanel">
          <Section title="Presets">
            <div className="preset-grid">
              {presets.map((preset) => (
                <button
                  className={preset.id === selectedPresetId ? 'preset-button active' : 'preset-button'}
                  key={preset.id}
                  onClick={() => onPresetChange(preset.id)}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {preset.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Visualizacao">
            <SelectField label="Modo" value={viewMode} options={viewModes} onChange={onViewModeChange} />
            <ToggleField label="Grid" checked={showGrid} onChange={onGridChange} />
            <ToggleField
              label="Cores por altura"
              checked={params.heightColors}
              onChange={(value) => update('heightColors', value)}
            />
            <SliderField
              label="Exagero vertical"
              min={0.2}
              max={3}
              step={0.05}
              value={params.verticalExaggeration}
              onChange={(value) => update('verticalExaggeration', value)}
            />
            <ToggleField
              label="LOD dinamico"
              checked={lodSettings.enabled}
              onChange={(value) => updateLodSettings('enabled', value)}
            />
            <SelectField
              label="Preview LOD"
              value={lodPreviewMode}
              options={lodPreviewModes}
              onChange={(value) => updateLodSettings('previewMode', value)}
            />
            <div className="lod-level-list">
              {lodLevels.map((level, index) => (
                <LodLevelEditor
                  key={index}
                  index={index}
                  level={level}
                  maxResolution={params.resolution}
                  onChange={(patch) => updateLodLevel(index, patch)}
                />
              ))}
            </div>
          </Section>

          <Section title="Tamanho">
            <label className="field">
              <span className="field__label">Seed</span>
              <input
                value={params.seed}
                onChange={(event) => update('seed', event.target.value)}
                spellCheck={false}
              />
            </label>
            <SliderField
              label="Largura"
              min={64}
              max={1200}
              step={1}
              value={params.width}
              suffix="u"
              integer
              onChange={(value) => update('width', value)}
            />
            <SliderField
              label="Profundidade"
              min={64}
              max={1200}
              step={1}
              value={params.depth}
              suffix="u"
              integer
              onChange={(value) => update('depth', value)}
            />
            <SliderField
              label="Resolucao"
              min={33}
              max={513}
              step={1}
              value={params.resolution}
              integer
              onChange={(value) => update('resolution', value)}
            />
            <SliderField
              label="Altura maxima"
              min={5}
              max={320}
              step={1}
              value={params.maxHeight}
              suffix="u"
              integer
              onChange={(value) => update('maxHeight', value)}
            />
          </Section>

          <Section title="Forma">
            <SliderField
              label="Montanhas"
              min={0}
              max={2.5}
              step={0.01}
              value={params.mountainIntensity}
              onChange={(value) => update('mountainIntensity', value)}
            />
            <SliderField
              label="Morros"
              min={0}
              max={2}
              step={0.01}
              value={params.hillIntensity}
              onChange={(value) => update('hillIntensity', value)}
            />
            <SliderField
              label="Vales"
              min={0}
              max={1.8}
              step={0.01}
              value={params.valleyStrength}
              onChange={(value) => update('valleyStrength', value)}
            />
            <SliderField
              label="Planicie"
              min={0}
              max={1}
              step={0.01}
              value={params.plainLevel}
              onChange={(value) => update('plainLevel', value)}
            />
            <ToggleField
              label="Falloff nas bordas"
              checked={params.edgeFalloff}
              onChange={(value) => update('edgeFalloff', value)}
            />
          </Section>

          <Section title="Noise">
            <SliderField
              label="Escala"
              min={40}
              max={420}
              step={1}
              value={params.noiseScale}
              integer
              onChange={(value) => update('noiseScale', value)}
            />
            <SliderField
              label="Octaves"
              min={1}
              max={9}
              step={1}
              value={params.octaves}
              integer
              onChange={(value) => update('octaves', value)}
            />
            <SliderField
              label="Persistence"
              min={0.1}
              max={0.9}
              step={0.01}
              value={params.persistence}
              onChange={(value) => update('persistence', value)}
            />
            <SliderField
              label="Lacunarity"
              min={1.2}
              max={3.5}
              step={0.01}
              value={params.lacunarity}
              onChange={(value) => update('lacunarity', value)}
            />
            <SliderField
              label="Aleatoriedade"
              min={0}
              max={1}
              step={0.01}
              value={params.randomness}
              onChange={(value) => update('randomness', value)}
            />
          </Section>

          <Section title="Erosao">
            <SliderField
              label="Suavizacao"
              min={0}
              max={1}
              step={0.01}
              value={params.smoothing}
              onChange={(value) => update('smoothing', value)}
            />
            <SliderField
              label="Erosao"
              min={0}
              max={1}
              step={0.01}
              value={params.erosion}
              onChange={(value) => update('erosion', value)}
            />
          </Section>
        </div>
      ) : null}

      {activeTab === 'paint' ? (
        <div className="tab-body" role="tabpanel">
          <Section title="Mascara de relevo">
            <MaskPainter mask={terrainMask} onChange={onTerrainMaskChange} />
          </Section>
        </div>
      ) : null}

      {activeTab === 'textures' ? (
        <div className="tab-body" role="tabpanel">
          <Section title="Texturas">
            <ToggleField
              label="Usar texturas"
              checked={textureSettings.enabled}
              onChange={(value) => updateTextureSettings('enabled', value)}
            />
            <SliderField
              label="Mistura"
              min={0}
              max={1}
              step={0.01}
              value={textureSettings.blendStrength}
              onChange={(value) => updateTextureSettings('blendStrength', value)}
            />
            <SliderField
              label="Repeticao geral"
              min={0.5}
              max={64}
              step={0.5}
              value={textureSettings.repeat}
              onChange={(value) => updateTextureSettings('repeat', value)}
            />
            <SliderField
              label="Tiling X"
              min={0.25}
              max={8}
              step={0.05}
              value={textureSettings.repeatX ?? 1}
              onChange={(value) => updateTextureSettings('repeatX', value)}
            />
            <SliderField
              label="Tiling Z"
              min={0.25}
              max={8}
              step={0.05}
              value={textureSettings.repeatZ ?? 1}
              onChange={(value) => updateTextureSettings('repeatZ', value)}
            />
            <SliderField
              label="Resolucao do bake"
              min={512}
              max={8192}
              step={512}
              value={textureSettings.bakeResolution}
              integer
              onChange={(value) => updateTextureSettings('bakeResolution', value)}
            />
            <ToggleField
              label="Textura por blocos"
              checked={textureSettings.textureBlocksEnabled}
              onChange={(value) => updateTextureSettings('textureBlocksEnabled', value)}
            />
            {textureSettings.textureBlocksEnabled ? (
              <>
                <SliderField
                  label="Tamanho do bloco"
                  min={8}
                  max={128}
                  step={8}
                  value={getTextureBlockSize(params, textureSettings)}
                  suffix=" seg"
                  integer
                  onChange={(value) => updateTextureSettings('textureBlockSize', value)}
                />
                <SliderField
                  label="Resolucao por bloco"
                  min={256}
                  max={4096}
                  step={256}
                  value={textureSettings.textureBlockResolution}
                  integer
                  onChange={(value) => updateTextureSettings('textureBlockResolution', value)}
                />
              </>
            ) : null}
            <div className={`texture-quality texture-quality--${bakeQuality.status}`}>
              <div>
                <strong>Qualidade do bake</strong>
                <span>{bakeQuality.label}</span>
              </div>
              <p>{bakeQuality.message}</p>
              {bakeQuality.recommendedResolution > bakeQuality.currentResolution ? (
                <button
                  onClick={() =>
                    updateTextureSettings(
                      bakeQuality.resolutionKey,
                      bakeQuality.recommendedResolution,
                    )
                  }
                >
                  Usar {bakeQuality.recommendedResolution}px
                </button>
              ) : null}
            </div>
            <SliderField
              label="Variacao macro"
              min={0}
              max={0.7}
              step={0.01}
              value={textureSettings.macroVariation}
              onChange={(value) => updateTextureSettings('macroVariation', value)}
            />
            <ToggleField
              label="Normal do terreno no preview"
              checked={textureSettings.terrainNormalEnabled}
              onChange={(value) => updateTextureSettings('terrainNormalEnabled', value)}
            />
            <SliderField
              label="Forca normal terreno"
              min={0}
              max={3}
              step={0.01}
              value={textureSettings.terrainNormalStrength}
              onChange={(value) => updateTextureSettings('terrainNormalStrength', value)}
            />
            <SliderField
              label="Forca normal maps"
              min={0}
              max={3}
              step={0.01}
              value={textureSettings.detailNormalStrength}
              onChange={(value) => updateTextureSettings('detailNormalStrength', value)}
            />
            <div className="texture-list">
              {textureLayerGroups.map((layer) => (
                <div className="texture-layer-group" key={layer.diffuse}>
                  <div className="texture-layer-title">
                    <strong>{layer.label}</strong>
                    <span>Diffuse + normal map</span>
                  </div>
                  <SliderField
                    label="Tiling da camada"
                    min={0.1}
                    max={4}
                    step={0.05}
                    value={textureSettings[layer.tilingKey] ?? 1}
                    onChange={(value) =>
                      onTextureSettingsChange({ ...textureSettings, [layer.tilingKey]: value })
                    }
                  />
                  <TextureDrop
                    slot={layer.diffuse}
                    asset={textureSet[layer.diffuse]}
                    onFile={onTextureFile}
                  />
                  <TextureDrop
                    slot={layer.normal}
                    asset={textureSet[layer.normal]}
                    onFile={onTextureFile}
                  />
                </div>
              ))}
              <div className="texture-layer-group">
                <div className="texture-layer-title">
                  <strong>Normal global</strong>
                  <span>Detalhe extra repetido por cima do terreno</span>
                </div>
                <TextureDrop
                  slot="detailNormal"
                  asset={textureSet.detailNormal}
                  onFile={onTextureFile}
                />
              </div>
            </div>
          </Section>
        </div>
      ) : null}

      {activeTab === 'export' ? (
        <div className="tab-body" role="tabpanel">
          <Section title="Exportacao">
            <div className="export-grid">
              <button onClick={onExportOBJ} disabled={exportDisabled}>
                <Box size={16} aria-hidden="true" />
                OBJ
              </button>
              <button onClick={onExportGLB} disabled={exportDisabled}>
                <Package size={16} aria-hidden="true" />
                GLB
              </button>
              <button onClick={onExportHeightmap} disabled={exportDisabled}>
                <ImageDown size={16} aria-hidden="true" />
                Heightmap
              </button>
              <button onClick={onExportRaw} disabled={exportDisabled}>
                <FileImage size={16} aria-hidden="true" />
                R16
              </button>
              <button onClick={onExportTextureMap} disabled={exportDisabled}>
                <ImageIcon size={16} aria-hidden="true" />
                Textura
              </button>
              <button onClick={onExportNormalMap} disabled={exportDisabled}>
                <Grid3X3 size={16} aria-hidden="true" />
                Normal
              </button>
              <button className="primary-button" onClick={onExportZip} disabled={exportDisabled}>
                <FileArchive size={16} aria-hidden="true" />
                ZIP
              </button>
            </div>
            {exporting ? (
              <div className="export-status">
                <Download size={14} aria-hidden="true" />
                Exportando {exporting}
              </div>
            ) : null}
          </Section>

          <Section title="Informacoes">
            <dl className="stats-list">
              <div>
                <dt>Vertices</dt>
                <dd>{stats?.vertices.toLocaleString('pt-BR') ?? '-'}</dd>
              </div>
              <div>
                <dt>Triangulos</dt>
                <dd>{stats?.triangles.toLocaleString('pt-BR') ?? '-'}</dd>
              </div>
              <div>
                <dt>Seed atual</dt>
                <dd>{params.seed || '-'}</dd>
              </div>
              <div>
                <dt>Resolucao</dt>
                <dd>{params.resolution} x {params.resolution}</dd>
              </div>
              <div>
                <dt>Unity RAW</dt>
                <dd>{stats?.unityFriendlyResolution ? 'compativel' : 'ajustar para 2^n + 1'}</dd>
              </div>
            </dl>
          </Section>
        </div>
      ) : null}
    </aside>
  );
}

function estimateTextureBakeQuality(
  params: TerrainParams,
  settings: TerrainTextureSettings,
) {
  const textureTiles = estimateTextureTileCount(params, settings);
  const baseRepeat = Math.max(0.1, settings.repeat);
  const repeatX = Math.max(0.1, settings.repeatX ?? 1);
  const repeatZ = Math.max(0.1, settings.repeatZ ?? 1);
  const maxSide = Math.max(1, params.width, params.depth);
  const aspectX = params.width / maxSide;
  const aspectZ = params.depth / maxSide;
  const tilings = [
    Math.max(0.05, settings.grassTiling ?? 1),
    Math.max(0.05, settings.dirtTiling ?? 1),
    Math.max(0.05, settings.rockTiling ?? 1),
    Math.max(0.05, settings.snowTiling ?? 1),
  ];
  const maxRepeat = tilings.reduce(
    (max, tiling) =>
      Math.max(max, baseRepeat * aspectX * repeatX * tiling, baseRepeat * aspectZ * repeatZ * tiling),
    1,
  );
  const usingBlocks = settings.textureBlocksEnabled;
  const blockFraction = usingBlocks
    ? textureTiles.blockSize / Math.max(1, Math.round(params.resolution) - 1)
    : 1;
  const repeatsPerTexture = Math.max(1, maxRepeat * blockFraction);
  const resolutionKey: 'bakeResolution' | 'textureBlockResolution' = usingBlocks
    ? 'textureBlockResolution'
    : 'bakeResolution';
  const currentResolution = usingBlocks
    ? Math.max(128, Math.min(4096, settings.textureBlockResolution))
    : Math.max(128, Math.min(8192, settings.bakeResolution));
  const pixelsPerRepeat = Math.max(
    1,
    Math.floor(currentResolution / repeatsPerTexture),
  );
  const recommendedResolution = usingBlocks
    ? clampBlockResolution(Math.ceil((repeatsPerTexture * 96) / 256) * 256)
    : clampBakeResolution(Math.ceil((repeatsPerTexture * 96) / 512) * 512);
  const label = usingBlocks
    ? `${pixelsPerRepeat} px / rep - ${textureTiles.total} blocos`
    : `${pixelsPerRepeat} px / repeticao`;

  if (pixelsPerRepeat < 48) {
    return {
      status: 'low',
      label,
      pixelsPerRepeat,
      recommendedResolution,
      currentResolution,
      resolutionKey,
      message: usingBlocks
        ? 'Baixa: aumente a resolucao por bloco ou diminua o tiling.'
        : 'Baixa: o tiling esta alto demais para a resolucao atual.',
    };
  }
  if (pixelsPerRepeat < 96) {
    return {
      status: 'medium',
      label,
      pixelsPerRepeat,
      recommendedResolution,
      currentResolution,
      resolutionKey,
      message: usingBlocks
        ? 'Media: boa para distancia media; suba o bloco para close-up.'
        : 'Media: use um bake maior para close-up.',
    };
  }
  return {
    status: 'high',
    label,
    pixelsPerRepeat,
    recommendedResolution,
    currentResolution,
    resolutionKey,
    message: usingBlocks
      ? 'Alta: os blocos mantem boa densidade de textura.'
      : 'Alta: boa densidade para textura unica.',
  };
}

function clampBakeResolution(resolution: number) {
  return Math.max(512, Math.min(8192, Math.round(resolution)));
}

function clampBlockResolution(resolution: number) {
  return Math.max(256, Math.min(4096, Math.round(resolution)));
}

function LodLevelEditor({
  index,
  level,
  maxResolution,
  onChange,
}: {
  index: number;
  level: TerrainLodLevelSettings;
  maxResolution: number;
  onChange: (patch: Partial<TerrainLodLevelSettings>) => void;
}) {
  const resolution = clampLodResolution(level.resolution, maxResolution);
  const stats = estimateLodStats(resolution);
  const maxStats = estimateLodStats(maxResolution);

  return (
    <div className={level.enabled ? 'lod-level-editor' : 'lod-level-editor muted'}>
      <div className="lod-level-header">
        <strong>LOD {index}</strong>
        <span>
          {stats.vertices.toLocaleString('pt-BR')} v /{' '}
          {stats.triangles.toLocaleString('pt-BR')} pol
        </span>
      </div>
      {index > 0 ? (
        <ToggleField
          label="Ativo"
          checked={level.enabled}
          onChange={(value) => onChange({ enabled: value })}
        />
      ) : null}
      <SliderField
        label="Resolucao"
        min={3}
        max={Math.max(3, maxResolution)}
        step={1}
        value={resolution}
        integer
        onChange={(value) => onChange({ resolution: value })}
      />
      <label className="field">
        <span className="field__label">
          Poligonos alvo
          <output>{stats.triangles.toLocaleString('pt-BR')}</output>
        </span>
        <input
          className="number-input"
          type="number"
          min={8}
          max={maxStats.triangles}
          step={2}
          value={stats.triangles}
          onChange={(event) =>
            onChange({
              resolution: estimateResolutionFromTriangles(Number(event.target.value), maxResolution),
            })
          }
        />
      </label>
      {index > 0 ? (
        <SliderField
          label="Distancia"
          min={40}
          max={3000}
          step={10}
          value={level.distance}
          suffix="u"
          integer
          onChange={(value) => onChange({ distance: value })}
        />
      ) : null}
    </div>
  );
}

function normalizeLodLevels(
  levels: TerrainLodLevelSettings[],
  terrainResolution: number,
): TerrainLodLevelSettings[] {
  return [0, 1, 2, 3].map((index) => {
    const fallback = createFallbackLodLevel(index, terrainResolution);
    const level = levels[index] ?? fallback;
    return {
      enabled: index === 0 ? true : level.enabled,
      resolution: clampLodResolution(level.resolution, terrainResolution),
      distance: index === 0 ? 0 : Math.max(1, Math.round(level.distance)),
    };
  });
}

function createFallbackLodLevel(index: number, terrainResolution: number): TerrainLodLevelSettings {
  const dividers = [1, 2, 4, 8];
  const distances = [0, 360, 760, 1250];
  const safeResolution = Math.max(3, Math.round(terrainResolution));
  const divider = dividers[index] ?? 8;
  return {
    enabled: true,
    resolution: clampLodResolution(Math.round((safeResolution - 1) / divider) + 1, safeResolution),
    distance: distances[index] ?? 1250,
  };
}

function estimateLodStats(resolution: number) {
  const safeResolution = Math.max(3, Math.round(resolution));
  return {
    vertices: safeResolution * safeResolution,
    triangles: (safeResolution - 1) * (safeResolution - 1) * 2,
  };
}

function estimateResolutionFromTriangles(triangles: number, terrainResolution: number) {
  const safeTriangles = Number.isFinite(triangles) ? Math.max(8, triangles) : 8;
  return clampLodResolution(Math.round(Math.sqrt(safeTriangles / 2) + 1), terrainResolution);
}

function clampLodResolution(resolution: number, terrainResolution: number) {
  return Math.max(3, Math.min(Math.round(terrainResolution), Math.round(resolution)));
}

function TextureDrop({
  slot,
  asset,
  onFile,
}: {
  slot: TextureLayerKey;
  asset?: TerrainTextureSet[TextureLayerKey];
  onFile: (slot: TextureLayerKey, file: File | null) => void;
}) {
  return (
    <div className="texture-drop">
      <label>
        <span
          className="texture-preview"
          style={asset?.url ? { backgroundImage: `url(${asset.url})` } : undefined}
        >
          {!asset?.url ? <ImageIcon size={18} aria-hidden="true" /> : null}
        </span>
        <span className="texture-meta">
          <strong>{TEXTURE_LAYER_LABELS[slot]}</strong>
          <em>{asset?.name ?? 'Nenhum arquivo'}</em>
        </span>
        <Upload size={16} aria-hidden="true" />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          onChange={(event) => {
            onFile(slot, event.target.files?.[0] ?? null);
            event.currentTarget.value = '';
            event.currentTarget.blur();
            window.requestAnimationFrame(() => window.scrollTo(0, 0));
          }}
        />
      </label>
      {asset ? (
        <button className="icon-button" title="Remover textura" onClick={() => onFile(slot, null)}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
