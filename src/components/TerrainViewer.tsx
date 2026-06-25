import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  TerrainData,
  TerrainLodLevelSettings,
  TerrainLodPreviewMode,
  TerrainLodSettings,
  ViewMode,
} from '../types/terrain';
import type { TerrainTextureSettings, TerrainTextureSet } from '../types/textures';
import { createTerrainGeometry, estimateLodGeometryStats } from '../terrain/geometry';
import {
  createBakedTerrainTexture,
  createPreviewNormalTexture,
  hasTerrainTextures,
} from '../terrain/textureBaker';

export interface TerrainViewerHandle {
  resetCamera: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface TerrainViewerProps {
  terrain: TerrainData | null;
  viewMode: ViewMode;
  showGrid: boolean;
  heightColors: boolean;
  verticalExaggeration: number;
  textureSet: TerrainTextureSet;
  textureSettings: TerrainTextureSettings;
  lodSettings: TerrainLodSettings;
}

interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  drawCalls: number;
  rendererTriangles: number;
  activeLod: number;
  visibleVertices: number;
  visibleTriangles: number;
}

interface LodLevelInfo {
  level: number;
  distance: number;
  vertices: number;
  triangles: number;
  resolution: number;
}

interface NormalizedLodLevel {
  level: number;
  enabled: boolean;
  resolution: number;
  distance: number;
}

export const TerrainViewer = forwardRef<TerrainViewerHandle, TerrainViewerProps>(
  (
    {
      terrain,
      viewMode,
      showGrid,
      heightColors,
      verticalExaggeration,
      textureSet,
      textureSettings,
      lodSettings,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const terrainObjectRef = useRef<THREE.Object3D | null>(null);
    const lodLevelsRef = useRef<LodLevelInfo[]>([]);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const frameRef = useRef<number | null>(null);
    const hasFramedRef = useRef(false);
    const latestTerrainRef = useRef<TerrainData | null>(null);
    const verticalExaggerationRef = useRef(verticalExaggeration);
    const materialJobRef = useRef(0);
    const [performanceSnapshot, setPerformanceSnapshot] = useState<PerformanceSnapshot>({
      fps: 0,
      frameMs: 0,
      drawCalls: 0,
      rendererTriangles: 0,
      activeLod: 0,
      visibleVertices: 0,
      visibleTriangles: 0,
    });

    useImperativeHandle(ref, () => ({
      resetCamera: () => frameCamera(latestTerrainRef.current, verticalExaggerationRef.current),
      zoomIn: () => dolly(0.78),
      zoomOut: () => dolly(1.25),
    }));

    useEffect(() => {
      verticalExaggerationRef.current = verticalExaggeration;
    }, [verticalExaggeration]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return undefined;
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x101210);
      scene.fog = new THREE.Fog(0x101210, 850, 2200);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 5000);
      camera.position.set(480, 340, 520);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 18;
      controls.maxDistance = 2600;
      controls.target.set(0, 26, 0);
      controlsRef.current = controls;

      const ambient = new THREE.HemisphereLight(0xdfe9d2, 0x252117, 1.1);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0xfff5dc, 2.45);
      directional.position.set(260, 420, 220);
      directional.castShadow = true;
      directional.shadow.mapSize.set(2048, 2048);
      directional.shadow.camera.near = 20;
      directional.shadow.camera.far = 1400;
      directional.shadow.camera.left = -700;
      directional.shadow.camera.right = 700;
      directional.shadow.camera.top = 700;
      directional.shadow.camera.bottom = -700;
      scene.add(directional);

      const fill = new THREE.DirectionalLight(0x8bd6cb, 0.42);
      fill.position.set(-260, 120, -280);
      scene.add(fill);

      const resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(container);

      let frameCounter = 0;
      let lastSampleTime = performance.now();
      let lastFrameTime = lastSampleTime;

      const animate = () => {
        const now = performance.now();
        const frameMs = now - lastFrameTime;
        lastFrameTime = now;
        frameCounter += 1;

        controls.update();
        renderer.render(scene, camera);

        const elapsed = now - lastSampleTime;
        if (elapsed >= 500) {
          const activeLodIndex = getActiveLodLevelIndex(terrainObjectRef.current);
          const activeLevelInfo =
            lodLevelsRef.current[activeLodIndex] ?? lodLevelsRef.current[0];
          setPerformanceSnapshot({
            fps: Math.round((frameCounter * 1000) / elapsed),
            frameMs: Number(frameMs.toFixed(1)),
            drawCalls: renderer.info.render.calls,
            rendererTriangles: renderer.info.render.triangles,
            activeLod: activeLevelInfo?.level ?? 0,
            visibleVertices: activeLevelInfo?.vertices ?? 0,
            visibleTriangles: activeLevelInfo?.triangles ?? 0,
          });
          frameCounter = 0;
          lastSampleTime = now;
        }

        frameRef.current = window.requestAnimationFrame(animate);
      };

      resize();
      animate();

      return () => {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
        }
        resizeObserver.disconnect();
        disposeTerrainObject(terrainObjectRef.current);
        gridRef.current?.geometry.dispose();
        const gridMaterial = gridRef.current?.material;
        if (Array.isArray(gridMaterial)) {
          gridMaterial.forEach((material) => material.dispose());
        } else {
          gridMaterial?.dispose();
        }
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }, []);

    useEffect(() => {
      latestTerrainRef.current = terrain;
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }

      disposeTerrainObject(terrainObjectRef.current);
      terrainObjectRef.current = null;
      lodLevelsRef.current = [];

      if (!terrain) {
        return;
      }

      const terrainObject = createTerrainObject({
        terrain,
        viewMode,
        heightColors,
        verticalExaggeration,
        lodSettings,
      });
      terrainObjectRef.current = terrainObject.object;
      lodLevelsRef.current = terrainObject.levels;
      setPerformanceSnapshot((current) => ({
        ...current,
        activeLod: 0,
        visibleVertices: terrainObject.levels[0]?.vertices ?? 0,
        visibleTriangles: terrainObject.levels[0]?.triangles ?? 0,
      }));
      scene.add(terrainObject.object);
      const materialJob = materialJobRef.current + 1;
      materialJobRef.current = materialJob;

      applyUploadedTextureMaterial({
        jobId: materialJob,
        object: terrainObject.object,
        meshes: terrainObject.meshes,
        terrain,
        viewMode,
        heightColors,
        verticalExaggeration,
        textureSet,
        textureSettings,
        materialJobRef,
      });

      if (!hasFramedRef.current) {
        frameCamera(terrain, verticalExaggeration);
        hasFramedRef.current = true;
      }
    }, [
      terrain,
      viewMode,
      heightColors,
      verticalExaggeration,
      textureSet,
      textureSettings,
      lodSettings,
    ]);

    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }

      if (gridRef.current) {
        scene.remove(gridRef.current);
        gridRef.current.geometry.dispose();
        const material = gridRef.current.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material.dispose();
        }
        gridRef.current = null;
      }

      if (showGrid && terrain) {
        const size = Math.max(terrain.width, terrain.depth);
        const divisions = Math.max(8, Math.round(size / 32));
        const grid = new THREE.GridHelper(size, divisions, 0x86d36d, 0x394037);
        grid.position.y = -0.08;
        gridRef.current = grid;
        scene.add(grid);
      }
    }, [showGrid, terrain]);

    function resize() {
      const container = containerRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!container || !renderer || !camera) {
        return;
      }

      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function dolly(factor: number) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return;
      }
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
      direction.multiplyScalar(factor);
      camera.position.copy(controls.target).add(direction);
      controls.update();
    }

    function frameCamera(nextTerrain: TerrainData | null, nextVerticalExaggeration: number) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return;
      }

      const size = nextTerrain
        ? Math.max(nextTerrain.width, nextTerrain.depth, nextTerrain.stats.heightMax * nextVerticalExaggeration * 2)
        : 520;
      const height = nextTerrain ? nextTerrain.stats.heightMax * nextVerticalExaggeration : 120;
      const distance = Math.max(120, size * 0.95);

      controls.target.set(0, height * 0.24, 0);
      camera.position.set(distance * 0.82, Math.max(80, distance * 0.58), distance * 0.86);
      camera.near = Math.max(0.1, distance / 6000);
      camera.far = Math.max(2200, distance * 5);
      camera.updateProjectionMatrix();
      controls.update();
    }

    return (
      <div className="viewer">
        <div className="viewer-canvas" ref={containerRef} />
        <div className="perf-panel" aria-label="Estatisticas de performance">
          <div className={performanceSnapshot.fps > 0 && performanceSnapshot.fps < 30 ? 'perf-fps low' : 'perf-fps'}>
            <strong>{performanceSnapshot.fps || '-'}</strong>
            <span>FPS</span>
          </div>
          <dl className="perf-grid">
            <div>
              <dt>Frame</dt>
              <dd>{performanceSnapshot.frameMs ? `${performanceSnapshot.frameMs} ms` : '-'}</dd>
            </div>
            <div>
              <dt>Vertices</dt>
              <dd>{terrain?.stats.vertices.toLocaleString('pt-BR') ?? '-'}</dd>
            </div>
            <div>
              <dt>Poligonos</dt>
              <dd>{terrain?.stats.triangles.toLocaleString('pt-BR') ?? '-'}</dd>
            </div>
            <div>
              <dt>LOD ativo</dt>
              <dd>{getLodLabel(lodSettings, terrain, performanceSnapshot.activeLod)}</dd>
            </div>
            <div>
              <dt>LOD vertices</dt>
              <dd>{performanceSnapshot.visibleVertices.toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>LOD tris</dt>
              <dd>{performanceSnapshot.visibleTriangles.toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Render tris</dt>
              <dd>{performanceSnapshot.rendererTriangles.toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Draw calls</dt>
              <dd>{performanceSnapshot.drawCalls}</dd>
            </div>
            <div>
              <dt>Resolucao</dt>
              <dd>{terrain ? `${terrain.resolution} x ${terrain.resolution}` : '-'}</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  },
);

TerrainViewer.displayName = 'TerrainViewer';

function createTerrainObject({
  terrain,
  viewMode,
  heightColors,
  verticalExaggeration,
  lodSettings,
}: {
  terrain: TerrainData;
  viewMode: ViewMode;
  heightColors: boolean;
  verticalExaggeration: number;
  lodSettings: TerrainLodSettings;
}) {
  const includeVertexColors = viewMode === 'shaded' && heightColors;
  const sharedMaterial = createMaterial(viewMode, heightColors);
  const previewMode = lodSettings.previewMode ?? 'auto';
  const normalizedLevels = normalizeLodLevels(lodSettings.levels ?? [], terrain.resolution);
  const previewLevel = getPreviewLodLevel(previewMode);
  const meshes: THREE.Mesh[] = [];
  const levels: LodLevelInfo[] = [];

  if (previewLevel !== null || !lodSettings.enabled) {
    const forcedLevel =
      previewLevel === null
        ? createFullResolutionLodLevel(terrain.resolution)
        : normalizedLevels[previewLevel] ?? normalizedLevels[0];
    const mesh = createLodMesh(terrain, {
      lodResolution: forcedLevel.resolution,
      material: sharedMaterial,
      includeVertexColors,
      verticalExaggeration,
    });
    mesh.name = `TerrainForge_LOD${forcedLevel.level}_Preview`;
    meshes.push(mesh);
    levels.push(createLodLevelInfo(terrain.resolution, forcedLevel));
    return {
      object: mesh,
      meshes,
      levels,
    };
  }

  const activeLevels = normalizedLevels.filter((level) => level.enabled);
  if (activeLevels.length === 1) {
    const mesh = createLodMesh(terrain, {
      lodResolution: activeLevels[0].resolution,
      material: sharedMaterial,
      includeVertexColors,
      verticalExaggeration,
    });
    mesh.name = `TerrainForge_LOD${activeLevels[0].level}`;
    meshes.push(mesh);
    levels.push(createLodLevelInfo(terrain.resolution, activeLevels[0]));
    return {
      object: mesh,
      meshes,
      levels,
    };
  }

  const lod = new THREE.LOD();
  lod.name = 'TerrainForge_LOD';
  activeLevels.forEach((level) => {
    const mesh = createLodMesh(terrain, {
      lodResolution: level.resolution,
      material: sharedMaterial,
      includeVertexColors,
      verticalExaggeration,
    });
    mesh.name = `TerrainForge_LOD${level.level}`;
    meshes.push(mesh);
    levels.push(createLodLevelInfo(terrain.resolution, level));
    lod.addLevel(mesh, level.distance);
  });

  return {
    object: lod,
    meshes,
    levels,
  };
}

function createLodMesh(
  terrain: TerrainData,
  {
    lodResolution,
    material,
    includeVertexColors,
    verticalExaggeration,
  }: {
    lodResolution: number;
    material: THREE.Material;
    includeVertexColors: boolean;
    verticalExaggeration: number;
  },
) {
  const geometry = createTerrainGeometry(terrain, {
    verticalExaggeration,
    includeVertexColors,
    lodResolution,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createLodLevelInfo(
  resolution: number,
  level: NormalizedLodLevel,
): LodLevelInfo {
  const stats = estimateLodGeometryStats(resolution, { lodResolution: level.resolution });
  return {
    level: level.level,
    distance: level.distance,
    vertices: stats.vertices,
    triangles: stats.triangles,
    resolution: stats.lodResolution,
  };
}

function getActiveLodLevelIndex(object: THREE.Object3D | null) {
  if (object instanceof THREE.LOD) {
    return object.getCurrentLevel();
  }
  return 0;
}

function normalizeLodLevels(
  levels: TerrainLodLevelSettings[],
  terrainResolution: number,
): NormalizedLodLevel[] {
  let previousDistance = 0;
  return [0, 1, 2, 3].map((levelIndex) => {
    const fallback = createDefaultNormalizedLodLevel(levelIndex, terrainResolution);
    const level = levels[levelIndex] ?? fallback;
    const distance =
      levelIndex === 0
        ? 0
        : Math.max(previousDistance + 1, Math.round(level.distance || fallback.distance));
    previousDistance = distance;

    return {
      level: levelIndex,
      enabled: levelIndex === 0 ? true : level.enabled,
      resolution: clampLodResolution(level.resolution, terrainResolution),
      distance,
    };
  });
}

function createDefaultNormalizedLodLevel(
  level: number,
  terrainResolution: number,
): NormalizedLodLevel {
  const distances = [0, 360, 760, 1250];
  const dividers = [1, 2, 4, 8];
  const safeResolution = Math.max(3, Math.round(terrainResolution));
  return {
    level,
    enabled: true,
    resolution: clampLodResolution(
      Math.round((safeResolution - 1) / (dividers[level] ?? 8)) + 1,
      safeResolution,
    ),
    distance: distances[level] ?? 1250,
  };
}

function createFullResolutionLodLevel(terrainResolution: number): NormalizedLodLevel {
  return {
    level: 0,
    enabled: true,
    resolution: Math.max(3, Math.round(terrainResolution)),
    distance: 0,
  };
}

function clampLodResolution(resolution: number, terrainResolution: number) {
  return Math.max(3, Math.min(Math.round(terrainResolution), Math.round(resolution)));
}

function getPreviewLodLevel(previewMode: TerrainLodPreviewMode) {
  if (previewMode === 'auto') {
    return null;
  }
  return Number(previewMode.replace('lod', ''));
}

function getLodLabel(
  lodSettings: TerrainLodSettings,
  terrain: TerrainData | null,
  activeLod: number,
) {
  if (!terrain) {
    return '-';
  }
  if ((lodSettings.previewMode ?? 'auto') !== 'auto') {
    return `Preview LOD ${activeLod}`;
  }
  if (!lodSettings.enabled) {
    return 'Full';
  }
  return `Auto LOD ${activeLod}`;
}

function createMaterial(viewMode: ViewMode, heightColors: boolean) {
  if (viewMode === 'wireframe') {
    return new THREE.MeshStandardMaterial({
      color: 0x9eeac4,
      roughness: 0.76,
      metalness: 0,
      wireframe: true,
    });
  }

  if (viewMode === 'solid') {
    return new THREE.MeshStandardMaterial({
      color: 0x9a9b8f,
      roughness: 0.9,
      metalness: 0,
      flatShading: false,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: heightColors ? 0xffffff : 0x8f927f,
    roughness: 0.92,
    metalness: 0,
    vertexColors: heightColors,
  });
}

function disposeTerrainObject(object: THREE.Object3D | null) {
  if (!object) {
    return;
  }

  object.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    geometries.add(child.geometry);
    collectMaterials(child.material, materials);
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => disposeSingleMaterial(material));
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  const materials = new Set<THREE.Material>();
  collectMaterials(material, materials);
  materials.forEach((entry) => disposeSingleMaterial(entry));
}

function collectMaterials(
  material: THREE.Material | THREE.Material[],
  target: Set<THREE.Material>,
) {
  if (Array.isArray(material)) {
    material.forEach((entry) => target.add(entry));
    return;
  }
  target.add(material);
}

function disposeSingleMaterial(material: THREE.Material) {
  const textured = material as THREE.MeshStandardMaterial;
  textured.map?.dispose();
  textured.normalMap?.dispose();
  material.dispose();
}

async function applyUploadedTextureMaterial({
  jobId,
  object,
  meshes,
  terrain,
  viewMode,
  heightColors,
  verticalExaggeration,
  textureSet,
  textureSettings,
  materialJobRef,
}: {
  jobId: number;
  object: THREE.Object3D;
  meshes: THREE.Mesh[];
  terrain: TerrainData;
  viewMode: ViewMode;
  heightColors: boolean;
  verticalExaggeration: number;
  textureSet: TerrainTextureSet;
  textureSettings: TerrainTextureSettings;
  materialJobRef: MutableRefObject<number>;
}) {
  const shouldUseTexture =
    viewMode === 'shaded' &&
    ((textureSettings.enabled && hasTerrainTextures(textureSet)) ||
      textureSettings.terrainNormalEnabled ||
      Boolean(textureSet.detailNormal));

  if (!shouldUseTexture) {
    return;
  }

  const shouldBakeDiffuse = textureSettings.enabled && hasTerrainTextures(textureSet);
  const shouldUseNormal = textureSettings.terrainNormalEnabled || Boolean(textureSet.detailNormal);
  const [bakedTexture, normalMap] = await Promise.all([
    shouldBakeDiffuse
      ? createBakedTerrainTexture(terrain, textureSet, textureSettings, verticalExaggeration).catch(() => null)
      : Promise.resolve(null),
    shouldUseNormal
      ? createPreviewNormalTexture(terrain, textureSet, textureSettings, verticalExaggeration).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (jobId !== materialJobRef.current || object.parent === null) {
    bakedTexture?.dispose();
    normalMap?.dispose();
    return;
  }

  const nextMaterial = new THREE.MeshStandardMaterial({
    color: bakedTexture || !heightColors ? 0xffffff : 0x8f927f,
    map: bakedTexture ?? null,
    normalMap: normalMap ?? null,
    normalScale: normalMap ? new THREE.Vector2(1, 1) : undefined,
    roughness: 0.94,
    metalness: 0,
    vertexColors: !bakedTexture && heightColors,
  });
  const previousMaterials = new Set<THREE.Material>();
  meshes.forEach((mesh) => {
    collectMaterials(mesh.material, previousMaterials);
    mesh.material = nextMaterial;
  });
  previousMaterials.forEach((material) => disposeSingleMaterial(material));
}
