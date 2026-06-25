import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { TerrainData, ViewMode } from '../types/terrain';
import { createTerrainGeometry } from '../terrain/geometry';

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
}

export const TerrainViewer = forwardRef<TerrainViewerHandle, TerrainViewerProps>(
  ({ terrain, viewMode, showGrid, heightColors, verticalExaggeration }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const frameRef = useRef<number | null>(null);
    const hasFramedRef = useRef(false);
    const latestTerrainRef = useRef<TerrainData | null>(null);
    const verticalExaggerationRef = useRef(verticalExaggeration);

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

      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        frameRef.current = window.requestAnimationFrame(animate);
      };

      resize();
      animate();

      return () => {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
        }
        resizeObserver.disconnect();
        disposeMesh(meshRef.current);
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

      disposeMesh(meshRef.current);
      meshRef.current = null;

      if (!terrain) {
        return;
      }

      const geometry = createTerrainGeometry(terrain, {
        verticalExaggeration,
        includeVertexColors: viewMode === 'shaded' && heightColors,
      });
      const material = createMaterial(viewMode, heightColors);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshRef.current = mesh;
      scene.add(mesh);

      if (!hasFramedRef.current) {
        frameCamera(terrain, verticalExaggeration);
        hasFramedRef.current = true;
      }
    }, [terrain, viewMode, heightColors, verticalExaggeration]);

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

    return <div className="viewer" ref={containerRef} />;
  },
);

TerrainViewer.displayName = 'TerrainViewer';

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

function disposeMesh(mesh: THREE.Mesh | null) {
  if (!mesh) {
    return;
  }

  mesh.removeFromParent();
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
  } else {
    material.dispose();
  }
}
