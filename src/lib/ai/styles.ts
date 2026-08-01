/**
 * 아트 스타일 목록. 클라이언트 번들에서도 쓰이므로 서버 전용 의존성을 두지 않는다.
 * 실제 프롬프트 문구는 prompt.ts (서버 전용)에 있다.
 */

export type ArtStyle = "vanilla" | "pixel_ui" | "pixel_scene";

export type StyleDefaults = {
  pixelBlock: number;
  colors: number;
  /** 채도·대비 부스트. 팔레트를 줄이면 색이 회색으로 뭉개져서 미리 밀어 올린다. */
  punch: number;
  /** 슬롯 우물을 텍스처에 구울지. 장면/메뉴판은 구우면 그림이 다 묻힌다. */
  drawSlots: boolean;
};

export const ART_STYLES: {
  id: ArtStyle;
  label: string;
  hint: string;
  defaults: StyleDefaults;
}[] = [
  {
    id: "vanilla",
    label: "바닐라 톤",
    hint: "회색 베벨 패널. 아이템 아이콘이 잘 보이는 무난한 배경",
    defaults: { pixelBlock: 2, colors: 64, punch: 1.1, drawSlots: true },
  },
  {
    id: "pixel_ui",
    label: "카툰 픽셀 UI",
    hint: "색 구획이 나뉜 알록달록한 판때기. 마켓/상점 메인에 어울림",
    defaults: { pixelBlock: 3, colors: 32, punch: 1.35, drawSlots: false },
  },
  {
    id: "pixel_scene",
    label: "픽셀 일러스트",
    hint: "대장간·주방 같은 장면을 통째로 그린 배경",
    defaults: { pixelBlock: 3, colors: 32, punch: 1.45, drawSlots: false },
  },
];

export function styleDefaults(id: ArtStyle): StyleDefaults {
  return (ART_STYLES.find((s) => s.id === id) ?? ART_STYLES[0]).defaults;
}
