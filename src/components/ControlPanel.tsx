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
import type { TerrainLodSettings, TerrainParams, TerrainStats, ViewMode } from '../types/terrain';
import type { TerrainPreset } from '../types/terrain';
import type {
  TerrainTextureSettings,
  TerrainTextureSet,
  TextureLayerKey,
} from '../types/textures';
import { TEXTURE_LAYER_LABELS } from '../types/textures';
import { Section, SelectField, SliderField, ToggleField } from './ControlField';

interface ControlPanelProps {
  params: TerrainParams;
  stats?: TerrainStats;
  presets: TerrainPreset[];
  selectedPresetId: string;
  viewMode: ViewMode;
  showGrid: boolean;
  textureSet: TerrainTextureSet;
  textureSettings: TerrainTextureSettings;
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
  onLodSettingsChange: (settings: TerrainLodSettings) => void;
  onGenerate: () => void;
  onRandomSeed: () => void;
  onReset: () => void;
  onExportOBJ: () => void;
  onExportGLB: () => void;
  onExportHeightmap: () => void;
  onExportRaw: () => void;
  onExportNormalMap: () => void;
  onExportZip: () => void;
}

type PanelTab = 'terrain' | 'textures' | 'export';

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: 'shaded', label: 'Shaded' },
  { value: 'solid', label: 'Solido' },
  { value: 'wireframe', label: 'Wireframe' },
];

const textureSlots: TextureLayerKey[] = ['grass', 'dirt', 'rock', 'snow', 'detailNormal'];

export function ControlPanel({
  params,
  stats,
  presets,
  selectedPresetId,
  viewMode,
  showGrid,
  textureSet,
  textureSettings,
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
  onLodSettingsChange,
  onGenerate,
  onRandomSeed,
  onReset,
  onExportOBJ,
  onExportGLB,
  onExportHeightmap,
  onExportRaw,
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
  const exportDisabled = !stats || generating || Boolean(exporting);

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
            <SliderField
              label="LOD perto"
              min={80}
              max={900}
              step={10}
              value={lodSettings.nearDistance}
              suffix="u"
              integer
              onChange={(value) => updateLodSettings('nearDistance', value)}
            />
            <SliderField
              label="LOD medio"
              min={200}
              max={1600}
              step={10}
              value={lodSettings.midDistance}
              suffix="u"
              integer
              onChange={(value) => updateLodSettings('midDistance', value)}
            />
            <SliderField
              label="LOD longe"
              min={400}
              max={2600}
              step={10}
              value={lodSettings.farDistance}
              suffix="u"
              integer
              onChange={(value) => updateLodSettings('farDistance', value)}
            />
            <SliderField
              label="Niveis LOD"
              min={1}
              max={4}
              step={1}
              value={lodSettings.maxLevels}
              integer
              onChange={(value) => updateLodSettings('maxLevels', value)}
            />
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
              label="Repeticao"
              min={1}
              max={24}
              step={1}
              value={textureSettings.repeat}
              integer
              onChange={(value) => updateTextureSettings('repeat', value)}
            />
            <SliderField
              label="Resolucao do bake"
              min={512}
              max={2048}
              step={512}
              value={textureSettings.bakeResolution}
              integer
              onChange={(value) => updateTextureSettings('bakeResolution', value)}
            />
            <div className="texture-list">
              {textureSlots.map((slot) => (
                <TextureDrop
                  key={slot}
                  slot={slot}
                  asset={textureSet[slot]}
                  onFile={onTextureFile}
                />
              ))}
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
