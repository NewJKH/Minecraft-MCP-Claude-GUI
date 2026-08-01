import sharp from "sharp";
import { playerInventorySlots, type GuiPreset, type SlotRect } from "@/lib/mc/canvas";

/**
 * 슬롯 우물(18x18)을 텍스처에 직접 박는다.
 *
 * AI가 슬롯을 정확한 좌표에 그려줄 수 없으므로, 배경만 AI가 그리고
 * 슬롯 격자는 여기서 바닐라와 동일한 좌표로 합성한다.
 *
 * 좌표 규약: canvas.ts의 slot.x/y는 아이템이 놓이는 16x16 영역의 좌상단이고,
 * 텍스처에 그려지는 우물은 그보다 1px 바깥인 (x-1, y-1)에서 18x18이다.
 */

export type SlotStyle = "vanilla" | "dark" | "light";

const STYLES: Record<SlotStyle, { shadow: string; fill: string; highlight: string }> = {
  // 바닐라 generic_54.png 팔레트
  vanilla: { shadow: "#373737", fill: "#8b8b8b", highlight: "#ffffff" },
  dark: { shadow: "#0f0f12", fill: "#2a2a31", highlight: "#5a5a66" },
  light: { shadow: "#9a9a9a", fill: "#dcdcdc", highlight: "#ffffff" },
};

function well(s: SlotRect, style: SlotStyle): string {
  const { shadow, fill, highlight } = STYLES[style];
  const x = s.x - 1;
  const y = s.y - 1;
  return [
    // 우물 바닥
    `<rect x="${x}" y="${y}" width="18" height="18" fill="${fill}"/>`,
    // 위/왼쪽 그림자
    `<rect x="${x}" y="${y}" width="17" height="1" fill="${shadow}"/>`,
    `<rect x="${x}" y="${y}" width="1" height="17" fill="${shadow}"/>`,
    // 아래/오른쪽 하이라이트
    `<rect x="${x + 1}" y="${y + 17}" width="17" height="1" fill="${highlight}"/>`,
    `<rect x="${x + 17}" y="${y + 1}" width="1" height="17" fill="${highlight}"/>`,
  ].join("");
}

/** 이 프리셋에서 텍스처에 그려야 할 모든 슬롯(컨테이너 + 플레이어 인벤토리). */
export function allSlots(preset: GuiPreset): SlotRect[] {
  return [
    ...preset.slots,
    ...(preset.playerInventory ? playerInventorySlots(preset.guiHeight) : []),
  ];
}

/**
 * guiWidth x guiHeight 크기의 투명 PNG에 슬롯 우물만 그린다.
 *
 * @param exclude 우물을 그리지 않을 슬롯 인덱스. 영역을 칠한 칸은 그 그림이
 *                우물 자리를 대신하므로 여기에 넣어 덮어쓰지 않게 한다.
 */
export async function renderSlotOverlay(
  preset: GuiPreset,
  style: SlotStyle = "vanilla",
  opacity = 1,
  exclude: number[] = []
): Promise<Buffer> {
  const skip = new Set(exclude);
  const body = allSlots(preset)
    .map((s, i) => (skip.has(i) ? "" : well(s, style)))
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${preset.guiWidth}" height="${preset.guiHeight}">` +
    `<g opacity="${Math.min(1, Math.max(0, opacity))}">${body}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
