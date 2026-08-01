import type { GuiPreset, ItemSize } from "@/lib/mc/canvas";
import type { ArtStyle } from "@/lib/ai/styles";

export type { ArtStyle };

/**
 * 이미지 모델에 넘길 프롬프트를 만든다.
 * Claude는 여기서 '사용자 문장 → 텍스처 묘사'로 다듬는 역할만 한다 (이미지 생성 불가).
 */

/**
 * 확산 모델은 그냥 두면 회화풍(부드러운 조명·블러·안티에일리어싱)으로 흘러간다.
 * 픽셀아트를 얻으려면 "픽셀아트"라고 말하는 것만으로 부족하고,
 * 외곽선·평면채색·팔레트 제한을 명시하고 사진풍 어휘를 직접 금지해야 한다.
 */
const PIXEL_CORE =
  "pixel art, 16-bit SNES sprite art, thick dark outlines, flat cel-shaded colors, " +
  "limited palette, visible square pixels, hard-edged shading";

// 부정문은 짧게. FLUX는 긴 금지 목록을 잘 못 지키고, "no text"를 길게 늘어놓으면
// 오히려 글자를 그려 넣는다.
const NOT_PAINTERLY = "not photorealistic, no blur, no soft gradients";

/**
 * 스타일 토큰을 **문장 맨 앞**에 둔다. 확산 모델은 앞쪽 토큰에 가중치를 크게 주므로
 * 주제부터 쓰면 스타일이 통째로 무시된다.
 *
 * "menu", "UI", "screen" 같은 단어는 피한다 — 모델이 소프트웨어 목업을 그려버린다.
 */
const STYLE_RULES: Record<ArtStyle, { lead: string; tail: string }> = {
  vanilla: {
    lead: `${PIXEL_CORE}, muted grey stone and wood tones, low contrast`,
    tail:
      "a plain beveled rectangular panel, raised border with light top-left edge " +
      `and dark bottom-right edge, ${NOT_PAINTERLY}`,
  },

  // 레퍼런스: MARKETPLACE 판 — 색 블록으로 구획된 알록달록한 판때기
  pixel_ui: {
    lead: `${PIXEL_CORE}, bright candy palette of teal lime purple orange and cream`,
    tail:
      "drawn as a signboard split into several flat colored rectangles, " +
      "each rectangle framed by a thick dark border and a lighter inner edge, " +
      "cute chibi characters and props sitting inside the rectangles, " +
      `straight-on front view, ${NOT_PAINTERLY}`,
  },

  // 레퍼런스: 대장간 화덕 — 장면 일러스트
  pixel_scene: {
    lead: `${PIXEL_CORE}, warm rich colors, strong silhouettes`,
    tail:
      "an interior scene with props arranged symmetrically against a back wall, " +
      "single warm light source with hard-edged light pools, " +
      `straight-on front view, no vanishing point, ${NOT_PAINTERLY}`,
  },
};

const ITEM_RULES = [
  "centered single object filling most of the frame, plain solid background",
  "front-facing 45-degree Minecraft item angle",
  NOT_PAINTERLY,
  "no ground shadow",
].join(", ");

export function buildGuiPrompt(
  userPrompt: string,
  preset: GuiPreset,
  style: ArtStyle = "vanilla",
  opts: { drawSlots?: boolean } = {}
): string {
  const { lead, tail } = STYLE_RULES[style];

  const parts = [
    `${lead}.`,
    `${userPrompt},`,
    tail + ",",
    "fills the whole frame edge to edge, no margin",
  ];

  // 슬롯을 나중에 합성한다면 그 자리는 비워둬야 그림이 다 묻힌다
  if (opts.drawSlots !== false) {
    parts.push(
      "keep the lower two thirds quiet and flat, put the detail in the top band and along the border"
    );
  }

  parts.push("no text");
  return parts.join(" ");
}

/**
 * 폰트 오프셋 GUI는 크기 제약이 없어 화면 전체를 쓰는 큰 판을 그릴 수 있다.
 * 컨테이너 슬롯을 피할 이유도 없으므로 구도를 따로 제한하지 않는다.
 */
export function buildFontGuiPrompt(
  userPrompt: string,
  width: number,
  height: number,
  style: ArtStyle = "pixel_ui"
): string {
  const { lead, tail } = STYLE_RULES[style];
  return [
    `${lead}.`,
    `${userPrompt},`,
    tail + ",",
    `composed for a ${width}:${height} frame, fills it edge to edge, no margin,`,
    "no text",
  ].join(" ");
}

export function buildItemPrompt(userPrompt: string, size: ItemSize): string {
  return [
    `${PIXEL_CORE}.`,
    `${userPrompt},`,
    ITEM_RULES + ",",
    `chunky shapes that stay readable when shrunk to ${size} pixels,`,
    "no text",
  ].join(" ");
}

/** ANTHROPIC_API_KEY가 있으면 프롬프트를 다듬는다. 없으면 원문 그대로. */
export async function refineWithClaude(prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return prompt;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 400,
      system:
        "You rewrite image-generation prompts for Minecraft resource pack textures. " +
        "Keep every hard constraint from the input. Add concrete color, material and motif detail. " +
        "Reply with the rewritten prompt only, in English, one paragraph, no preamble.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    return text || prompt;
  } catch {
    return prompt;
  }
}
