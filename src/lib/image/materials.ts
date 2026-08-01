import sharp from "sharp";
import type { MaterialKind } from "@/lib/image/palettes";

/**
 * 절차적 재질.
 *
 * 나무 결·돌 벽돌·양피지 같은 건 규칙이 명확해서 코드가 훨씬 깔끔하다.
 * 확산 모델은 같은 걸 그려도 결 간격이 들쭉날쭉하고 색이 뭉개진다.
 *
 * 픽셀 하나하나를 직접 찍으므로 축소·양자화 과정이 아예 없다.
 * 그래서 결과가 흐려질 여지가 없다.
 */

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let T = t;
    if (T < 0) T += 1;
    if (T > 1) T -= 1;
    if (T < 1 / 6) return p + (q - p) * 6 * T;
    if (T < 1 / 2) return q;
    if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6;
    return p;
  };
  return [
    Math.round(f(h + 1 / 3) * 255),
    Math.round(f(h) * 255),
    Math.round(f(h - 1 / 3) * 255),
  ];
}

/** 밝기를 delta 만큼 밀고 채도를 살짝 조절한다. */
export function shade(base: RGB, dl: number, ds = 0): RGB {
  const [h, s, l] = rgbToHsl(base);
  return hslToRgb([
    h,
    Math.min(1, Math.max(0, s + ds)),
    Math.min(1, Math.max(0, l + dl)),
  ]);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { MATERIALS, type MaterialKind } from "@/lib/image/palettes";

/** width x height RGBA 버퍼를 만든다 */
class Canvas {
  data: Buffer;
  constructor(
    public width: number,
    public height: number
  ) {
    this.data = Buffer.alloc(width * height * 4, 0);
  }
  set(x: number, y: number, [r, g, b]: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  fill(c: RGB) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) this.set(x, y, c);
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  toPng() {
    return sharp(this.data, {
      raw: { width: this.width, height: this.height, channels: 4 },
    })
      .png()
      .toBuffer();
  }
}

/** 세로 판자 + 결 + 못. 레퍼런스 나무 선반 GUI가 이 구조다. */
function woodPlanks(c: Canvas, base: RGB, rnd: () => number) {
  const plankW = 22;
  const seam = shade(base, -0.16);
  const light = shade(base, 0.06);
  const dark = shade(base, -0.07);

  c.fill(base);

  for (let px = 0; px < c.width; px += plankW) {
    // 판자마다 살짝 다른 색
    const tone = shade(base, (rnd() - 0.5) * 0.05);
    c.rect(px, 0, Math.min(plankW - 1, c.width - px), c.height, tone);

    // 세로 결
    const streaks = 3 + Math.floor(rnd() * 3);
    for (let s = 0; s < streaks; s++) {
      const sx = px + 2 + Math.floor(rnd() * (plankW - 4));
      const y0 = Math.floor(rnd() * c.height);
      const len = 8 + Math.floor(rnd() * (c.height - 8));
      const col = rnd() > 0.5 ? light : dark;
      for (let y = y0; y < Math.min(c.height, y0 + len); y++) c.set(sx, y, col);
    }

    // 판자 사이 이음매
    if (px + plankW - 1 < c.width) c.rect(px + plankW - 1, 0, 1, c.height, seam);

    // 위쪽 못 두 개. 검은 점이 아니라 금속처럼 하이라이트를 준다.
    const nailBody = shade(base, -0.22, -0.35);
    const nailLight = shade(base, -0.02, -0.4);
    for (const nx of [px + 5, px + plankW - 8]) {
      c.rect(nx, 3, 2, 2, nailBody);
      c.set(nx, 3, nailLight);
    }
  }
}

/** 어긋난 벽돌 + 1px 줄눈 */
function stoneBricks(c: Canvas, base: RGB, rnd: () => number) {
  const bw = 16;
  const bh = 8;
  const mortar = shade(base, -0.18);
  c.fill(mortar);

  let row = 0;
  for (let y = 0; y < c.height; y += bh) {
    const offset = row % 2 === 0 ? 0 : -bw / 2;
    for (let x = offset; x < c.width; x += bw) {
      const tone = shade(base, (rnd() - 0.5) * 0.09);
      c.rect(x, y, bw - 1, bh - 1, tone);
      // 위쪽 하이라이트
      c.rect(x, y, bw - 1, 1, shade(tone, 0.05));
    }
    row++;
  }
}

/** 얼룩진 크림색 + 가장자리 그을림 */
function parchment(c: Canvas, base: RGB, rnd: () => number) {
  c.fill(base);
  for (let i = 0; i < c.width * c.height * 0.06; i++) {
    const x = Math.floor(rnd() * c.width);
    const y = Math.floor(rnd() * c.height);
    c.set(x, y, shade(base, (rnd() - 0.5) * 0.08));
  }
  // 가장자리로 갈수록 어둡게
  const edge = shade(base, -0.12);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const d = Math.min(x, y, c.width - 1 - x, c.height - 1 - y);
      if (d < 3) c.set(x, y, shade(edge, d * 0.02));
    }
  }
}

/** 세로 밴드 + 리벳 */
function metalPlate(c: Canvas, base: RGB, rnd: () => number) {
  c.fill(base);
  for (let x = 0; x < c.width; x++) {
    const t = Math.sin((x / c.width) * Math.PI * 4);
    const col = shade(base, t * 0.03);
    for (let y = 0; y < c.height; y++) c.set(x, y, col);
  }
  const rivet = shade(base, 0.12);
  const rivetDark = shade(base, -0.14);
  for (let y = 6; y < c.height; y += 20) {
    for (let x = 6; x < c.width; x += 20) {
      c.rect(x, y, 2, 2, rivet);
      c.set(x + 1, y + 1, rivetDark);
      void rnd;
    }
  }
}

/** 격자 짜임 */
function fabric(c: Canvas, base: RGB, rnd: () => number) {
  const light = shade(base, 0.05);
  const dark = shade(base, -0.05);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const weave = (x + y) % 4 < 2 ? light : dark;
      c.set(x, y, rnd() > 0.94 ? shade(weave, -0.04) : weave);
    }
  }
}

/** 대각 위험 표지 줄무늬. 칠이 벗겨진 자국까지 넣는다. */
function hazardStripes(c: Canvas, base: RGB, rnd: () => number) {
  const dark: RGB = [26, 24, 22];
  const band = 12;

  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const on = Math.floor((x + y) / band) % 2 === 0;
      c.set(x, y, on ? base : dark);
    }
  }

  // 칠 벗겨짐 — 아래 금속이 드러난다
  const metal: RGB = [92, 92, 96];
  for (let i = 0; i < (c.width * c.height) / 220; i++) {
    const x0 = Math.floor(rnd() * c.width);
    const y0 = Math.floor(rnd() * c.height);
    const w = 1 + Math.floor(rnd() * 5);
    const h = 1 + Math.floor(rnd() * 3);
    c.rect(x0, y0, w, h, shade(metal, (rnd() - 0.5) * 0.1));
  }
}

/** 부식 철판. 판 이음매 + 리벳 + 녹 얼룩 + 긁힘. */
function rustedMetal(c: Canvas, base: RGB, rnd: () => number) {
  metalPlate(c, base, rnd);

  // 판 이음매
  const seam = shade(base, -0.2);
  for (let y = 24; y < c.height; y += 34) c.rect(0, y, c.width, 1, seam);

  // 녹 얼룩. 위에서 아래로 흘러내린다.
  const rustTones: RGB[] = [
    [122, 66, 34],
    [98, 52, 28],
    [140, 84, 44],
  ];
  for (let i = 0; i < (c.width * c.height) / 90; i++) {
    const x = Math.floor(rnd() * c.width);
    const y = Math.floor(rnd() * c.height);
    const tone = rustTones[Math.floor(rnd() * rustTones.length)];
    const len = 1 + Math.floor(rnd() * 6);
    for (let d = 0; d < len; d++) {
      c.set(x + (rnd() > 0.8 ? 1 : 0), y + d, shade(tone, (rnd() - 0.5) * 0.08));
    }
  }

  // 긁힘
  const scratch = shade(base, 0.14);
  for (let i = 0; i < c.width / 8; i++) {
    const x0 = Math.floor(rnd() * c.width);
    const y0 = Math.floor(rnd() * c.height);
    const len = 3 + Math.floor(rnd() * 10);
    for (let d = 0; d < len; d++) c.set(x0 + d, y0 - Math.floor(d / 3), scratch);
  }
}

export async function renderMaterial(
  kind: MaterialKind,
  width: number,
  height: number,
  color: string,
  seed = 1
): Promise<Buffer> {
  const c = new Canvas(Math.max(1, width), Math.max(1, height));
  const base = hexToRgb(color);
  const rnd = mulberry32(seed);

  switch (kind) {
    case "wood_planks":
      woodPlanks(c, base, rnd);
      break;
    case "stone_bricks":
      stoneBricks(c, base, rnd);
      break;
    case "parchment":
      parchment(c, base, rnd);
      break;
    case "metal_plate":
      metalPlate(c, base, rnd);
      break;
    case "fabric":
      fabric(c, base, rnd);
      break;
    case "hazard_stripes":
      hazardStripes(c, base, rnd);
      break;
    case "rusted_metal":
      rustedMetal(c, base, rnd);
      break;
    default:
      c.fill(base);
  }

  return c.toPng();
}
