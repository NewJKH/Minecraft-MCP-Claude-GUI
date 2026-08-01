import sharp from "sharp";
import type { Box } from "@/lib/mc/regions";

/**
 * 영역 합성.
 *
 * 영역의 bounding box 비율로 뽑은 그림을 GUI 캔버스에 얹되,
 * 실제로 칠한 칸(사각형들) 안쪽만 남기고 나머지는 잘라낸다.
 * 잘라내기는 흰 사각형 마스크 + dest-in 블렌드로 처리한다.
 */

/** 사각형 목록을 흰색으로 채운 마스크 PNG */
async function buildMask(
  width: number,
  height: number,
  rects: Box[]
): Promise<Buffer> {
  const body = rects
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * base 위에 art를 얹는다. art는 box 위치에 놓이고, rects 안쪽만 남는다.
 *
 * @param base   GUI 크기의 바탕 이미지
 * @param art    box.w x box.h 크기로 이미 리사이즈된 영역 그림
 */
export async function compositeRegion(
  base: Buffer,
  art: Buffer,
  size: { width: number; height: number },
  box: Box,
  rects: Box[]
): Promise<Buffer> {
  // 1) 캔버스 전체 크기로 옮겨 놓는다
  const placed = await sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: art, left: box.x, top: box.y }])
    .png()
    .toBuffer();

  // 2) 칠한 칸 바깥을 잘라낸다
  const mask = await buildMask(size.width, size.height, rects);
  const clipped = await sharp(placed)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // 3) 바탕 위에 얹는다
  return sharp(base)
    .composite([{ input: clipped, blend: "over" }])
    .png()
    .toBuffer();
}

/** 지정 크기의 단색 캔버스 (배경 레이어가 없을 때의 바탕) */
export async function solidCanvas(
  width: number,
  height: number,
  color = { r: 0, g: 0, b: 0, alpha: 0 }
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
}
