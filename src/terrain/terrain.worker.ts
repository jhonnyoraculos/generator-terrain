import type { TerrainWorkerRequest, TerrainWorkerResponse } from '../types/terrain';
import { generateTerrain } from './generator';

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<TerrainWorkerRequest>) => void) | null;
  postMessage: (message: TerrainWorkerResponse, transfer?: Transferable[]) => void;
};

worker.onmessage = ({ data }: MessageEvent<TerrainWorkerRequest>) => {
  try {
    const terrain = generateTerrain(data.params);
    const response: TerrainWorkerResponse = {
      id: data.id,
      terrain,
    };
    worker.postMessage(response, [terrain.heights.buffer as ArrayBuffer]);
  } catch (error) {
    const response: TerrainWorkerResponse = {
      id: data.id,
      error: error instanceof Error ? error.message : 'Falha desconhecida ao gerar terreno.',
    };
    worker.postMessage(response);
  }
};

export {};
