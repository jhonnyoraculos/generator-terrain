const SQRT_3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT_3 - 1);
const G2 = (3 - SQRT_3) / 6;

const GRADIENTS_2D = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hashString(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string) {
  let state = hashString(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimplexNoise2D {
  private readonly perm: Uint8Array;

  constructor(seed: string) {
    const random = createSeededRandom(seed);
    const source = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      source[i] = i;
    }

    for (let i = 255; i > 0; i -= 1) {
      const r = Math.floor(random() * (i + 1));
      const value = source[i];
      source[i] = source[r];
      source[r] = value;
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) {
      this.perm[i] = source[i & 255];
    }
  }

  noise2D(x: number, y: number) {
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const unskew = (i + j) * G2;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);

    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]] % GRADIENTS_2D.length;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % GRADIENTS_2D.length;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % GRADIENTS_2D.length;

    const n0 = this.corner(gi0, x0, y0);
    const n1 = this.corner(gi1, x1, y1);
    const n2 = this.corner(gi2, x2, y2);

    return 70 * (n0 + n1 + n2);
  }

  private corner(gradientIndex: number, x: number, y: number) {
    let t = 0.5 - x * x - y * y;
    if (t < 0) {
      return 0;
    }
    const gradient = GRADIENTS_2D[gradientIndex];
    t *= t;
    return t * t * (gradient[0] * x + gradient[1] * y);
  }
}

export function fbm2D(
  noise: SimplexNoise2D,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;

  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * noise.noise2D(x * frequency, y * frequency);
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return normalization === 0 ? 0 : value / normalization;
}

export function ridgedFbm2D(
  noise: SimplexNoise2D,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let normalization = 0;

  for (let i = 0; i < octaves; i += 1) {
    const signal = 1 - Math.abs(noise.noise2D(x * frequency, y * frequency));
    value += signal * signal * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return normalization === 0 ? 0 : clamp(value / normalization, 0, 1);
}
