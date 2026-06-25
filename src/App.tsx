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
  downloadTerrainZip,
} from './exporters/exporters';
import { DEFAULT_TERRAIN_PARAMS, TERRAIN_PRESETS } from './presets/presets';
import { generateTerrain, sanitizeTerrainParams } from './terrain/generator';
import type {
  TerrainData,
  TerrainParams,
  TerrainWorkerResponse,
  ViewMode,
} from './types/terrain';

export function App() {
  const [params, setParams] = useState<TerrainParams>(DEFAULT_TERRAIN_PARAMS);
  const [terrain, setTerrain] = useState<TerrainData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('shaded');
  const [showGrid, setShowGrid] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<TerrainViewerHandle | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const latestRequestRef = useRef(0);

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

  const requestGenerate = useCallback((nextParams: TerrainParams) => {
    const sanitized = sanitizeTerrainParams(nextParams);
    const id = latestRequestRef.current + 1;
    latestRequestRef.current = id;
    setGenerating(true);
    setError(null);

    if (workerRef.current) {
      workerRef.current.postMessage({ id, params: sanitized });
      return;
    }

    window.setTimeout(() => {
      try {
        const nextTerrain = generateTerrain(sanitized);
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
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => requestGenerate(params), 320);
    return () => window.clearTimeout(timeout);
  }, [params, requestGenerate]);

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
    setParams(nextParams);
  };

  const handlePresetChange = (id: string) => {
    const preset = TERRAIN_PRESETS.find((entry) => entry.id === id);
    if (!preset) {
      return;
    }
    setSelectedPresetId(id);
    setParams({ ...preset.params });
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
  };

  const exportSettings = {
    verticalExaggeration: params.verticalExaggeration,
    heightColors: params.heightColors,
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
        generating={generating}
        exporting={exporting}
        warning={warning}
        onParamsChange={handleParamsChange}
        onPresetChange={handlePresetChange}
        onViewModeChange={setViewMode}
        onGridChange={setShowGrid}
        onGenerate={() => requestGenerate(params)}
        onRandomSeed={handleRandomSeed}
        onReset={handleReset}
        onExportOBJ={() => runExport('OBJ', () => downloadOBJ(terrain!, exportSettings))}
        onExportGLB={() => runExport('GLB', () => downloadGLB(terrain!, exportSettings))}
        onExportHeightmap={() => runExport('Heightmap', () => downloadHeightmapPNG(terrain!))}
        onExportRaw={() => runExport('R16', () => downloadR16(terrain!))}
        onExportNormalMap={() =>
          runExport('Normal map', () => downloadNormalMapPNG(terrain!, params.verticalExaggeration))
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
