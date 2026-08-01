"use client";

import { useRef, useState } from "react";
import { GUI_CANVAS, type GuiPreset } from "@/lib/mc/canvas";
import { allSlotRects, containerSlotCount, wellRect, type Region } from "@/lib/mc/regions";

/**
 * 슬롯 격자를 색으로 칠하는 에디터.
 * 드래그하면 지나가는 칸이 현재 선택된 영역에 들어간다.
 * 이미 다른 영역에 속한 칸은 새 영역으로 넘어간다 (한 칸은 한 영역에만).
 */
export function SlotPainter({
  preset,
  regions,
  activeRegionId,
  onChange,
  scale = 2,
  backdrop,
}: {
  preset: GuiPreset;
  regions: Region[];
  activeRegionId: string | null;
  onChange: (regions: Region[]) => void;
  scale?: number;
  /** 뒤에 깔아 볼 미리보기 이미지 */
  backdrop?: string | null;
}) {
  const [painting, setPainting] = useState<"add" | "erase" | null>(null);
  const rects = allSlotRects(preset);
  const containerCount = containerSlotCount(preset);

  /** 슬롯 인덱스 → 그 칸을 가진 영역 */
  const ownerOf = (i: number) => regions.find((r) => r.slots.includes(i)) ?? null;

  const apply = (index: number, mode: "add" | "erase") => {
    if (!activeRegionId) return;
    const next = regions.map((r) => {
      if (mode === "erase") {
        return { ...r, slots: r.slots.filter((s) => s !== index) };
      }
      if (r.id === activeRegionId) {
        return r.slots.includes(index) ? r : { ...r, slots: [...r.slots, index] };
      }
      // 한 칸은 한 영역에만 속한다
      return { ...r, slots: r.slots.filter((s) => s !== index) };
    });
    onChange(next);
  };

  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 select-none rounded-md ring-1 ring-white/10"
      style={{
        width: GUI_CANVAS * scale,
        height: GUI_CANVAS * scale,
        backgroundColor: "#141418",
      }}
      onMouseLeave={() => setPainting(null)}
      onMouseUp={() => setPainting(null)}
    >
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backdrop}
          alt=""
          width={GUI_CANVAS * scale}
          height={GUI_CANVAS * scale}
          style={{ imageRendering: "pixelated" }}
          className="pointer-events-none absolute left-0 top-0 opacity-60"
        />
      )}

      {/* GUI 실제 영역 */}
      <div
        className="pointer-events-none absolute border border-emerald-400/50"
        style={{
          left: 0,
          top: 0,
          width: preset.guiWidth * scale,
          height: preset.guiHeight * scale,
        }}
      />

      {rects.map((s, i) => {
        const r = wellRect(s);
        const owner = ownerOf(i);
        const isPlayerInv = i >= containerCount;
        return (
          <button
            key={i}
            title={`${isPlayerInv ? "인벤" : "슬롯"} ${isPlayerInv ? i - containerCount : i}`}
            onMouseDown={(e) => {
              e.preventDefault();
              const mode = owner?.id === activeRegionId ? "erase" : "add";
              setPainting(mode);
              apply(i, mode);
            }}
            onMouseEnter={() => {
              if (painting) apply(i, painting);
            }}
            className="absolute transition-colors"
            style={{
              left: r.x * scale,
              top: r.y * scale,
              width: r.w * scale,
              height: r.h * scale,
              backgroundColor: owner ? `${owner.color}99` : "rgba(255,255,255,0.05)",
              border: `1px solid ${owner ? owner.color : "rgba(125,211,252,0.35)"}`,
              opacity: isPlayerInv && !owner ? 0.45 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
