import sharp from "sharp";

/**
 * API 키 없이도 앱이 동작하도록 하는 절차적 GUI 패널 생성기.
 * 바닐라 컨테이너 특유의 회색 베벨 패널 톤을 SVG로 그린다.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function renderProceduralPanel(
  width: number,
  height: number,
  seed = 1
): Promise<Buffer> {
  const rnd = mulberry32(seed);
  const hue = Math.floor(rnd() * 360);
  const sat = 6 + Math.floor(rnd() * 14);

  const base = `hsl(${hue} ${sat}% 78%)`;
  const light = `hsl(${hue} ${sat}% 92%)`;
  const dark = `hsl(${hue} ${sat}% 46%)`;
  const inner = `hsl(${hue} ${sat}% 55%)`;

  const b = 4; // 베벨 두께
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="${base}"/>
  <rect x="0" y="0" width="${width}" height="${b}" fill="${light}"/>
  <rect x="0" y="0" width="${b}" height="${height}" fill="${light}"/>
  <rect x="0" y="${height - b}" width="${width}" height="${b}" fill="${dark}"/>
  <rect x="${width - b}" y="0" width="${b}" height="${height}" fill="${dark}"/>
  <rect x="${b * 2}" y="${b * 2}" width="${width - b * 4}" height="${height - b * 4}"
        fill="none" stroke="${inner}" stroke-width="1"/>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
