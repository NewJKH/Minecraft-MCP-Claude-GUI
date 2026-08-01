"use client";

import { type GuiPreset } from "@/lib/mc/canvas";
import { allSlotRects, wellRect } from "@/lib/mc/regions";

/**
 * 폰트 GUI 미리보기.
 *
 * 폰트 GUI는 크기가 자유롭지만, 실제로는 컨테이너 GUI 위에 얹히므로
 * 54칸 슬롯 격자와 어긋나면 안 된다. 이미지를 (glyphLeft, glyphTop)에 놓고
 * 그 위에 슬롯 격자를 GUI 좌표 그대로 얹어 정렬을 눈으로 확인한다.
 */
export function FontGuiPreview({
  src,
  width,
  height,
  glyphLeft,
  glyphTop,
  preset,
  showGrid,
  scale = 2,
}: {
  src: string | null;
  width: number;
  height: number;
  glyphLeft: number;
  glyphTop: number;
  preset: GuiPreset;
  showGrid: boolean;
  scale?: number;
}) {
  const slots = allSlotRects(preset);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-white/10"
      style={{
        width: width * scale,
        height: height * scale,
        backgroundColor: "#141418",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="폰트 GUI 미리보기"
          width={width * scale}
          height={height * scale}
          style={{ imageRendering: "pixelated" }}
          className="absolute left-0 top-0"
        />
      ) : (
        <div className="grid h-full place-items-center text-xs text-zinc-600">
          아직 생성 전
        </div>
      )}

      {showGrid && (
        <>
          {/* 컨테이너 GUI 외곽 */}
          <div
            className="pointer-events-none absolute border border-emerald-400/70"
            style={{
              left: (0 - glyphLeft) * scale,
              top: (0 - glyphTop) * scale,
              width: preset.guiWidth * scale,
              height: preset.guiHeight * scale,
            }}
          />
          {slots.map((s, i) => {
            const r = wellRect(s);
            return (
              <div
                key={i}
                className="pointer-events-none absolute border border-sky-400/45"
                style={{
                  left: (r.x - glyphLeft) * scale,
                  top: (r.y - glyphTop) * scale,
                  width: r.w * scale,
                  height: r.h * scale,
                }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
