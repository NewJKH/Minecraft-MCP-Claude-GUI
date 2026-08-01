/**
 * 클라이언트 번들에서도 쓰이는 상수만 모은다.
 * frame.ts / materials.ts 는 sharp(Node 전용)를 물고 있어서 UI가 직접 import 할 수 없다.
 */

export type SubPanelStyle = {
  /** 바깥 테두리 (밝은 톤) */
  outer: string;
  /** 안쪽 테두리 (어두운 톤) */
  inner: string;
  /** 채움. AI 텍스처나 절차적 재질을 넣으면 무시된다. */
  fill: string;
};

/** 레퍼런스 GUI에서 자주 보이는 액자 조합 */
export const SUB_PANEL_STYLES: Record<string, SubPanelStyle> = {
  purple: { outer: "#b39ddb", inner: "#4a3b6b", fill: "#6d5a8c" },
  blue: { outer: "#7cc4ff", inner: "#1b3a5c", fill: "#2d5a8a" },
  red: { outer: "#ff8a80", inner: "#5c1b1b", fill: "#8a2d2d" },
  green: { outer: "#a5d6a7", inner: "#1f4620", fill: "#3a7a3d" },
  gold: { outer: "#ffd54f", inner: "#6b4c17", fill: "#a67c2a" },
  slate: { outer: "#b0bec5", inner: "#2d383e", fill: "#4a5a63" },
};

export type MaterialKind =
  | "wood_planks"
  | "stone_bricks"
  | "parchment"
  | "metal_plate"
  | "fabric"
  | "hazard_stripes"
  | "rusted_metal"
  | "flat";

export const MATERIALS: { id: MaterialKind; label: string; defaultColor: string }[] = [
  { id: "wood_planks", label: "나무 판자", defaultColor: "#6b4423" },
  { id: "stone_bricks", label: "돌 벽돌", defaultColor: "#5a5a5e" },
  { id: "parchment", label: "양피지", defaultColor: "#d9c9a3" },
  { id: "metal_plate", label: "금속판", defaultColor: "#4a5560" },
  { id: "fabric", label: "천", defaultColor: "#7a2f3a" },
  { id: "hazard_stripes", label: "위험 줄무늬", defaultColor: "#d4a017" },
  { id: "rusted_metal", label: "부식 철판", defaultColor: "#4a4a4e" },
  { id: "flat", label: "단색", defaultColor: "#3a3a44" },
];
