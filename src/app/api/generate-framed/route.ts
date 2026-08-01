import { NextResponse } from "next/server";
import sharp from "sharp";
import { findPreset } from "@/lib/mc/canvas";
import {
  allSlotRects,
  boundingBox,
  containerSlotCount,
  wellRect,
  type Region,
} from "@/lib/mc/regions";
import { buildFontTexture } from "@/lib/image/pixelize";
import { compositeRegion } from "@/lib/image/compose";
import {
  SUB_PANEL_STYLES,
  expandToPanel,
  renderSvgLayer,
  slotMarkersSvg,
  subPanelFillSvg,
  subPanelFrameSvg,
  vanillaPanelSvg,
  type MarkerStyle,
} from "@/lib/image/frame";
import { generateImage, defaultProvider, type ProviderId } from "@/lib/ai/image";
import { refineWithClaude } from "@/lib/ai/prompt";
import {
  buildFontJson,
  buildTitleStrings,
  glyphCharAt,
  stringifyFontJson,
  type FontGuiSpec,
} from "@/lib/mc/font";

export const runtime = "nodejs";
export const maxDuration = 300;

type FramedRegion = Region & {
  /** SUB_PANEL_STYLES 키 */
  panelStyle?: string;
  markers?: MarkerStyle;
};

type Body = {
  presetId?: string;
  regions: FramedRegion[];
  /** 서브패널 안쪽 재질을 AI로 채울지. 끄면 단색. */
  useAiFill?: boolean;
  /** 플레이어 인벤토리 슬롯을 바닐라 우물로 그릴지 */
  drawPlayerInventory?: boolean;
  namespace?: string;
  assetName?: string;
  glyphTop?: number;
  glyphLeft?: number;
  pixelBlock?: number;
  colors?: number;
  punch?: number;
  provider?: ProviderId;
  refine?: boolean;
};

const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
const sanitizeId = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9_.-]/g, "_").replace(/^_+|_+$/g, "") || "custom";

/**
 * 재질만 뽑는 프롬프트. 구조(테두리·격자)는 코드가 그리므로
 * 모델에게는 "이음매 없이 이어지는 재질"만 요구한다.
 */
function materialPrompt(subject: string): string {
  return [
    "pixel art texture, 16-bit game art, flat cel shaded, limited palette, visible square pixels,",
    `${subject},`,
    "seamless flat material filling the entire frame, straight-on view, even lighting,",
    "no border, no frame, no panel edges, no vignette, no text",
  ].join(" ");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const preset = findPreset(body.presetId ?? "chest_6");
  const provider = body.provider ?? defaultProvider();
  const { guiWidth: W, guiHeight: H } = preset;

  const rects = allSlotRects(preset);
  const containerCount = containerSlotCount(preset);

  const notes: string[] = [];
  const layers: { label: string; slots: number; provider?: string }[] = [];

  try {
    // 1) 바닐라 회색 베벨 패널
    let canvas = await renderSvgLayer(W, H, [vanillaPanelSvg(W, H)]);

    // 2) 영역마다: 재질 → 액자 → 슬롯 마커
    for (const region of body.regions ?? []) {
      if (!region.slots?.length) continue;

      const slotBox = boundingBox(preset, region.slots);
      if (!slotBox) continue;

      const panel = expandToPanel(slotBox);
      const style = SUB_PANEL_STYLES[region.panelStyle ?? "purple"] ?? SUB_PANEL_STYLES.purple;

      // 2-a) 안쪽 채움
      if (body.useAiFill !== false && region.prompt?.trim()) {
        let prompt = materialPrompt(region.prompt);
        if (body.refine) prompt = await refineWithClaude(prompt);

        const gen = await generateImage(
          { prompt, width: panel.w * 8, height: panel.h * 8 },
          provider
        );
        if (gen.note) notes.push(`${region.label}: ${gen.note}`);

        const art = await buildFontTexture(gen.png, panel.w, panel.h, {
          pixelBlock: body.pixelBlock ?? 2,
          colors: body.colors,
          punch: body.punch,
        });
        canvas = await compositeRegion(canvas, art, { width: W, height: H }, panel, [panel]);
        layers.push({
          label: region.label,
          slots: region.slots.length,
          provider: gen.provider,
        });
      } else {
        const fill = await renderSvgLayer(W, H, [subPanelFillSvg(panel, style)]);
        canvas = await sharp(canvas)
          .composite([{ input: fill, top: 0, left: 0 }])
          .png()
          .toBuffer();
        layers.push({ label: region.label, slots: region.slots.length });
      }

      // 2-b) 액자 + 슬롯 마커 (재질 위에 얹혀야 선이 살아난다)
      const overlay = await renderSvgLayer(W, H, [
        subPanelFrameSvg(panel, style),
        slotMarkersSvg(
          region.slots.map((i) => rects[i]).filter(Boolean).map(wellRect),
          region.markers ?? "dotted"
        ),
      ]);
      canvas = await sharp(canvas)
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // 3) 플레이어 인벤토리는 바닐라 그대로
    if (body.drawPlayerInventory !== false && preset.playerInventory) {
      const invRects = rects.slice(containerCount).map(wellRect);
      const inv = await renderSvgLayer(W, H, [slotMarkersSvg(invRects, "well")]);
      canvas = await sharp(canvas)
        .composite([{ input: inv, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // 4) 폰트 GUI 자산으로 내보낸다 (항상)
    const ns = sanitizeId(body.namespace ?? "custom");
    const assetName = sanitizeId(body.assetName ?? "gui");
    const spec: FontGuiSpec = {
      namespace: ns,
      fontName: assetName,
      glyphChar: glyphCharAt(0),
      texturePath: `gui/${assetName}.png`,
      imageWidth: W,
      imageHeight: H,
      renderHeight: H,
      glyphTop: body.glyphTop ?? 0,
      glyphLeft: body.glyphLeft ?? 0,
    };

    return NextResponse.json({
      kind: "framed",
      width: W,
      height: H,
      image: dataUrl(canvas),
      layers,
      note: notes.length ? notes.join(" / ") : undefined,
      title: buildTitleStrings(spec),
      font: {
        path: `assets/${ns}/font/${assetName}.json`,
        content: stringifyFontJson(buildFontJson(spec)),
      },
      texture: { path: `assets/${ns}/textures/gui/${assetName}.png` },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
