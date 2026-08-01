import { NextResponse } from "next/server";
import { findPreset, ITEM_SIZES, type ItemSize } from "@/lib/mc/canvas";
import {
  buildGuiTexture,
  buildItemTexture,
  assertGuiCanvas,
  upscaleNearest,
} from "@/lib/image/pixelize";
import { generateImage, defaultProvider, type ProviderId } from "@/lib/ai/image";
import { buildGuiPrompt, buildItemPrompt, refineWithClaude } from "@/lib/ai/prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  kind: "gui" | "item";
  prompt: string;
  presetId?: string;
  size?: number;
  pixelBlock?: number;
  colors?: number;
  keyColor?: string;
  keyTolerance?: number;
  provider?: ProviderId;
  refine?: boolean;
  drawSlots?: boolean;
  slotStyle?: "vanilla" | "dark" | "light";
  slotOpacity?: number;
};

const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "프롬프트가 비었습니다." }, { status: 400 });
  }

  const provider = body.provider ?? defaultProvider();

  try {
    if (body.kind === "item") {
      const size = (ITEM_SIZES as number[]).includes(body.size ?? 16)
        ? ((body.size ?? 16) as ItemSize)
        : 16;

      let prompt = buildItemPrompt(body.prompt, size);
      if (body.refine) prompt = await refineWithClaude(prompt);

      const gen = await generateImage({ prompt, width: 1024, height: 1024 }, provider);
      const png = await buildItemTexture(gen.png, size, {
        colors: body.colors,
        keyColor: body.keyColor,
        keyTolerance: body.keyTolerance,
      });

      return NextResponse.json({
        kind: "item",
        width: size,
        height: size,
        image: dataUrl(png),
        preview: dataUrl(await upscaleNearest(png, Math.max(1, Math.round(256 / size)))),
        provider: gen.provider,
        note: gen.note,
        prompt,
      });
    }

    const preset = findPreset(body.presetId ?? "chest_6");
    let prompt = buildGuiPrompt(body.prompt, preset);
    if (body.refine) prompt = await refineWithClaude(prompt);

    const gen = await generateImage(
      { prompt, width: preset.guiWidth * 6, height: preset.guiHeight * 6 },
      provider
    );

    const png = await buildGuiTexture(gen.png, preset, {
      pixelBlock: body.pixelBlock,
      colors: body.colors,
      keyColor: body.keyColor,
      keyTolerance: body.keyTolerance,
      drawSlots: body.drawSlots,
      slotStyle: body.slotStyle,
      slotOpacity: body.slotOpacity,
    });

    // 256x256 규격 게이트 — 여기서 안 통과하면 절대 내보내지 않는다.
    await assertGuiCanvas(png);

    return NextResponse.json({
      kind: "gui",
      presetId: preset.id,
      texturePath: preset.texturePath,
      width: 256,
      height: 256,
      guiWidth: preset.guiWidth,
      guiHeight: preset.guiHeight,
      image: dataUrl(png),
      provider: gen.provider,
      note: gen.note,
      prompt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
