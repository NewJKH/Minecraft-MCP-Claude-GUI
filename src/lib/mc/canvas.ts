/**
 * 마인크래프트 GUI 텍스처 규격.
 *
 * 핵심 불변식: GUI 텍스처 파일은 **항상 256x256** 이다.
 * 실제 GUI 그림은 좌상단 (0,0)에 guiWidth x guiHeight 만큼만 그려지고
 * 나머지 영역은 투명하게 남는다. 바닐라가 UV를 그렇게 잘라 쓰기 때문에
 * 파일 크기를 줄이거나 그림을 가운데 정렬하면 게임에서 어긋난다.
 */

export const GUI_CANVAS = 256 as const;

export type SlotRect = { x: number; y: number };

export type GuiPreset = {
  id: string;
  label: string;
  /** 리소스팩 안에서의 상대 경로 (assets/minecraft/ 이하) */
  texturePath: string;
  guiWidth: number;
  guiHeight: number;
  /** 컨테이너(위쪽) 슬롯 */
  slots: SlotRect[];
  /** 플레이어 인벤토리 27칸 + 핫바 9칸 포함 여부 */
  playerInventory: boolean;
};

const SLOT = 18;

function grid(cols: number, rows: number, x0: number, y0: number): SlotRect[] {
  const out: SlotRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: x0 + c * SLOT, y: y0 + r * SLOT });
    }
  }
  return out;
}

/** 플레이어 인벤토리(3x9) + 핫바(1x9) 슬롯 좌표. GUI 높이에 상대적으로 붙는다. */
export function playerInventorySlots(guiHeight: number): SlotRect[] {
  return [
    ...grid(9, 3, 8, guiHeight - 82),
    ...grid(9, 1, 8, guiHeight - 24),
  ];
}

function chest(rows: number): GuiPreset {
  // AbstractContainerScreen: imageHeight = 114 + rows * 18
  const guiHeight = 114 + rows * SLOT;
  return {
    id: `chest_${rows}`,
    label: `상자 ${rows}줄 (${rows * 9}칸)`,
    texturePath: "textures/gui/container/generic_54.png",
    guiWidth: 176,
    guiHeight,
    slots: grid(9, rows, 8, 18),
    playerInventory: true,
  };
}

export const GUI_PRESETS: GuiPreset[] = [
  chest(6),
  chest(3),
  chest(1),
  {
    id: "furnace",
    label: "화로",
    texturePath: "textures/gui/container/furnace.png",
    guiWidth: 176,
    guiHeight: 166,
    slots: [
      { x: 56, y: 17 }, // 재료
      { x: 56, y: 53 }, // 연료
      { x: 116, y: 31 }, // 결과
    ],
    playerInventory: true,
  },
  {
    id: "crafting_table",
    label: "제작대",
    texturePath: "textures/gui/container/crafting_table.png",
    guiWidth: 176,
    guiHeight: 166,
    slots: [...grid(3, 3, 30, 17), { x: 124, y: 35 }],
    playerInventory: true,
  },
  {
    id: "dispenser",
    label: "발사기",
    texturePath: "textures/gui/container/dispenser.png",
    guiWidth: 176,
    guiHeight: 166,
    slots: grid(3, 3, 62, 17),
    playerInventory: true,
  },
  {
    id: "hopper",
    label: "깔때기",
    texturePath: "textures/gui/container/hopper.png",
    guiWidth: 176,
    guiHeight: 133,
    slots: grid(5, 1, 44, 20),
    playerInventory: true,
  },
];

export function findPreset(id: string): GuiPreset {
  const p = GUI_PRESETS.find((g) => g.id === id);
  if (!p) throw new Error(`알 수 없는 GUI 프리셋: ${id}`);
  return p;
}

/** 아이템/블록 텍스처 규격 */
export type ItemSize = 16 | 32 | 64;
export const ITEM_SIZES: ItemSize[] = [16, 32, 64];
