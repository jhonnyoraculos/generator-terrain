import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Brush, Eraser, PaintBucket, RotateCcw, Shuffle } from 'lucide-react';
import type { TerrainMaskData } from '../types/terrain';
import { SliderField, ToggleField } from './ControlField';

type PaintMode = 'paint' | 'erase';

interface MaskPainterProps {
  mask: TerrainMaskData;
  onChange: (mask: TerrainMaskData) => void;
}

export function MaskPainter({ mask, onChange }: MaskPainterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const maskRef = useRef(mask);
  const [brushSize, setBrushSize] = useState(18);
  const [brushStrength, setBrushStrength] = useState(0.85);
  const [paintMode, setPaintMode] = useState<PaintMode>('erase');

  useEffect(() => {
    maskRef.current = mask;
    drawMask(canvasRef.current, mask);
  }, [mask]);

  const updateMask = (patch: Partial<TerrainMaskData>) => {
    const currentMask = maskRef.current;
    const nextMask: TerrainMaskData = {
      ...currentMask,
      ...patch,
      values: patch.values ?? new Float32Array(currentMask.values),
    };
    maskRef.current = nextMask;
    drawMask(canvasRef.current, nextMask);
    onChange(nextMask);
  };

  const fill = (value: number) => {
    const nextValues = new Float32Array(maskRef.current.values.length).fill(value);
    updateMask({ enabled: true, values: nextValues });
  };

  const invert = () => {
    const currentValues = maskRef.current.values;
    const nextValues = new Float32Array(currentValues.length);
    for (let index = 0; index < currentValues.length; index += 1) {
      nextValues[index] = 1 - currentValues[index];
    }
    updateMask({ enabled: true, values: nextValues });
  };

  const paintAtPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = (event.clientY - rect.top) / rect.height;
    const nextValues = paintAt(maskRef.current, u, v, brushSize, brushStrength, paintMode);
    updateMask({ enabled: true, values: nextValues });
  };

  return (
    <div className="mask-painter">
      <ToggleField
        label="Usar mascara"
        checked={mask.enabled}
        onChange={(enabled) => updateMask({ enabled })}
      />

      <div className="mask-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="mask-canvas"
          width={mask.resolution}
          height={mask.resolution}
          onPointerDown={(event) => {
            isPaintingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            paintAtPointer(event);
          }}
          onPointerMove={(event) => {
            if (isPaintingRef.current) {
              paintAtPointer(event);
            }
          }}
          onPointerUp={(event) => {
            isPaintingRef.current = false;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            isPaintingRef.current = false;
          }}
        />
      </div>

      <div className="mask-mode-row" role="group" aria-label="Modo de pintura">
        <button
          className={paintMode === 'paint' ? 'active' : ''}
          type="button"
          onClick={() => setPaintMode('paint')}
        >
          <Brush size={15} aria-hidden="true" />
          Pintar
        </button>
        <button
          className={paintMode === 'erase' ? 'active' : ''}
          type="button"
          onClick={() => setPaintMode('erase')}
        >
          <Eraser size={15} aria-hidden="true" />
          Remover
        </button>
      </div>

      <SliderField
        label="Tamanho pincel"
        min={2}
        max={64}
        step={1}
        value={brushSize}
        integer
        onChange={setBrushSize}
      />
      <SliderField
        label="Forca pincel"
        min={0.05}
        max={1}
        step={0.05}
        value={brushStrength}
        onChange={setBrushStrength}
      />

      <div className="mask-actions">
        <button type="button" onClick={() => fill(1)}>
          <PaintBucket size={15} aria-hidden="true" />
          Preencher
        </button>
        <button type="button" onClick={() => fill(0)}>
          <RotateCcw size={15} aria-hidden="true" />
          Limpar
        </button>
        <button type="button" onClick={invert}>
          <Shuffle size={15} aria-hidden="true" />
          Inverter
        </button>
      </div>
    </div>
  );
}

function drawMask(canvas: HTMLCanvasElement | null, mask: TerrainMaskData) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const image = context.createImageData(mask.resolution, mask.resolution);
  for (let index = 0; index < mask.values.length; index += 1) {
    const value = Math.round(mask.values[index] * 255);
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function paintAt(
  mask: TerrainMaskData,
  u: number,
  v: number,
  brushSize: number,
  brushStrength: number,
  mode: PaintMode,
) {
  const nextValues = new Float32Array(mask.values);
  const centerX = clamp(u, 0, 1) * (mask.resolution - 1);
  const centerY = clamp(v, 0, 1) * (mask.resolution - 1);
  const radius = Math.max(1, brushSize);
  const target = mode === 'paint' ? 1 : 0;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(mask.resolution - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(mask.resolution - 1, Math.ceil(centerY + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > radius) {
        continue;
      }

      const index = y * mask.resolution + x;
      const falloff = 1 - smoothstep(0, 1, distance / radius);
      const amount = clamp(brushStrength * falloff, 0, 1);
      nextValues[index] = lerp(nextValues[index], target, amount);
    }
  }

  return nextValues;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}
