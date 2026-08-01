import sharp from "sharp";
import type { Box } from "@/lib/mc/regions";

/**
 * GUI 프레임 렌더러.
 *
 * 잘 만든 마크 GUI 리소스팩은 전부 같은 구조다:
 *   1) 바닐라 회색 베벨 패널이 바탕
 *   2) 그 위에 2톤 테두리를 두른 서브패널이 슬롯 묶음을 감싼다
 *   3) 서브패널 안에는 18px 격자에 정확히 맞은 슬롯 마커
 *   4) 플레이어 인벤토리는 건드리지 않고 바닐라 그대로
 *
 * 이 구조는 픽셀 단위 정확도가 생명이라 확산 모델이 절대 못 맞춘다.
 * 구조는 여기서 그리고, AI는 서브패널 안쪽 재질만 채운다.
 */

/** 바닐라 컨테이너 패널 팔레트 */
export const VANILLA = {
  face: "#c6c6c6",
  light: "#ffffff",
  dark: "#555555",
  wellFace: "#8b8b8b",
  wellShadow: "#373737",
};

export type SubPanelStyle = {
  /** 바깥 테두리 (밝은 톤) */
  outer: string;
  /** 안쪽 테두리 (어두운 톤) */
  inner: string;
  /** 채움. AI 텍스처를 넣을 거면 무시된다. */
  fill: string;
};

/** 레퍼런스에서 자주 보이는 조합들 */
export const SUB_PANEL_STYLES: Record<string, SubPanelStyle> = {
  purple: { outer: "#b39ddb", inner: "#4a3b6b", fill: "#6d5a8c" },
  blue: { outer: "#7cc4ff", inner: "#1b3a5c", fill: "#2d5a8a" },
  red: { outer: "#ff8a80", inner: "#5c1b1b", fill: "#8a2d2d" },
  green: { outer: "#a5d6a7", inner: "#1f4620", fill: "#3a7a3d" },
  gold: { outer: "#ffd54f", inner: "#6b4c17", fill: "#a67c2a" },
  slate: { outer: "#b0bec5", inner: "#2d383e", fill: "#4a5a63" },
};

/** 서브패널이 슬롯 묶음 바깥으로 얼마나 나가는지 (테두리 두께 포함) */
export const SUB_PANEL_INSET = 4;

/** 바닐라 회색 베벨 패널 */
export function vanillaPanelSvg(w: number, h: number): string {
  return [
    `<rect width="${w}" height="${h}" fill="${VANILLA.face}"/>`,
    // 위/왼쪽 하이라이트
    `<rect x="0" y="0" width="${w - 1}" height="1" fill="${VANILLA.light}"/>`,
    `<rect x="0" y="0" width="1" height="${h - 1}" fill="${VANILLA.light}"/>`,
    `<rect x="1" y="1" width="${w - 3}" height="1" fill="${VANILLA.light}"/>`,
    `<rect x="1" y="1" width="1" height="${h - 3}" fill="${VANILLA.light}"/>`,
    // 아래/오른쪽 그림자
    `<rect x="1" y="${h - 1}" width="${w - 1}" height="1" fill="${VANILLA.dark}"/>`,
    `<rect x="${w - 1}" y="1" width="1" height="${h - 1}" fill="${VANILLA.dark}"/>`,
    `<rect x="2" y="${h - 2}" width="${w - 3}" height="1" fill="${VANILLA.dark}"/>`,
    `<rect x="${w - 2}" y="2" width="1" height="${h - 3}" fill="${VANILLA.dark}"/>`,
  ].join("");
}

/**
 * 서브패널 테두리. 안쪽은 비워 두므로 AI 텍스처를 먼저 깔고 이걸 위에 얹으면 된다.
 * 바깥 2px 밝은 톤 + 안쪽 2px 어두운 톤 = 레퍼런스의 그 두꺼운 액자.
 */
export function subPanelFrameSvg(box: Box, style: SubPanelStyle): string {
  const { x, y, w, h } = box;
  const ring = (i: number, color: string) =>
    `<rect x="${x + i}" y="${y + i}" width="${w - i * 2}" height="${h - i * 2}"
       fill="none" stroke="${color}" stroke-width="1"/>`;
  return [
    ring(0, style.inner),
    ring(1, style.outer),
    ring(2, style.outer),
    ring(3, style.inner),
  ].join("");
}

/** 서브패널 안쪽을 단색으로 채우는 사각형 (AI 텍스처를 안 쓸 때) */
export function subPanelFillSvg(box: Box, style: SubPanelStyle): string {
  return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${style.fill}"/>`;
}

export type MarkerStyle = "well" | "dotted" | "none";

/**
 * 슬롯 마커. rects는 우물 좌표(18x18)를 받는다.
 * - well   : 바닐라와 같은 회색 우물
 * - dotted : 레퍼런스 나무 선반 GUI에 쓰인 흰 점선 테두리
 */
export function slotMarkersSvg(rects: Box[], style: MarkerStyle): string {
  if (style === "none") return "";

  return rects
    .map((r) => {
      if (style === "well") {
        return [
          `<rect x="${r.x}" y="${r.y}" width="18" height="18" fill="${VANILLA.wellFace}"/>`,
          `<rect x="${r.x}" y="${r.y}" width="17" height="1" fill="${VANILLA.wellShadow}"/>`,
          `<rect x="${r.x}" y="${r.y}" width="1" height="17" fill="${VANILLA.wellShadow}"/>`,
          `<rect x="${r.x + 1}" y="${r.y + 17}" width="17" height="1" fill="${VANILLA.light}"/>`,
          `<rect x="${r.x + 17}" y="${r.y + 1}" width="1" height="17" fill="${VANILLA.light}"/>`,
        ].join("");
      }
      // 아이템이 놓이는 16x16 영역에 흰 점선
      return `<rect x="${r.x + 1}.5" y="${r.y + 1}.5" width="15" height="15"
        fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="2 2"/>`;
    })
    .join("");
}

/** 여러 svg 조각을 한 장으로 렌더 */
export async function renderSvgLayer(
  width: number,
  height: number,
  parts: string[]
): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 슬롯 묶음의 bounding box를 서브패널 크기로 넓힌다 */
export function expandToPanel(box: Box, inset = SUB_PANEL_INSET): Box {
  return {
    x: box.x - inset,
    y: box.y - inset,
    w: box.w + inset * 2,
    h: box.h + inset * 2,
  };
}
