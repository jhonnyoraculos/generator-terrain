import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { ControlPanel } from './components/ControlPanel';
import { TerrainViewer, type TerrainViewerHandle } from './components/TerrainViewer';
import {
  downloadGLB,
  downloadHeightmapPNG,
  downloadNormalMapPNG,
  downloadOBJ,
  downloadR16,
  downloadTerrainTexturePNG,
  downloadTerrainZip,
} from './exporters/exporters';
import { DEFAULT_TERRAIN_PARAMS, TERRAIN_PRESETS } from './presets/presets';
import { generateTerrain, sanitizeTerrainParams } from './terrain/generator';
import type {
  TerrainData,
  TerrainLodLevelSettings,
  TerrainLodSettings,
  TerrainMaskData,
  TerrainParams,
  TerrainWorkerResponse,
  ViewMode,
} from './types/terrain';
import type {
  TerrainTextureAsset,
  TerrainTextureSettings,
  TerrainTextureSet,
  TextureLayerKey,
} from './types/textures';

const DEFAULT_TEXTURE_SETTINGS: TerrainTextureSettings = {
  enabled: false,
  blendStrength: 0.94,
  repeat: 12,
  repeatX: 1,
  repeatZ: 1,
  grassTiling: 1.1,
  dirtTiling: 0.95,
  rockTiling: 0.72,
  snowTiling: 0.85,
  bakeResolution: 2048,
  textureBlocksEnabled: true,
  textureBlockSize: 32,
  textureBlockResolution: 1024,
  terrainNormalEnabled: true,
  terrainNormalStrength: 1.15,
  detailNormalStrength: 1.05,
  macroVariation: 0.16,
};

const DEFAULT_LOD_SETTINGS: TerrainLodSettings = createDefaultLodSettings(
  DEFAULT_TERRAIN_PARAMS.resolution,
);

export function App() {
  const [params, setParams] = useState<TerrainParams>(DEFAULT_TERRAIN_PARAMS);
  const [terrain, setTerrain] = useState<TerrainData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('shaded');
  const [showGrid, setShowGrid] = useState(true);
  const [textureSet, setTextureSet] = useState<TerrainTextureSet>({});
  const [textureSettings, setTextureSettings] =
    useState<TerrainTextureSettings>(DEFAULT_TEXTURE_SETTINGS);
  const [terrainMask, setTerrainMask] = useState<TerrainMaskData>(() => createDefaultTerrainMask());
  const [lodSettings, setLodSettings] = useState<TerrainLodSettings>(DEFAULT_LOD_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<TerrainViewerHandle | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const latestRequestRef = useRef(0);
  const textureSetRef = useRef<TerrainTextureSet>({});

  useEffect(() => {
    let worker: Worker | null = null;

    try {
      worker = new Worker(new URL('./terrain/terrain.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
      return undefined;
    }

    worker.onmessage = ({ data }: MessageEvent<TerrainWorkerResponse>) => {
      if (data.id !== latestRequestRef.current) {
        return;
      }

      if (data.error) {
        setError(data.error);
        setGenerating(false);
        return;
      }

      if (data.terrain) {
        setTerrain(data.terrain);
        setError(null);
      }
      setGenerating(false);
    };

    worker.onerror = (event) => {
      setError(event.message || 'Erro no worker de terreno.');
      setGenerating(false);
    };

    return () => worker?.terminate();
  }, []);

  useEffect(() => {
    textureSetRef.current = textureSet;
  }, [textureSet]);

  useEffect(() => {
    return () => {
      Object.values(textureSetRef.current).forEach((asset) => {
        if (asset?.url) {
          URL.revokeObjectURL(asset.url);
        }
      });
    };
  }, []);

  const requestGenerate = useCallback(
    (nextParams: TerrainParams, nextTerrainMask?: TerrainMaskData) => {
      const sanitized = sanitizeTerrainParams(nextParams);
      const generationMask = cloneTerrainMask(nextTerrainMask);
      const id = latestRequestRef.current + 1;
      latestRequestRef.current = id;
      setGenerating(true);
      setError(null);

      if (workerRef.current) {
        workerRef.current.postMessage({ id, params: sanitized, terrainMask: generationMask });
        return;
      }

      window.setTimeout(() => {
        try {
          const nextTerrain = generateTerrain(sanitized, generationMask);
          if (id === latestRequestRef.current) {
            setTerrain(nextTerrain);
            setGenerating(false);
          }
        } catch (generationError) {
          if (id === latestRequestRef.current) {
            setError(
              generationError instanceof Error
                ? generationError.message
                : 'Falha desconhecida ao gerar terreno.',
            );
            setGenerating(false);
          }
        }
      }, 0);
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => requestGenerate(params, terrainMask), 320);
    return () => window.clearTimeout(timeout);
  }, [params, terrainMask, requestGenerate]);

  const warning = useMemo(() => {
    const vertices = params.resolution * params.resolution;
    if (vertices > 140000) {
      return 'Resolução muito alta: a geração e exportação podem levar alguns segundos.';
    }
    if (!isUnityFriendly(params.resolution)) {
      return 'Para Terrain RAW na Unity, prefira resoluções 33, 65, 129, 257 ou 513.';
    }
    return undefined;
  }, [params.resolution]);

  const handleParamsChange = (nextParams: TerrainParams) => {
    setSelectedPresetId('');
    if (nextParams.resolution !== params.resolution) {
      setLodSettings((current) =>
        adaptLodSettingsToResolution(current, params.resolution, nextParams.resolution),
      );
    }
    setParams(nextParams);
  };

  const handlePresetChange = (id: string) => {
    const preset = TERRAIN_PRESETS.find((entry) => entry.id === id);
    if (!preset) {
      return;
    }
    setSelectedPresetId(id);
    setParams({ ...preset.params });
    setLodSettings(createDefaultLodSettings(preset.params.resolution));
  };

  const handleRandomSeed = () => {
    setSelectedPresetId('');
    setParams((current) => ({ ...current, seed: createRandomSeed() }));
  };

  const handleReset = () => {
    setSelectedPresetId('');
    setParams(DEFAULT_TERRAIN_PARAMS);
    setViewMode('shaded');
    setShowGrid(true);
    setTerrainMask(createDefaultTerrainMask());
    setLodSettings(createDefaultLodSettings(DEFAULT_TERRAIN_PARAMS.resolution));
  };

  const handleTextureFile = (slot: TextureLayerKey, file: File | null) => {
    setTextureSet((current) => {
      const previous = current[slot];
      if (previous?.url) {
        URL.revokeObjectURL(previous.url);
      }

      if (!file) {
        const { [slot]: _removed, ...rest } = current;
        return rest;
      }

      const asset: TerrainTextureAsset = {
        name: file.name,
        file,
        url: URL.createObjectURL(file),
      };
      return {
        ...current,
        [slot]: asset,
      };
    });
    setTextureSettings((current) => ({ ...current, enabled: true }));
  };

  const exportSettings = {
    verticalExaggeration: params.verticalExaggeration,
    heightColors: params.heightColors,
    textureSet,
    textureSettings,
  };

  const runExport = async (name: string, action: () => Promise<void> | void) => {
    if (!terrain) {
      return;
    }

    setExporting(name);
    setError(null);
    try {
      await action();
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : 'Falha desconhecida na exportação.',
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="app-shell">
      <ControlPanel
        params={params}
        stats={terrain?.stats}
        presets={TERRAIN_PRESETS}
        selectedPresetId={selectedPresetId}
        viewMode={viewMode}
        showGrid={showGrid}
        textureSet={textureSet}
        textureSettings={textureSettings}
        terrainMask={terrainMask}
        lodSettings={lodSettings}
        generating={generating}
        exporting={exporting}
        warning={warning}
        onParamsChange={handleParamsChange}
        onPresetChange={handlePresetChange}
        onViewModeChange={setViewMode}
        onGridChange={setShowGrid}
        onTextureSettingsChange={setTextureSettings}
        onTextureFile={handleTextureFile}
        onTerrainMaskChange={setTerrainMask}
        onLodSettingsChange={setLodSettings}
        onGenerate={() => requestGenerate(params, terrainMask)}
        onRandomSeed={handleRandomSeed}
        onReset={handleReset}
        onExportOBJ={() => runExport('OBJ', () => downloadOBJ(terrain!, exportSettings))}
        onExportGLB={() => runExport('GLB', () => downloadGLB(terrain!, exportSettings))}
        onExportHeightmap={() => runExport('Heightmap', () => downloadHeightmapPNG(terrain!))}
        onExportRaw={() => runExport('R16', () => downloadR16(terrain!))}
        onExportTextureMap={() =>
          runExport('Textura', () => downloadTerrainTexturePNG(terrain!, exportSettings))
        }
        onExportNormalMap={() =>
          runExport('Normal map', () => downloadNormalMapPNG(terrain!, exportSettings))
        }
        onExportZip={() => runExport('ZIP', () => downloadTerrainZip(terrain!, exportSettings))}
      />

      <main className="preview-shell">
        <header className="preview-topbar">
          <div>
            <span className="eyebrow">Preview 3D</span>
            <strong>
              {terrain
                ? `${terrain.width} x ${terrain.depth} u / ${terrain.resolution}²`
                : 'Preparando terreno'}
            </strong>
          </div>

          <div className="camera-actions">
            <button title="Resetar câmera" onClick={() => viewerRef.current?.resetCamera()}>
              <LocateFixed size={17} aria-hidden="true" />
              Câmera
            </button>
            <button title="Aproximar" onClick={() => viewerRef.current?.zoomIn()}>
              <ZoomIn size={17} aria-hidden="true" />
            </button>
            <button title="Afastar" onClick={() => viewerRef.current?.zoomOut()}>
              <ZoomOut size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="viewer-frame">
          <TerrainViewer
            ref={viewerRef}
            terrain={terrain}
            viewMode={viewMode}
            showGrid={showGrid}
            heightColors={params.heightColors}
            verticalExaggeration={params.verticalExaggeration}
            textureSet={textureSet}
            textureSettings={textureSettings}
            lodSettings={lodSettings}
          />
          {generating ? (
            <div className="viewer-badge">
              <Crosshair size={15} aria-hidden="true" />
              recalculando
            </div>
          ) : null}
          {error ? <div className="error-badge">{error}</div> : null}
        </section>
      </main>
    </div>
  );
}

function createRandomSeed() {
  if (window.crypto?.getRandomValues) {
    const buffer = new Uint32Array(2);
    window.crypto.getRandomValues(buffer);
    return `forge-${buffer[0].toString(36)}-${buffer[1].toString(36)}`;
  }
  return `forge-${Math.random().toString(36).slice(2, 10)}`;
}

function isUnityFriendly(resolution: number) {
  const value = Math.round(resolution) - 1;
  return value > 0 && (value & (value - 1)) === 0;
}

function createDefaultTerrainMask(): TerrainMaskData {
  const resolution = 128;
  return {
    enabled: false,
    resolution,
    values: new Float32Array(resolution * resolution).fill(1),
  };
}

function cloneTerrainMask(mask?: TerrainMaskData): TerrainMaskData | undefined {
  if (!mask) {
    return undefined;
  }

  return {
    enabled: mask.enabled,
    resolution: mask.resolution,
    values: new Float32Array(mask.values),
  };
}

function createDefaultLodSettings(resolution: number): TerrainLodSettings {
  return {
    enabled: true,
    previewMode: 'auto',
    levels: createDefaultLodLevels(resolution),
  };
}

function createDefaultLodLevels(resolution: number): TerrainLodLevelSettings[] {
  const safeResolution = Math.max(3, Math.round(resolution));
  const distances = [0, 360, 760, 1250];
  return [1, 2, 4, 8].map((divider, index) => ({
    enabled: true,
    resolution: clampLodResolution(Math.round((safeResolution - 1) / divider) + 1, safeResolution),
    distance: distances[index],
  }));
}

function adaptLodSettingsToResolution(
  current: TerrainLodSettings,
  previousResolution: number,
  nextResolution: number,
): TerrainLodSettings {
  const previousDefaults = createDefaultLodLevels(previousResolution);
  const nextDefaults = createDefaultLodLevels(nextResolution);
  const currentLevels = current.levels ?? [];
  const nextLevels = nextDefaults.map((fallback, index) => {
    const currentLevel = currentLevels[index] ?? fallback;
    const currentResolution = Math.round(currentLevel.resolution);
    const followsDefault =
      currentResolution === previousDefaults[index]?.resolution ||
      (index === 0 && currentResolution >= previousResolution);

    return {
      enabled: index === 0 ? true : currentLevel.enabled,
      resolution: followsDefault
        ? fallback.resolution
        : clampLodResolution(currentResolution, nextResolution),
      distance: index === 0 ? 0 : currentLevel.distance,
    };
  });

  return {
    ...current,
    levels: nextLevels,
  };
}

function clampLodResolution(resolution: number, terrainResolution: number) {
  return Math.max(3, Math.min(Math.round(terrainResolution), Math.round(resolution)));
}
