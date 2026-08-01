import sharp from "sharp";
import type { Box } from "@/lib/mc/regions";
import type { SubPanelStyle } from "@/lib/image/palettes";

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

export { SUB_PANEL_STYLES, type SubPanelStyle } from "@/lib/image/palettes";

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
export type FrameInsets = { top: number; right: number; bottom: number; left: number };

/**
 * 액자를 네 변 각각의 두께로 그린다.
 *
 * 링(사각 테두리)으로 그리면 한 변이 얇아질 때 나머지 변까지 같이 죽는다.
 * 변마다 1px 줄을 바깥에서 안쪽으로 쌓아 올려 그 문제를 없앤다.
 * 색 순서는 바깥부터 inner - outer - outer - inner.
 */
export function subPanelFrameSvg(
  box: Box,
  style: SubPanelStyle,
  insets: FrameInsets | number = 4
): string {
  const t: FrameInsets =
    typeof insets === "number"
      ? { top: insets, right: insets, bottom: insets, left: insets }
      : insets;

  const layer = [style.inner, style.outer, style.outer, style.inner];
  const { x, y, w, h } = box;
  const parts: string[] = [];

  for (let i = 0; i < 4; i++) {
    const color = layer[i];
    if (i < t.top) parts.push(`<rect x="${x}" y="${y + i}" width="${w}" height="1" fill="${color}"/>`);
    if (i < t.bottom)
      parts.push(`<rect x="${x}" y="${y + h - 1 - i}" width="${w}" height="1" fill="${color}"/>`);
    if (i < t.left) parts.push(`<rect x="${x + i}" y="${y}" width="1" height="${h}" fill="${color}"/>`);
    if (i < t.right)
      parts.push(`<rect x="${x + w - 1 - i}" y="${y}" width="1" height="${h}" fill="${color}"/>`);
  }
  return parts.join("");
}

/** 서브패널 안쪽을 단색으로 채우는 사각형 (AI 텍스처를 안 쓸 때) */
export function subPanelFillSvg(box: Box, style: SubPanelStyle): string {
  return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${style.fill}"/>`;
}

export type MarkerStyle = "well" | "dotted" | "recessed" | "none";

/**
 * 슬롯 마커. rects는 우물 좌표(18x18)를 받는다.
 * - well   : 바닐라와 같은 회색 우물
 * - dotted : 레퍼런스 나무 선반 GUI에 쓰인 흰 점선 테두리
 */
export function slotMarkersSvg(
  rects: Box[],
  style: MarkerStyle,
  panel?: SubPanelStyle
): string {
  if (style === "none") return "";

  return rects
    .map((r) => {
      // 프레임 색으로 파인 슬롯. 통짜 프레임 안에서 아이템 자리를 보여주되
      // 바닐라 회색이 끼어들어 통일감을 깨지 않게 한다.
      if (style === "recessed" && panel) {
        // 18x18을 꽉 채우면 칸끼리 붙어 프레임 재질이 하나도 안 보인다.
        // 1px 안으로 물려 16x16으로 그려 칸 사이에 2px 틈을 남긴다.
        const x = r.x + 1;
        const y = r.y + 1;
        return [
          `<rect x="${x}" y="${y}" width="16" height="16" fill="${panel.inner}"/>`,
          `<rect x="${x}" y="${y}" width="15" height="1" fill="#000000" opacity="0.45"/>`,
          `<rect x="${x}" y="${y}" width="1" height="15" fill="#000000" opacity="0.45"/>`,
          `<rect x="${x + 1}" y="${y + 15}" width="15" height="1" fill="${panel.outer}" opacity="0.45"/>`,
          `<rect x="${x + 15}" y="${y + 1}" width="1" height="15" fill="${panel.outer}" opacity="0.45"/>`,
        ].join("");
      }
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

/**
 * 슬롯 줄마다 그 아래에 널판을 깐다. 레퍼런스 나무 선반 GUI를 "벽"이 아니라
 * "선반"으로 읽히게 만드는 게 이 널판이다.
 *
 * @param rects 우물 좌표(18x18) 목록. 같은 y끼리 한 줄로 묶는다.
 * @param bounds 널판이 가로로 뻗을 범위 (보통 서브패널 안쪽)
 */
export function shelfBoardsSvg(
  rects: Box[],
  bounds: Box,
  color: { face: string; light: string; dark: string },
  thickness = 7
): string {
  const rows = [...new Set(rects.map((r) => r.y))].sort((a, b) => a - b);
  const x = bounds.x + 2;
  const w = bounds.w - 4;

  return rows
    .map((rowY) => {
      // 널판 윗면이 슬롯 바닥에 닿게
      const y = rowY + 18;
      const topH = 2; // 위에서 내려다보이는 상판
      return [
        // 상판 — 빛을 받는 면
        `<rect x="${x}" y="${y}" width="${w}" height="${topH}" fill="${color.light}"/>`,
        // 앞면 — 어두운 몸통
        `<rect x="${x}" y="${y + topH}" width="${w}" height="${thickness - topH}" fill="${color.face}"/>`,
        // 앞면 아래 모서리
        `<rect x="${x}" y="${y + thickness - 1}" width="${w}" height="1" fill="${color.dark}"/>`,
        // 양 끝 마구리 — 두께가 보이게
        `<rect x="${x}" y="${y}" width="1" height="${thickness}" fill="${color.dark}"/>`,
        `<rect x="${x + w - 1}" y="${y}" width="1" height="${thickness}" fill="${color.dark}"/>`,
        // 널판이 벽에 드리우는 그림자
        `<rect x="${x}" y="${y + thickness}" width="${w}" height="3" fill="#000000" opacity="0.32"/>`,
        `<rect x="${x}" y="${y + thickness + 3}" width="${w}" height="2" fill="#000000" opacity="0.16"/>`,
      ].join("");
    })
    .join("");
}

/**
 * 타이틀 바. 레퍼런스(TELEPORT HUB / AUCTION / BOOST SHOP)가 전부 같은 구조다:
 * 액자를 두른 바 안에, 글자가 앉을 어두운 명판이 한 겹 더 들어간다.
 */
export function titleBarSvg(
  box: Box,
  style: SubPanelStyle,
  insets: FrameInsets | number = 4
): string {
  const t =
    typeof insets === "number"
      ? insets
      : Math.min(insets.top, insets.right, insets.bottom, insets.left);
  const inset = Math.max(1, t);
  const plaque: Box = {
    x: box.x + inset,
    y: box.y + inset,
    w: box.w - inset * 2,
    h: box.h - inset * 2,
  };

  return [
    subPanelFillSvg(box, style),
    subPanelFrameSvg(box, style, insets),
    // 글자가 앉을 명판 (안쪽으로 파인 느낌)
    `<rect x="${plaque.x}" y="${plaque.y}" width="${plaque.w}" height="${plaque.h}" fill="${style.inner}"/>`,
    `<rect x="${plaque.x}" y="${plaque.y}" width="${plaque.w}" height="1" fill="${VANILLA.dark}" opacity="0.6"/>`,
    `<rect x="${plaque.x}" y="${plaque.y + plaque.h - 1}" width="${plaque.w}" height="1" fill="${style.outer}" opacity="0.5"/>`,
  ].join("");
}

/**
 * 버튼 타일 한 칸. 슬롯 자리에 눌리는 버튼처럼 보이게 그린다.
 * 레퍼런스 AUCTION 하단 아이콘 줄, MAIN MENU 타일이 이 모양이다.
 */
export function buttonTileSvg(r: Box, style: SubPanelStyle): string {
  const inner = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 };
  return [
    // 바깥 액자
    `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${style.fill}"/>`,
    `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${style.inner}" stroke-width="1"/>`,
    `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" fill="none" stroke="${style.outer}" stroke-width="1"/>`,
    // 안쪽 아이콘 자리 (파인 느낌)
    `<rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" fill="${style.inner}"/>`,
    `<rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="1" fill="#000000" opacity="0.35"/>`,
    `<rect x="${inner.x}" y="${inner.y}" width="1" height="${inner.h}" fill="#000000" opacity="0.35"/>`,
    `<rect x="${inner.x + 1}" y="${inner.y + inner.h - 1}" width="${inner.w - 1}" height="1" fill="${style.outer}" opacity="0.55"/>`,
    `<rect x="${inner.x + inner.w - 1}" y="${inner.y + 1}" width="1" height="${inner.h - 1}" fill="${style.outer}" opacity="0.55"/>`,
  ].join("");
}

export function buttonTilesSvg(rects: Box[], style: SubPanelStyle): string {
  return rects.map((r) => buttonTileSvg(r, style)).join("");
}

/**
 * 세로 스크롤바. 레퍼런스 BOSS-DUNGEON 좌측에 있는 그것.
 * 위/아래 삼각 버튼 + 가운데 손잡이.
 */
export function scrollBarSvg(box: Box, style: SubPanelStyle, thumbAt = 0.15): string {
  const w = box.w;
  const arrow = w;
  const thumbH = Math.max(8, Math.round(box.h * 0.18));
  const trackTop = box.y + arrow;
  const trackH = box.h - arrow * 2;
  const thumbY = trackTop + Math.round((trackH - thumbH) * thumbAt);

  const tri = (cy: number, up: boolean) => {
    const half = Math.floor(w / 2) - 1;
    const dir = up ? -1 : 1;
    return `<polygon points="${box.x + w / 2},${cy + dir * half} ${box.x + 1},${cy - dir * half} ${box.x + w - 1},${cy - dir * half}"
      fill="${style.outer}"/>`;
  };

  return [
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${style.inner}"/>`,
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="${style.outer}" stroke-width="1"/>`,
    tri(box.y + arrow / 2, true),
    tri(box.y + box.h - arrow / 2, false),
    `<rect x="${box.x + 1}" y="${thumbY}" width="${w - 2}" height="${thumbH}" fill="${style.fill}"/>`,
    `<rect x="${box.x + 1}" y="${thumbY}" width="${w - 2}" height="1" fill="${style.outer}"/>`,
  ].join("");
}

/**
 * 줄무늬 차양. 상점 GUI 레퍼런스가 전부 갖고 있는 그 지붕.
 *
 * 세로 줄무늬 + 아래쪽 부채꼴(스캘럽) 마감 + 위쪽 하이라이트.
 * GUI 폭보다 넓게 뻗어야 상점처럼 보이므로 캔버스가 GUI보다 커야 한다.
 */
export function awningSvg(
  box: Box,
  colorA: string,
  colorB: string,
  opts: { stripes?: number; scallop?: number; shadow?: string } = {}
): string {
  const stripes = opts.stripes ?? 7;
  const scallop = opts.scallop ?? 5;
  const sw = box.w / stripes;
  const parts: string[] = [];

  for (let i = 0; i < stripes; i++) {
    const x = box.x + i * sw;
    const color = i % 2 === 0 ? colorA : colorB;
    // 줄무늬 몸통
    parts.push(
      `<rect x="${x}" y="${box.y}" width="${Math.ceil(sw)}" height="${box.h - scallop}" fill="${color}"/>`
    );
    // 아래쪽 부채꼴 마감
    parts.push(
      `<path d="M ${x} ${box.y + box.h - scallop}
                Q ${x + sw / 2} ${box.y + box.h + scallop} ${x + sw} ${box.y + box.h - scallop} Z"
         fill="${color}"/>`
    );
  }

  return [
    ...parts,
    // 줄무늬마다 좌우 음영 — 천이 접힌 것처럼 보이게
    ...Array.from({ length: stripes }, (_, i) => {
      const x = box.x + i * sw;
      return (
        `<rect x="${x}" y="${box.y}" width="1" height="${box.h - scallop}" fill="#000000" opacity="0.18"/>` +
        `<rect x="${x + sw - 1}" y="${box.y}" width="1" height="${box.h - scallop}" fill="#ffffff" opacity="0.12"/>`
      );
    }),
    // 지붕 위쪽 하이라이트
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="2" fill="#ffffff" opacity="0.35"/>`,
    // 처마 밑면 — 이게 있어야 지붕이 두께를 가진 것처럼 보인다
    `<rect x="${box.x + 3}" y="${box.y + box.h - scallop}" width="${box.w - 6}" height="3" fill="${opts.shadow ?? "#000000"}" opacity="0.4"/>`,
  ].join("");
}

/**
 * 벽 안쪽 그림자. 위와 양옆이 어두워지면 평면이 아니라 '안쪽'으로 읽힌다.
 * 그라데이션 대신 단계별 사각형으로 찍어 픽셀아트 결을 지킨다.
 */
export function wallDepthSvg(box: Box, steps = 4): string {
  const parts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const o = (0.3 * (steps - i)) / steps;
    const t = i * 2;
    parts.push(
      `<rect x="${box.x}" y="${box.y + t}" width="${box.w}" height="2" fill="#000000" opacity="${o.toFixed(3)}"/>`,
      `<rect x="${box.x + t}" y="${box.y}" width="2" height="${box.h}" fill="#000000" opacity="${(o * 0.7).toFixed(3)}"/>`,
      `<rect x="${box.x + box.w - t - 2}" y="${box.y}" width="2" height="${box.h}" fill="#000000" opacity="${(o * 0.7).toFixed(3)}"/>`
    );
  }
  return parts.join("");
}

/** 상점 양옆 기둥. 건물처럼 보이게 하는 값싼 트릭. */
export function sidePostsSvg(
  box: Box,
  color: { face: string; light: string; dark: string },
  width = 7
): string {
  const post = (x: number) =>
    [
      `<rect x="${x}" y="${box.y}" width="${width}" height="${box.h}" fill="${color.face}"/>`,
      `<rect x="${x}" y="${box.y}" width="1" height="${box.h}" fill="${color.light}"/>`,
      `<rect x="${x + width - 1}" y="${box.y}" width="1" height="${box.h}" fill="${color.dark}"/>`,
    ].join("");
  return post(box.x) + post(box.x + box.w - width);
}

/** 차양에 매달린 간판. 글자는 나중에 폰트로 얹는다. */
export function signPlaqueSvg(box: Box, style: SubPanelStyle): string {
  return [
    // 매다는 줄 두 개
    `<rect x="${box.x + 6}" y="${box.y - 4}" width="1" height="4" fill="${style.inner}"/>`,
    `<rect x="${box.x + box.w - 7}" y="${box.y - 4}" width="1" height="4" fill="${style.inner}"/>`,
    subPanelFillSvg(box, style),
    subPanelFrameSvg(box, style, 2),
  ].join("");
}

/** 옆에 세우는 세로 배너 (WELCOME 같은 것). */
export function verticalBannerSvg(box: Box, style: SubPanelStyle): string {
  return [
    subPanelFillSvg(box, style),
    subPanelFrameSvg(box, style, 2),
    // 아래쪽 제비꼬리
    `<path d="M ${box.x} ${box.y + box.h}
              L ${box.x + box.w / 2} ${box.y + box.h - 5}
              L ${box.x + box.w} ${box.y + box.h} Z"
       fill="${style.inner}"/>`,
  ].join("");
}

/** 상점 카운터 널판 (앞으로 튀어나온 판) */
export function counterSvg(
  box: Box,
  color: { face: string; light: string; dark: string }
): string {
  return [
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${color.face}"/>`,
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="1" fill="${color.light}"/>`,
    `<rect x="${box.x}" y="${box.y + box.h - 1}" width="${box.w}" height="1" fill="${color.dark}"/>`,
  ].join("");
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
