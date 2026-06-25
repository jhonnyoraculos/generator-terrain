import {
  Box,
  Download,
  FileArchive,
  FileImage,
  Grid3X3,
  ImageDown,
  Mountain,
  Package,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import type { TerrainParams, TerrainStats, ViewMode } from '../types/terrain';
import type { TerrainPreset } from '../types/terrain';
import { Section, SelectField, SliderField, ToggleField } from './ControlField';

interface ControlPanelProps {
  params: TerrainParams;
  stats?: TerrainStats;
  presets: TerrainPreset[];
  selectedPresetId: string;
  viewMode: ViewMode;
  showGrid: boolean;
  generating: boolean;
  exporting: string | null;
  warning?: string;
  onParamsChange: (params: TerrainParams) => void;
  onPresetChange: (id: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onGridChange: (showGrid: boolean) => void;
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

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: 'shaded', label: 'Shaded' },
  { value: 'solid', label: 'Sólido' },
  { value: 'wireframe', label: 'Wireframe' },
];

export function ControlPanel({
  params,
  stats,
  presets,
  selectedPresetId,
  viewMode,
  showGrid,
  generating,
  exporting,
  warning,
  onParamsChange,
  onPresetChange,
  onViewModeChange,
  onGridChange,
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
  const update = <K extends keyof TerrainParams>(key: K, value: TerrainParams[K]) => {
    onParamsChange({ ...params, [key]: value });
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

      <Section title="Visualização">
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
          label="Resolução"
          min={33}
          max={513}
          step={1}
          value={params.resolution}
          integer
          onChange={(value) => update('resolution', value)}
        />
        <SliderField
          label="Altura máxima"
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
          label="Planície"
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

      <Section title="Erosão">
        <SliderField
          label="Suavização"
          min={0}
          max={1}
          step={0.01}
          value={params.smoothing}
          onChange={(value) => update('smoothing', value)}
        />
        <SliderField
          label="Erosão"
          min={0}
          max={1}
          step={0.01}
          value={params.erosion}
          onChange={(value) => update('erosion', value)}
        />
      </Section>

      <Section title="Exportação">
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

      <Section title="Informações">
        <dl className="stats-list">
          <div>
            <dt>Vértices</dt>
            <dd>{stats?.vertices.toLocaleString('pt-BR') ?? '-'}</dd>
          </div>
          <div>
            <dt>Triângulos</dt>
            <dd>{stats?.triangles.toLocaleString('pt-BR') ?? '-'}</dd>
          </div>
          <div>
            <dt>Seed atual</dt>
            <dd>{params.seed || '-'}</dd>
          </div>
          <div>
            <dt>Resolução</dt>
            <dd>{params.resolution} x {params.resolution}</dd>
          </div>
          <div>
            <dt>Unity RAW</dt>
            <dd>{stats?.unityFriendlyResolution ? 'compatível' : 'ajustar para 2^n + 1'}</dd>
          </div>
        </dl>
      </Section>
    </aside>
  );
}
