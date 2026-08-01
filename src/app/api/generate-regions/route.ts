import { NextResponse } from "next/server";
import { findPreset } from "@/lib/mc/canvas";
import { boundingBox, regionRects, type MaskMode, type Region } from "@/lib/mc/regions";
import {
  buildFontTexture,
  finalizeGuiCanvas,
  assertGuiCanvas,
} from "@/lib/image/pixelize";
import { compositeRegion, solidCanvas } from "@/lib/image/compose";
import { generateImage, defaultProvider, type ProviderId } from "@/lib/ai/image";
import { buildFontGuiPrompt, refineWithClaude, type ArtStyle } from "@/lib/ai/prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  presetId?: string;
  /** 칠하지 않은 곳을 채우는 배경 레이어. 비우면 투명. */
  background?: { prompt: string; artStyle?: ArtStyle };
  regions: (Region & { artStyle?: ArtStyle })[];
  pixelBlock?: number;
  colors?: number;
  punch?: number;
  provider?: ProviderId;
  refine?: boolean;
  artStyle?: ArtStyle;
  /** 슬롯 우물을 텍스처에 구울지. 기본 false — 그림이 칸을 덮는다. */
  drawSlots?: boolean;
  slotStyle?: "vanilla" | "dark" | "light";
  slotOpacity?: number;
  /** 칠한 칸에도 우물을 덧그릴지. 기본은 안 그린다(영역 그림이 우물을 대신). */
  keepSlotsOnRegions?: boolean;
  maskMode?: MaskMode;
};

const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const preset = findPreset(body.presetId ?? "chest_6");
  const provider = body.provider ?? defaultProvider();
  const baseStyle = body.artStyle ?? "pixel_ui";
  const { guiWidth: W, guiHeight: H } = preset;

  const notes: string[] = [];
  const used: { id: string; label: string; slots: number; provider: string }[] = [];

  const pixelOpts = {
    pixelBlock: body.pixelBlock ?? 2,
    colors: body.colors,
    punch: body.punch,
  };

  try {
    // 1) 배경 레이어
    let canvas: Buffer;
    if (body.background?.prompt?.trim()) {
      let prompt = buildFontGuiPrompt(
        body.background.prompt,
        W,
        H,
        body.background.artStyle ?? baseStyle
      );
      if (body.refine) prompt = await refineWithClaude(prompt);

      const gen = await generateImage({ prompt, width: W * 4, height: H * 4 }, provider);
      if (gen.note) notes.push(`배경: ${gen.note}`);
      canvas = await buildFontTexture(gen.png, W, H, pixelOpts);
      used.push({ id: "background", label: "배경", slots: 0, provider: gen.provider });
    } else {
      canvas = await solidCanvas(W, H);
    }

    // 2) 영역별 레이어. 칠한 칸 안쪽만 남기고 바탕 위에 얹는다.
    for (const region of body.regions ?? []) {
      if (!region.slots?.length || !region.prompt?.trim()) continue;

      const box = boundingBox(preset, region.slots);
      if (!box) continue;

      let prompt = buildFontGuiPrompt(
        region.prompt,
        box.w,
        box.h,
        region.artStyle ?? baseStyle
      );
      if (body.refine) prompt = await refineWithClaude(prompt);

      const gen = await generateImage(
        { prompt, width: box.w * 6, height: box.h * 6 },
        provider
      );
      if (gen.note) notes.push(`${region.label}: ${gen.note}`);

      const art = await buildFontTexture(gen.png, box.w, box.h, pixelOpts);
      // 기본은 통사각형. 칸 단위로 오려내면 칸 구분선이 그대로 드러난다.
      const mask =
        (body.maskMode ?? "box") === "cells"
          ? regionRects(preset, region.slots)
          : [box];

      canvas = await compositeRegion(canvas, art, { width: W, height: H }, box, mask);

      used.push({
        id: region.id,
        label: region.label,
        slots: region.slots.length,
        provider: gen.provider,
      });
    }

    // 3) 슬롯 우물 + 256x256 마무리.
    //    칠한 칸은 그 영역 그림이 우물 자리를 대신하므로 우물을 그리지 않는다.
    const painted = (body.regions ?? []).flatMap((r) =>
      r.prompt?.trim() ? r.slots : []
    );
    const png = await finalizeGuiCanvas(canvas, preset, {
      drawSlots: body.drawSlots === true,
      slotStyle: body.slotStyle,
      slotOpacity: body.slotOpacity,
      excludeSlots: body.keepSlotsOnRegions ? [] : painted,
    });
    await assertGuiCanvas(png);

    return NextResponse.json({
      kind: "gui",
      presetId: preset.id,
      texturePath: preset.texturePath,
      width: 256,
      height: 256,
      guiWidth: W,
      guiHeight: H,
      image: dataUrl(png),
      layers: used,
      note: notes.length ? notes.join(" / ") : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
