"use client";

import { GUI_CANVAS, playerInventorySlots, type GuiPreset } from "@/lib/mc/canvas";

/**
 * 256x256 텍스처 위에 실제 GUI 영역과 슬롯 격자를 겹쳐 보여준다.
 * 그림이 좌상단 guiWidth x guiHeight 안에 제대로 들어갔는지 눈으로 검증하는 용도.
 */
export function GuiPreview({
  src,
  preset,
  scale = 2,
  showGrid = true,
}: {
  src: string | null;
  preset: GuiPreset;
  scale?: number;
  showGrid?: boolean;
}) {
  const slots = [
    ...preset.slots,
    ...(preset.playerInventory ? playerInventorySlots(preset.guiHeight) : []),
  ];

  return (
    <div
      className="relative shrink-0 rounded-md ring-1 ring-white/10"
      style={{
        width: GUI_CANVAS * scale,
        height: GUI_CANVAS * scale,
        backgroundColor: "#141418",
        backgroundImage:
          "linear-gradient(45deg,#1e1e24 25%,transparent 25%,transparent 75%,#1e1e24 75%)," +
          "linear-gradient(45deg,#1e1e24 25%,transparent 25%,transparent 75%,#1e1e24 75%)",
        backgroundSize: `${16 * scale}px ${16 * scale}px`,
        backgroundPosition: `0 0, ${8 * scale}px ${8 * scale}px`,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="GUI 텍스처 미리보기"
          width={GUI_CANVAS * scale}
          height={GUI_CANVAS * scale}
          style={{ imageRendering: "pixelated" }}
          className="absolute left-0 top-0"
        />
      )}

      {showGrid && (
        <>
          {/* 실제 게임에서 잘려 쓰이는 영역 */}
          <div
            className="absolute border border-emerald-400/70"
            style={{
              left: 0,
              top: 0,
              width: preset.guiWidth * scale,
              height: preset.guiHeight * scale,
            }}
          />
          {/* 우물은 아이템 영역(16x16)보다 1px 바깥에서 18x18 */}
          {slots.map((s, i) => (
            <div
              key={i}
              className="absolute border border-sky-400/40"
              style={{
                left: (s.x - 1) * scale,
                top: (s.y - 1) * scale,
                width: 18 * scale,
                height: 18 * scale,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
