import sharp from "sharp";

/**
 * 현대적인 메뉴 패널을 코드로 그린다.
 *
 * 확산 모델은 "둥근 타일 3x2 격자, 헤더 바, 얇은 액센트 선" 같은 기하학적 레이아웃을
 * 픽셀 단위로 못 맞춘다. 슬롯 우물과 같은 이유로, 구조는 코드가 그리고
 * AI는 (원하면) 타일 안쪽만 채우게 한다.
 */

export type ModernTheme = {
  /** 바깥 배경 */
  bg: string;
  /** 타일 채움 */
  tile: string;
  /** 타일 테두리 */
  tileEdge: string;
  /** 강조색 */
  accent: string;
  /** 옅은 글자/구분선 */
  muted: string;
};

export const MODERN_THEMES: Record<string, ModernTheme> = {
  midnight: {
    bg: "#141824",
    tile: "#1e2434",
    tileEdge: "#2f3850",
    accent: "#5eead4",
    muted: "#5b6580",
  },
  slate: {
    bg: "#17181c",
    tile: "#212328",
    tileEdge: "#34373f",
    accent: "#a3e635",
    muted: "#5f636e",
  },
  plum: {
    bg: "#1b1420",
    tile: "#271b2e",
    tileEdge: "#3d2b46",
    accent: "#f472b6",
    muted: "#6b5573",
  },
  sand: {
    bg: "#f4efe6",
    tile: "#ffffff",
    tileEdge: "#ddd3c2",
    accent: "#ea7317",
    muted: "#a8998a",
  },
};

export type ModernMenuSpec = {
  width: number;
  height: number;
  theme: ModernTheme;
  /** 타일 격자 */
  cols: number;
  rows: number;
  /** 상단 헤더 바 높이. 0이면 없음 */
  headerHeight: number;
  /** 하단 푸터 높이. 0이면 없음 */
  footerHeight: number;
  /** 타일 사이 간격 */
  gap: number;
  /** 바깥 여백 */
  padding: number;
  /** 모서리 반경 */
  radius: number;
  /** 첫 타일을 강조색으로 */
  highlightFirst: boolean;
};

export const MODERN_DEFAULTS: Omit<ModernMenuSpec, "width" | "height" | "theme"> = {
  cols: 3,
  rows: 2,
  headerHeight: 26,
  footerHeight: 18,
  gap: 6,
  padding: 8,
  radius: 4,
  highlightFirst: true,
};

/** 타일 하나. 살짝 밝은 위쪽 테두리로 입체감만 준다. */
function tile(
  x: number,
  y: number,
  w: number,
  h: number,
  t: ModernTheme,
  r: number,
  highlight: boolean
): string {
  const fill = highlight ? t.accent : t.tile;
  const edge = highlight ? t.accent : t.tileEdge;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${edge}" stroke-width="1"/>`,
    // 안쪽 아이콘 자리 (빈 사각형)
    `<rect x="${x + w / 2 - 8}" y="${y + h / 2 - 10}" width="16" height="16" rx="2"
       fill="none" stroke="${highlight ? t.bg : t.muted}" stroke-width="1" opacity="0.7"/>`,
    // 라벨 자리 (선 두 줄)
    `<rect x="${x + w / 2 - 14}" y="${y + h / 2 + 10}" width="28" height="2" rx="1"
       fill="${highlight ? t.bg : t.muted}" opacity="0.6"/>`,
  ].join("");
}

export function renderModernMenuSvg(spec: ModernMenuSpec): string {
  const { width: W, height: H, theme: t, gap, padding: p, radius: r } = spec;

  const gridTop = p + (spec.headerHeight ? spec.headerHeight + gap : 0);
  const gridBottom = H - p - (spec.footerHeight ? spec.footerHeight + gap : 0);
  const gridW = W - p * 2;
  const gridH = gridBottom - gridTop;

  const tw = (gridW - gap * (spec.cols - 1)) / spec.cols;
  const th = (gridH - gap * (spec.rows - 1)) / spec.rows;

  const parts: string[] = [
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>`,
    // 바깥 테두리
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${r + 2}"
       fill="none" stroke="${t.tileEdge}" stroke-width="1"/>`,
  ];

  if (spec.headerHeight > 0) {
    parts.push(
      `<rect x="${p}" y="${p}" width="${gridW}" height="${spec.headerHeight}" rx="${r}" fill="${t.tile}"/>`,
      // 제목 자리
      `<rect x="${p + 10}" y="${p + spec.headerHeight / 2 - 3}" width="${Math.round(gridW * 0.32)}" height="6" rx="3" fill="${t.muted}" opacity="0.8"/>`,
      // 액센트 밑줄
      `<rect x="${p}" y="${p + spec.headerHeight - 2}" width="${Math.round(gridW * 0.28)}" height="2" fill="${t.accent}"/>`
    );
  }

  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const x = p + col * (tw + gap);
      const y = gridTop + row * (th + gap);
      parts.push(
        tile(x, y, tw, th, t, r, spec.highlightFirst && row === 0 && col === 0)
      );
    }
  }

  if (spec.footerHeight > 0) {
    const y = H - p - spec.footerHeight;
    parts.push(
      `<rect x="${p}" y="${y}" width="${gridW}" height="${spec.footerHeight}" rx="${r}" fill="${t.tile}"/>`,
      `<rect x="${p + 8}" y="${y + spec.footerHeight / 2 - 2}" width="${Math.round(gridW * 0.18)}" height="4" rx="2" fill="${t.muted}" opacity="0.7"/>`,
      `<rect x="${W - p - 8 - 22}" y="${y + spec.footerHeight / 2 - 2}" width="22" height="4" rx="2" fill="${t.accent}" opacity="0.9"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
}

export async function renderModernMenu(spec: ModernMenuSpec): Promise<Buffer> {
  return sharp(Buffer.from(renderModernMenuSvg(spec))).png().toBuffer();
}
