import { strToU8, zipSync } from 'fflate';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { TerrainData } from '../types/terrain';
import type { TerrainTextureSettings, TerrainTextureSet } from '../types/textures';
import { createTerrainGeometry } from '../terrain/geometry';
import { computeTerrainNormal } from '../terrain/normals';
import {
  createBakedTerrainTexture,
  createBakedNormalMapBlob,
  createBakedNormalTexture,
  createBakedTerrainTextureBlob,
  hasTextureNormals,
  hasTerrainTextures,
} from '../terrain/textureBaker';

interface ExportSettings {
  verticalExaggeration: number;
  heightColors: boolean;
  textureSet?: TerrainTextureSet;
  textureSettings?: TerrainTextureSettings;
}

const DEFAULT_BAKE_SETTINGS: TerrainTextureSettings = {
  enabled: true,
  blendStrength: 0.82,
  repeat: 9,
  bakeResolution: 1024,
  terrainNormalEnabled: true,
  terrainNormalStrength: 0.72,
  detailNormalStrength: 0.35,
  macroVariation: 0.26,
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function serializeOBJ(
  terrain: TerrainData,
  settings: ExportSettings,
  options: { includeMaterialLib?: boolean } = {},
) {
  const { resolution, width, depth, heights } = terrain;
  const lines: string[] = [
    '# Terrain Forge OBJ',
    `# seed: ${terrain.params.seed}`,
    `# resolution: ${resolution}`,
  ];

  if (options.includeMaterialLib) {
    lines.push('mtllib terrain.mtl');
  }

  lines.push('o TerrainForge');

  for (let row = 0; row < resolution; row += 1) {
    const z = (row / (resolution - 1) - 0.5) * depth;
    for (let col = 0; col < resolution; col += 1) {
      const x = (col / (resolution - 1) - 0.5) * width;
      const y = heights[row * resolution + col] * settings.verticalExaggeration;
      lines.push(`v ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(z)}`);
    }
  }

  for (let row = 0; row < resolution; row += 1) {
    const v = 1 - row / (resolution - 1);
    for (let col = 0; col < resolution; col += 1) {
      const u = col / (resolution - 1);
      lines.push(`vt ${formatNumber(u)} ${formatNumber(v)}`);
    }
  }

  for (let row = 0; row < resolution; row += 1) {
    for (let col = 0; col < resolution; col += 1) {
      const normal = computeTerrainNormal(terrain, row, col, settings.verticalExaggeration);
      lines.push(
        `vn ${formatNumber(normal.x)} ${formatNumber(normal.y)} ${formatNumber(normal.z)}`,
      );
    }
  }

  if (options.includeMaterialLib) {
    lines.push('usemtl TerrainForgeMaterial');
  }

  lines.push('s 1');
  for (let row = 0; row < resolution - 1; row += 1) {
    for (let col = 0; col < resolution - 1; col += 1) {
      const i0 = row * resolution + col + 1;
      const i1 = i0 + 1;
      const i2 = i0 + resolution;
      const i3 = i2 + 1;
      lines.push(`f ${i0}/${i0}/${i0} ${i2}/${i2}/${i2} ${i1}/${i1}/${i1}`);
      lines.push(`f ${i1}/${i1}/${i1} ${i2}/${i2}/${i2} ${i3}/${i3}/${i3}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function serializeMTL() {
  return [
    '# Terrain Forge material',
    'newmtl TerrainForgeMaterial',
    'Ka 1.000 1.000 1.000',
    'Kd 1.000 1.000 1.000',
    'Ks 0.000 0.000 0.000',
    'Ns 8',
    'illum 2',
    'map_Kd terrain_texture.png',
    'norm normalmap.png',
    'bump normalmap.png',
    '',
  ].join('\n');
}

export function createRaw16R16(terrain: TerrainData) {
  const { heights } = terrain;
  const buffer = new ArrayBuffer(heights.length * 2);
  const view = new DataView(buffer);
  const range = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);

  for (let i = 0; i < heights.length; i += 1) {
    const normalized = (heights[i] - terrain.stats.heightMin) / range;
    view.setUint16(i * 2, Math.round(normalized * 65535), true);
  }

  return buffer;
}

export async function createHeightmapPngBlob(terrain: TerrainData) {
  const canvas = document.createElement('canvas');
  canvas.width = terrain.resolution;
  canvas.height = terrain.resolution;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D indisponivel para exportar heightmap.');
  }

  const image = context.createImageData(terrain.resolution, terrain.resolution);
  const range = Math.max(0.0001, terrain.stats.heightMax - terrain.stats.heightMin);

  for (let i = 0; i < terrain.heights.length; i += 1) {
    const value = Math.round(((terrain.heights[i] - terrain.stats.heightMin) / range) * 255);
    const offset = i * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  return canvasToPngBlob(canvas);
}

export async function createNormalMapPngBlob(terrain: TerrainData, verticalExaggeration: number) {
  const canvas = document.createElement('canvas');
  canvas.width = terrain.resolution;
  canvas.height = terrain.resolution;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D indisponivel para exportar normal map.');
  }

  const image = context.createImageData(terrain.resolution, terrain.resolution);

  for (let row = 0; row < terrain.resolution; row += 1) {
    for (let col = 0; col < terrain.resolution; col += 1) {
      const index = row * terrain.resolution + col;
      const normal = computeTerrainNormal(terrain, row, col, verticalExaggeration);
      const offset = index * 4;
      image.data[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round((normal.z * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((normal.y * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvasToPngBlob(canvas);
}

export async function createGLB(terrain: TerrainData, settings: ExportSettings) {
  const textureSet = settings.textureSet ?? {};
  const textureSettings = settings.textureSettings ?? DEFAULT_BAKE_SETTINGS;
  const geometry = createTerrainGeometry(terrain, {
    verticalExaggeration: settings.verticalExaggeration,
    includeVertexColors: settings.heightColors,
  });
  const useTextures =
    textureSettings.enabled &&
    (hasTerrainTextures(textureSet) || hasTextureNormals(textureSet));
  const bakedTexture =
    useTextures && hasTerrainTextures(textureSet)
      ? await createBakedTerrainTexture(
          terrain,
          textureSet,
          textureSettings,
          settings.verticalExaggeration,
        )
      : null;
  const normalMap = await createBakedNormalTexture(
    terrain,
    textureSet,
    textureSettings,
    settings.verticalExaggeration,
  ).catch(() => null);
  const material = new THREE.MeshStandardMaterial({
    color: bakedTexture || settings.heightColors ? 0xffffff : 0x8a8d84,
    map: bakedTexture,
    normalMap,
    normalScale: normalMap ? new THREE.Vector2(1, 1) : undefined,
    roughness: 0.92,
    metalness: 0,
    vertexColors: !bakedTexture && settings.heightColors,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TerrainForge';

  try {
    const exporter = new GLTFExporter();
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        mesh,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
            return;
          }
          resolve(new TextEncoder().encode(JSON.stringify(result)).buffer as ArrayBuffer);
        },
        (error) => reject(error),
        { binary: true },
      );
    });
  } finally {
    geometry.dispose();
    bakedTexture?.dispose();
    normalMap?.dispose();
    material.dispose();
  }
}

export async function downloadOBJ(terrain: TerrainData, settings: ExportSettings) {
  const obj = serializeOBJ(terrain, settings);
  downloadBlob(new Blob([obj], { type: 'text/plain;charset=utf-8' }), 'terrain.obj');
}

export async function downloadHeightmapPNG(terrain: TerrainData) {
  const blob = await createHeightmapPngBlob(terrain);
  downloadBlob(blob, 'heightmap.png');
}

export function downloadR16(terrain: TerrainData) {
  const raw = createRaw16R16(terrain);
  downloadBlob(new Blob([raw], { type: 'application/octet-stream' }), 'heightmap.r16');
}

export async function downloadNormalMapPNG(terrain: TerrainData, settings: ExportSettings) {
  const blob = await createBakedNormalMapBlob(
    terrain,
    settings.textureSet ?? {},
    settings.textureSettings ?? DEFAULT_BAKE_SETTINGS,
    settings.verticalExaggeration,
  );
  downloadBlob(blob, 'normalmap.png');
}

export async function downloadTerrainTexturePNG(terrain: TerrainData, settings: ExportSettings) {
  const blob = await createBakedTerrainTextureBlob(
    terrain,
    settings.textureSet ?? {},
    settings.textureSettings ?? DEFAULT_BAKE_SETTINGS,
    settings.verticalExaggeration,
  );
  downloadBlob(blob, 'terrain_texture.png');
}

export async function downloadGLB(terrain: TerrainData, settings: ExportSettings) {
  const glb = await createGLB(terrain, settings);
  downloadBlob(new Blob([glb], { type: 'model/gltf-binary' }), 'terrain.glb');
}

export async function downloadTerrainZip(terrain: TerrainData, settings: ExportSettings) {
  const textureSet = settings.textureSet ?? {};
  const textureSettings = settings.textureSettings ?? DEFAULT_BAKE_SETTINGS;
  const [heightmapBlob, normalmapBlob, bakedTextureBlob, glb] = await Promise.all([
    createHeightmapPngBlob(terrain),
    createBakedNormalMapBlob(
      terrain,
      textureSet,
      textureSettings,
      settings.verticalExaggeration,
    ),
    createBakedTerrainTextureBlob(
      terrain,
      textureSet,
      textureSettings,
      settings.verticalExaggeration,
    ),
    createGLB(terrain, settings),
  ]);

  const metadata = {
    app: 'Terrain Forge',
    version: '1.0.0',
    seed: terrain.params.seed,
    width: terrain.width,
    depth: terrain.depth,
    resolution: terrain.resolution,
    vertices: terrain.stats.vertices,
    triangles: terrain.stats.triangles,
    heightMin: terrain.stats.heightMin,
    heightMax: terrain.stats.heightMax,
    verticalExaggeration: settings.verticalExaggeration,
    unity: {
      rawFormat: 'R16 little-endian unsigned, normalized 0..65535',
      meshOrigin: 'centered',
      units: '1 app unit = 1 Unity unit by default',
      heightmapResolutionRecommended: terrain.stats.unityFriendlyResolution,
    },
    params: terrain.params,
    uv: {
      layout: 'single 0..1 terrain UV, shared by terrain_texture.png and normalmap.png',
      origin: 'OBJ vt V is flipped to match exported PNG orientation',
    },
    textureBake: {
      diffuse: 'terrain_texture.png',
      normal: 'normalmap.png',
      material: 'terrain.mtl',
      diffuseMode: 'height and slope blended single texture',
      normalMode: 'terrain normal plus height and slope blended layer normal maps',
    },
    textureSettings,
    textures: settings.textureSet
      ? Object.fromEntries(
          Object.entries(settings.textureSet).map(([slot, asset]) => [
            slot,
            asset ? { name: asset.name } : null,
          ]),
        )
      : {},
  };

  const files: Record<string, Uint8Array> = {
    'terrain.obj': strToU8(serializeOBJ(terrain, settings, { includeMaterialLib: true })),
    'terrain.mtl': strToU8(serializeMTL()),
    'terrain.glb': new Uint8Array(glb),
    'heightmap.png': new Uint8Array(await heightmapBlob.arrayBuffer()),
    'heightmap.r16': new Uint8Array(createRaw16R16(terrain)),
    'normalmap.png': new Uint8Array(await normalmapBlob.arrayBuffer()),
    'terrain_texture.png': new Uint8Array(await bakedTextureBlob.arrayBuffer()),
    'metadata.json': strToU8(JSON.stringify(metadata, null, 2)),
  };

  if (Object.keys(textureSet).length > 0) {
    const textureEntries = Object.entries(textureSet);
    await Promise.all(
      textureEntries.map(async ([slot, asset]) => {
        if (!asset?.file) {
          return;
        }
        const safeName = asset.name.replace(/[^\w.-]+/g, '_');
        files[`textures/${slot}-${safeName}`] = new Uint8Array(await asset.file.arrayBuffer());
      }),
    );
  }

  const zipped = zipSync(files, { level: 6 });
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), 'terrain-forge-export.zip');
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Falha ao serializar PNG.'));
    }, 'image/png');
  });
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(6);
}
