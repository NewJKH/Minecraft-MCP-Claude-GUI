import { NextResponse } from "next/server";
import sharp from "sharp";
import { findPreset } from "@/lib/mc/canvas";
import {
  allSlotRects,
  boundingBox,
  containerSlotCount,
  layoutPanels,
  wellRect,
  type Box,
  type Region,
} from "@/lib/mc/regions";
import { buildFontTexture } from "@/lib/image/pixelize";
import { compositeRegion } from "@/lib/image/compose";
import {
  SUB_PANEL_STYLES,
  renderSvgLayer,
  buttonTilesSvg,
  scrollBarSvg,
  shelfBoardsSvg,
  slotMarkersSvg,
  titleBarSvg,
  subPanelFillSvg,
  subPanelFrameSvg,
  vanillaPanelSvg,
  type MarkerStyle,
} from "@/lib/image/frame";
import {
  MATERIALS,
  hexToRgb,
  renderMaterial,
  shade,
  type MaterialKind,
} from "@/lib/image/materials";
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
  /**
   * 이 영역을 무엇으로 그릴지.
   * - panel   : 재질 채운 서브패널 (기본)
   * - buttons : 칸마다 눌리는 버튼 타일
   * - title   : 글자가 앉을 타이틀 바
   */
  render?: "panel" | "buttons" | "title";
  /** SUB_PANEL_STYLES 키 */
  panelStyle?: string;
  markers?: MarkerStyle;
  /** 절차적 재질. 지정하면 AI 대신 이걸 쓴다 (훨씬 깔끔하다). */
  material?: MaterialKind;
  materialColor?: string;
  seed?: number;
  /** 슬롯 줄마다 아래에 널판을 깐다 */
  shelves?: boolean;
};

/** 재질 색에서 널판 3톤을 뽑는다 */
function shelfColor(hex: string) {
  const base = hexToRgb(hex);
  const css = (c: [number, number, number]) =>
    `rgb(${c[0]},${c[1]},${c[2]})`;
  // 널판은 뒷벽보다 어두워야 앞으로 튀어나와 보인다.
  return {
    face: css(shade(base, -0.07)),
    light: css(shade(base, 0.16)),
    dark: css(shade(base, -0.3)),
  };
}

type Body = {
  presetId?: string;
  /**
   * 통짜 프레임. 지정하면 컨테이너 슬롯 전체를 감싸는 액자를 하나만 그리고,
   * 안쪽 영역들은 자기 액자 없이 재질·슬롯만 얹는다.
   * 서브패널이 여러 개 떠 있는 것보다 훨씬 통일감이 있다.
   */
  frame?: {
    panelStyle?: string;
    material?: MaterialKind;
    materialColor?: string;
    seed?: number;
    /** 슬롯 바깥 여백 */
    padding?: number;
  };
  regions: FramedRegion[];
  /** 서브패널 안쪽 재질을 AI로 채울지. 끄면 단색. */
  useAiFill?: boolean;
  /** 플레이어 인벤토리 슬롯을 바닐라 우물로 그릴지 */
  drawPlayerInventory?: boolean;
  /** 세로 스크롤바. GUI 좌표로 직접 지정한다. */
  scrollBar?: {
    x: number;
    y: number;
    w?: number;
    h: number;
    panelStyle?: string;
    thumbAt?: number;
  };
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

    // 1-b) 통짜 프레임. 컨테이너 슬롯 전체를 한 액자로 감싼다.
    const unified = body.frame;
    let frameBox: Box | null = null;

    if (unified) {
      const containerIdx = Array.from({ length: containerCount }, (_, i) => i);
      const inner = boundingBox(preset, containerIdx);
      if (inner) {
        const pad = unified.padding ?? 6;
        frameBox = {
          x: Math.max(1, inner.x - pad),
          y: Math.max(1, inner.y - pad),
          w: Math.min(W - 2, inner.w + pad * 2),
          h: Math.min(H - 2, inner.h + pad * 2),
        };

        const fStyle =
          SUB_PANEL_STYLES[unified.panelStyle ?? "slate"] ?? SUB_PANEL_STYLES.slate;

        if (unified.material) {
          const mat = await renderMaterial(
            unified.material,
            frameBox.w,
            frameBox.h,
            unified.materialColor ??
              MATERIALS.find((m) => m.id === unified.material)?.defaultColor ??
              "#4a4a4e",
            unified.seed ?? 1
          );
          canvas = await compositeRegion(
            canvas,
            mat,
            { width: W, height: H },
            frameBox,
            [frameBox]
          );
        } else {
          const fill = await renderSvgLayer(W, H, [subPanelFillSvg(frameBox, fStyle)]);
          canvas = await sharp(canvas)
            .composite([{ input: fill, top: 0, left: 0 }])
            .png()
            .toBuffer();
        }

        const border = await renderSvgLayer(W, H, [subPanelFrameSvg(frameBox, fStyle, 4)]);
        canvas = await sharp(canvas)
          .composite([{ input: border, top: 0, left: 0 }])
          .png()
          .toBuffer();

        layers.push({ label: "프레임", slots: 0, provider: unified.material ?? "flat" });
      }
    }

    // 2) 영역마다: 재질 → 액자 → 슬롯 마커.
    //    액자 두께는 이웃 영역과의 간격에 맞춰 변마다 따로 줄인다.
    const active = (body.regions ?? []).filter((r) => r.slots?.length);
    const placed = layoutPanels(
      preset,
      active.map((r) => r.slots)
    );

    for (let ri = 0; ri < active.length; ri++) {
      const region = active[ri];
      const { box: panel, insets } = placed[ri];

      const tight = Object.entries(insets)
        .filter(([, v]) => v < 4)
        .map(([k]) => k);
      // 통짜 프레임 안에서는 영역별 액자를 안 그리므로 겹칠 일도 없다
      if (!unified && tight.length && region.render !== "buttons") {
        notes.push(
          `${region.label}: ${tight.join("/")} 쪽이 이웃과 붙어 액자를 줄였습니다 (한 줄 띄우면 4px)`
        );
      }

      const style = SUB_PANEL_STYLES[region.panelStyle ?? "purple"] ?? SUB_PANEL_STYLES.purple;
      const wells = region.slots.map((i) => rects[i]).filter(Boolean).map(wellRect);
      const mode = region.render ?? "panel";

      // 버튼 줄 / 타이틀 바는 재질도 액자도 필요 없다. 통째로 그리고 넘어간다.
      if (mode !== "panel") {
        const layer = await renderSvgLayer(W, H, [
          mode === "buttons"
            ? buttonTilesSvg(wells, style)
            : titleBarSvg(panel, style, insets),
        ]);
        canvas = await sharp(canvas)
          .composite([{ input: layer, top: 0, left: 0 }])
          .png()
          .toBuffer();
        layers.push({
          label: region.label,
          slots: region.slots.length,
          provider: mode,
        });
        continue;
      }

      // 통짜 프레임 안에서는 영역이 재질을 덧칠하지 않는다.
      // 프레임 재질이 그대로 비쳐야 한 덩어리로 읽힌다.
      const skipFill = Boolean(unified) && !region.material;

      // 2-a) 안쪽 채움. 절차적 재질이 지정돼 있으면 그걸 우선한다.
      if (skipFill) {
        layers.push({ label: region.label, slots: region.slots.length });
      } else if (region.material) {
        const mat = await renderMaterial(
          region.material,
          panel.w,
          panel.h,
          region.materialColor ??
            MATERIALS.find((m) => m.id === region.material)?.defaultColor ??
            "#6b4423",
          region.seed ?? 1
        );
        canvas = await compositeRegion(canvas, mat, { width: W, height: H }, panel, [panel]);
        layers.push({
          label: region.label,
          slots: region.slots.length,
          provider: `material:${region.material}`,
        });
      } else if (body.useAiFill !== false && region.prompt?.trim()) {
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

      // 2-b) 선반 널판 → 액자 → 슬롯 마커 순. 전부 재질 위에 얹혀야 선이 산다.
      const boardColor = shelfColor(region.materialColor ?? "#6b4423");

      const frameStyle = unified
        ? SUB_PANEL_STYLES[unified.panelStyle ?? "slate"] ?? SUB_PANEL_STYLES.slate
        : style;

      const overlay = await renderSvgLayer(W, H, [
        region.shelves ? shelfBoardsSvg(wells, panel, boardColor) : "",
        // 통짜 프레임이면 영역마다 액자를 두르지 않는다
        unified ? "" : subPanelFrameSvg(panel, style, insets),
        // 통짜 프레임 안의 기본 마커는 프레임 색으로 파인 슬롯
        slotMarkersSvg(
          wells,
          region.markers ?? (unified ? "recessed" : "none"),
          frameStyle
        ),
      ]);
      canvas = await sharp(canvas)
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // 2-c) 스크롤바
    if (body.scrollBar) {
      const sb = body.scrollBar;
      const style =
        SUB_PANEL_STYLES[sb.panelStyle ?? "slate"] ?? SUB_PANEL_STYLES.slate;
      const layer = await renderSvgLayer(W, H, [
        scrollBarSvg(
          { x: sb.x, y: sb.y, w: sb.w ?? 8, h: sb.h },
          style,
          sb.thumbAt ?? 0.15
        ),
      ]);
      canvas = await sharp(canvas)
        .composite([{ input: layer, top: 0, left: 0 }])
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
