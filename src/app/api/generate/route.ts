import { NextResponse } from "next/server";
import { findPreset, ITEM_SIZES, type ItemSize } from "@/lib/mc/canvas";
import {
  buildGuiTexture,
  buildItemTexture,
  buildFontTexture,
  assertGuiCanvas,
  upscaleNearest,
} from "@/lib/image/pixelize";
import { generateImage, defaultProvider, type ProviderId } from "@/lib/ai/image";
import {
  buildGuiPrompt,
  buildItemPrompt,
  buildFontGuiPrompt,
  refineWithClaude,
  type ArtStyle,
} from "@/lib/ai/prompt";
import {
  buildFontJson,
  buildTitleStrings,
  stringifyFontJson,
  glyphCharAt,
  type FontGuiSpec,
} from "@/lib/mc/font";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  kind: "gui" | "item" | "font";
  prompt: string;
  /** kind=font 전용 */
  fontWidth?: number;
  fontHeight?: number;
  glyphTop?: number;
  glyphLeft?: number;
  namespace?: string;
  fontName?: string;
  assetName?: string;
  glyphIndex?: number;
  presetId?: string;
  size?: number;
  pixelBlock?: number;
  colors?: number;
  punch?: number;
  keyColor?: string;
  keyTolerance?: number;
  provider?: ProviderId;
  refine?: boolean;
  drawSlots?: boolean;
  slotStyle?: "vanilla" | "dark" | "light";
  slotOpacity?: number;
  artStyle?: ArtStyle;
};

const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 리소스팩 식별자는 소문자·숫자·_·-·. 만 허용된다. */
const sanitizeId = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9_.-]/g, "_").replace(/^_+|_+$/g, "") || "custom";

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
        punch: body.punch,
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

    if (body.kind === "font") {
      // 폰트 오프셋 GUI는 크기 제약이 없다. 다만 너무 크면 폰트 아틀라스가 부담이라 상한만 둔다.
      const w = clamp(body.fontWidth ?? 320, 16, 1024);
      const h = clamp(body.fontHeight ?? 256, 16, 1024);

      let prompt = buildFontGuiPrompt(body.prompt, w, h, body.artStyle ?? "pixel_ui");
      if (body.refine) prompt = await refineWithClaude(prompt);

      const gen = await generateImage(
        { prompt, width: w * 4, height: h * 4 },
        provider
      );
      const png = await buildFontTexture(gen.png, w, h, {
        colors: body.colors,
        punch: body.punch,
        keyColor: body.keyColor,
        keyTolerance: body.keyTolerance,
      });

      const ns = sanitizeId(body.namespace ?? "custom");
      const assetName = sanitizeId(body.assetName ?? "gui");
      const spec: FontGuiSpec = {
        namespace: ns,
        fontName: sanitizeId(body.fontName ?? "gui"),
        glyphChar: glyphCharAt(body.glyphIndex ?? 0),
        texturePath: `gui/${assetName}.png`,
        imageWidth: w,
        imageHeight: h,
        renderHeight: h, // 1:1 렌더
        glyphTop: body.glyphTop ?? 0,
        glyphLeft: body.glyphLeft ?? 0,
      };

      const title = buildTitleStrings(spec);
      const fontJson = buildFontJson(spec);

      return NextResponse.json({
        kind: "font",
        width: w,
        height: h,
        image: dataUrl(png),
        provider: gen.provider,
        note: gen.note,
        prompt,
        spec,
        title,
        font: {
          path: `assets/${ns}/font/${spec.fontName}.json`,
          content: stringifyFontJson(fontJson),
        },
        texture: { path: `assets/${ns}/textures/gui/${assetName}.png` },
      });
    }

    const preset = findPreset(body.presetId ?? "chest_6");
    let prompt = buildGuiPrompt(body.prompt, preset, body.artStyle ?? "vanilla", {
      drawSlots: body.drawSlots,
    });
    if (body.refine) prompt = await refineWithClaude(prompt);

    const gen = await generateImage(
      { prompt, width: preset.guiWidth * 6, height: preset.guiHeight * 6 },
      provider
    );

    const png = await buildGuiTexture(gen.png, preset, {
      pixelBlock: body.pixelBlock,
      colors: body.colors,
      punch: body.punch,
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
