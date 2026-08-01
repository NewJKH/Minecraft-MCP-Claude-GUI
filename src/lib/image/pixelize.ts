import sharp from "sharp";
import { GUI_CANVAS, type GuiPreset, type ItemSize } from "@/lib/mc/canvas";
import { renderSlotOverlay, type SlotStyle } from "@/lib/image/slots";

export type PixelizeOptions = {
  /** 논리 픽셀 격자 크기. 이 크기로 줄였다가 nearest로 다시 키워 '픽셀 덩어리'를 만든다. */
  logicalWidth: number;
  logicalHeight: number;
  /** 팔레트 색 수 제한 (2~256). 없으면 양자화 안 함. */
  colors?: number;
  /**
   * 채도/대비 부스트. 확산 모델 출력은 팔레트를 줄이면 회색으로 뭉개지므로
   * 양자화 전에 색을 미리 밀어 올린다. 1 = 그대로.
   */
  punch?: number;
  /** 이 색과 tolerance 안쪽이면 투명 처리 (예: "#00ff00") */
  keyColor?: string;
  keyTolerance?: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** keyColor 근처 픽셀의 알파를 0으로 만든다. */
async function applyColorKey(
  input: Buffer,
  keyColor: string,
  tolerance: number
): Promise<Buffer> {
  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const [kr, kg, kb] = hexToRgb(keyColor);
  const tol2 = tolerance * tolerance;
  for (let i = 0; i < data.length; i += info.channels) {
    const dr = data[i] - kr;
    const dg = data[i + 1] - kg;
    const db = data[i + 2] - kb;
    if (dr * dr + dg * dg + db * db <= tol2) data[i + 3] = 0;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels as 4 },
  })
    .png()
    .toBuffer();
}

/**
 * 이미지를 논리 격자에 스냅해 픽셀아트로 만든다.
 * 결과는 logicalWidth x logicalHeight 크기의 PNG(원본 해상도, 확대 없음).
 */
export async function pixelize(
  input: Buffer,
  opts: PixelizeOptions
): Promise<Buffer> {
  let buf = input;
  if (opts.keyColor) {
    buf = await applyColorKey(buf, opts.keyColor, opts.keyTolerance ?? 40);
  }

  let pipeline = sharp(buf).ensureAlpha();

  const punch = opts.punch ?? 1;
  if (punch !== 1) {
    // 대비는 중간값(128) 기준으로 벌린다
    pipeline = pipeline
      .modulate({ saturation: punch })
      .linear(punch, 128 * (1 - punch));
  }

  // 논리 격자로 축소 (면적 평균 성격의 축소라 색이 자연스럽게 섞인다)
  pipeline = pipeline.resize(opts.logicalWidth, opts.logicalHeight, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  });

  if (opts.colors && opts.colors >= 2 && opts.colors <= 256) {
    pipeline = pipeline.png({ palette: true, colors: opts.colors, dither: 0 });
  } else {
    pipeline = pipeline.png();
  }

  return pipeline.toBuffer();
}

/** nearest로 확대만 (미리보기용). */
export async function upscaleNearest(
  input: Buffer,
  factor: number
): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = (meta.width ?? 1) * factor;
  const h = (meta.height ?? 1) * factor;
  return sharp(input)
    .resize(w, h, { kernel: sharp.kernel.nearest, fit: "fill" })
    .png()
    .toBuffer();
}

/**
 * GUI 텍스처를 만든다.
 *
 * **파일은 무조건 256x256.** 그림은 좌상단에 guiWidth x guiHeight 만큼만 놓이고
 * 나머지는 투명하게 남는다. 이 규격을 깨면 게임에서 GUI가 어긋난다.
 *
 * @param pixelBlock 몇 픽셀을 한 덩어리로 볼지 (1이면 원본 해상도 그대로)
 */
export async function buildGuiTexture(
  input: Buffer,
  preset: GuiPreset,
  opts: {
    pixelBlock?: number;
    colors?: number;
    punch?: number;
    keyColor?: string;
    keyTolerance?: number;
    /** 슬롯 우물을 텍스처에 박을지 (기본 true). 바닐라 텍스처는 슬롯이 그려져 있다. */
    drawSlots?: boolean;
    slotStyle?: SlotStyle;
    slotOpacity?: number;
  } = {}
): Promise<Buffer> {
  const block = Math.max(1, Math.floor(opts.pixelBlock ?? 1));
  const lw = Math.max(1, Math.round(preset.guiWidth / block));
  const lh = Math.max(1, Math.round(preset.guiHeight / block));

  // 논리 격자로 줄였다가
  const small = await pixelize(input, {
    logicalWidth: lw,
    logicalHeight: lh,
    colors: opts.colors,
    punch: opts.punch,
    keyColor: opts.keyColor,
    keyTolerance: opts.keyTolerance,
  });

  // GUI 실제 크기로 nearest 확대 (픽셀 각 살리기)
  let art = await sharp(small)
    .resize(preset.guiWidth, preset.guiHeight, {
      kernel: sharp.kernel.nearest,
      fit: "fill",
    })
    .png()
    .toBuffer();

  // 슬롯 우물은 AI가 못 맞추므로 정확한 좌표로 직접 박는다
  if (opts.drawSlots !== false) {
    const overlay = await renderSlotOverlay(
      preset,
      opts.slotStyle ?? "vanilla",
      opts.slotOpacity ?? 1
    );
    art = await sharp(art)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }

  // 256x256 투명 캔버스 좌상단에 합성
  return sharp({
    create: {
      width: GUI_CANVAS,
      height: GUI_CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: art, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** 결과가 정말 256x256인지 확인 (빌드 게이트). */
export async function assertGuiCanvas(buf: Buffer): Promise<void> {
  const meta = await sharp(buf).metadata();
  if (meta.width !== GUI_CANVAS || meta.height !== GUI_CANVAS) {
    throw new Error(
      `GUI 텍스처는 ${GUI_CANVAS}x${GUI_CANVAS} 여야 합니다. 현재: ${meta.width}x${meta.height}`
    );
  }
}

/** 아이템 텍스처는 정사각 16/32/64. */
export async function buildItemTexture(
  input: Buffer,
  size: ItemSize,
  opts: {
    colors?: number;
    punch?: number;
    keyColor?: string;
    keyTolerance?: number;
  } = {}
): Promise<Buffer> {
  return pixelize(input, {
    logicalWidth: size,
    logicalHeight: size,
    colors: opts.colors,
    punch: opts.punch,
    keyColor: opts.keyColor,
    keyTolerance: opts.keyTolerance,
  });
}
