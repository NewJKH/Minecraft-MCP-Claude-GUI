/**
 * 영역(region) 모델.
 *
 * 슬롯 격자를 색깔 그룹으로 칠하고, 그룹마다 다른 프롬프트로 그림을 뽑아
 * 그 칸들에만 합성한다. 칠하지 않은 영역은 배경 레이어가 채운다.
 */

import { playerInventorySlots, type GuiPreset, type SlotRect } from "@/lib/mc/canvas";

/** 슬롯 우물 한 칸의 크기 */
export const WELL = 18;

export type Region = {
  id: string;
  /** UI에서 구분하는 색 (합성 결과에는 안 들어간다) */
  color: string;
  label: string;
  prompt: string;
  /** allSlotRects() 기준 인덱스 */
  slots: number[];
};

export const REGION_PALETTE = [
  { color: "#ef4444", label: "빨강" },
  { color: "#3b82f6", label: "파랑" },
  { color: "#22c55e", label: "초록" },
  { color: "#eab308", label: "노랑" },
  { color: "#a855f7", label: "보라" },
  { color: "#f97316", label: "주황" },
];

/**
 * 이 프리셋의 모든 슬롯을 한 배열로. 앞쪽이 컨테이너, 뒤쪽이 플레이어 인벤토리.
 * 영역의 slots 인덱스는 이 순서를 가리킨다.
 */
export function allSlotRects(preset: GuiPreset): SlotRect[] {
  return [
    ...preset.slots,
    ...(preset.playerInventory ? playerInventorySlots(preset.guiHeight) : []),
  ];
}

/** 컨테이너 슬롯 개수 (플레이어 인벤토리와 나누는 경계) */
export function containerSlotCount(preset: GuiPreset): number {
  return preset.slots.length;
}

/** 슬롯의 우물 사각형. 아이템 영역(16x16)보다 1px 바깥에서 18x18. */
export function wellRect(s: SlotRect) {
  return { x: s.x - 1, y: s.y - 1, w: WELL, h: WELL };
}

export type Box = { x: number; y: number; w: number; h: number };

/** 슬롯 인덱스 묶음을 감싸는 최소 사각형. 이 비율로 그림을 생성한다. */
export function boundingBox(preset: GuiPreset, indices: number[]): Box | null {
  const rects = allSlotRects(preset);
  const picked = indices.map((i) => rects[i]).filter(Boolean);
  if (!picked.length) return null;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const s of picked) {
    const r = wellRect(s);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 마스크 방식.
 * - "box"   : 칠한 칸들을 감싸는 통사각형. 칸 사이 이음매가 없어 그림이 이어진다. (기본)
 * - "cells" : 칠한 칸 하나하나만. 격자 모양대로 오려낸다.
 */
export type MaskMode = "box" | "cells";

/** 영역이 실제로 덮는 칸들의 사각형 목록 (마스크용) */
export function regionRects(preset: GuiPreset, indices: number[]): Box[] {
  const rects = allSlotRects(preset);
  return indices
    .map((i) => rects[i])
    .filter(Boolean)
    .map((s) => {
      const r = wellRect(s);
      return { x: r.x, y: r.y, w: r.w, h: r.h };
    });
}

/**
 * 영역마다 서브패널 박스를 잡는다.
 *
 * 서브패널은 슬롯 묶음 바깥으로 나가야 액자가 보이는데, 붙어 있는 줄에
 * 서로 다른 영역을 두면 액자끼리 겹친다. 그래서 각 변마다 이웃까지의 간격을
 * 재서 그 절반까지만 나가게 한다. 간격이 0이면 액자를 못 그리므로
 * thickness 0으로 알려준다.
 */
export type Insets = { top: number; right: number; bottom: number; left: number };

export function layoutPanels(
  preset: GuiPreset,
  regionSlots: number[][],
  desiredInset = 4
): { box: Box; insets: Insets }[] {
  const boxes = regionSlots.map((s) => boundingBox(preset, s));

  return boxes.map((box, i) => {
    if (!box) {
      return {
        box: { x: 0, y: 0, w: 0, h: 0 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      };
    }

    // 각 변에서 허용되는 최대 확장량
    const limits = { left: desiredInset, right: desiredInset, top: desiredInset, bottom: desiredInset };

    for (let j = 0; j < boxes.length; j++) {
      const other = boxes[j];
      if (i === j || !other) continue;

      const overlapX = box.x < other.x + other.w && other.x < box.x + box.w;
      const overlapY = box.y < other.y + other.h && other.y < box.y + box.h;

      if (overlapX) {
        if (other.y + other.h <= box.y) {
          limits.top = Math.min(limits.top, Math.floor((box.y - (other.y + other.h)) / 2));
        }
        if (other.y >= box.y + box.h) {
          limits.bottom = Math.min(
            limits.bottom,
            Math.floor((other.y - (box.y + box.h)) / 2)
          );
        }
      }
      if (overlapY) {
        if (other.x + other.w <= box.x) {
          limits.left = Math.min(limits.left, Math.floor((box.x - (other.x + other.w)) / 2));
        }
        if (other.x >= box.x + box.w) {
          limits.right = Math.min(
            limits.right,
            Math.floor((other.x - (box.x + box.w)) / 2)
          );
        }
      }
    }

    // GUI 밖으로도 못 나간다
    limits.left = Math.max(0, Math.min(limits.left, box.x - 1));
    limits.top = Math.max(0, Math.min(limits.top, box.y - 1));
    limits.right = Math.max(0, Math.min(limits.right, preset.guiWidth - 1 - (box.x + box.w)));
    limits.bottom = Math.max(0, Math.min(limits.bottom, preset.guiHeight - 1 - (box.y + box.h)));

    const expanded: Box = {
      x: box.x - limits.left,
      y: box.y - limits.top,
      w: box.w + limits.left + limits.right,
      h: box.h + limits.top + limits.bottom,
    };

    // 액자 두께는 변마다 따로 간다. 한 변이 붙어 있다고 나머지까지 죽이지 않는다.
    return { box: expanded, insets: limits };
  });
}

/** 아직 어느 영역에도 안 칠해진 슬롯 인덱스 */
export function unpaintedSlots(preset: GuiPreset, regions: Region[]): number[] {
  const taken = new Set(regions.flatMap((r) => r.slots));
  return allSlotRects(preset)
    .map((_, i) => i)
    .filter((i) => !taken.has(i));
}
