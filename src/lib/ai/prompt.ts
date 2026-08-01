import type { GuiPreset, ItemSize } from "@/lib/mc/canvas";

/**
 * 이미지 모델에 넘길 프롬프트를 만든다.
 * Claude는 여기서 '사용자 문장 → 텍스처 묘사'로 다듬는 역할만 한다 (이미지 생성 불가).
 */

const GUI_RULES = [
  "flat 2D game UI panel texture, orthographic front view, no perspective, no 3D tilt",
  "Minecraft resource pack art style, crisp pixel edges, limited palette, hard shadows",
  "the panel fills the entire frame edge to edge, centered, no drop shadow outside the panel",
  "no text, no letters, no numbers, no watermark, no logo",
  "no characters, no hands, no cursor",
].join(", ");

const ITEM_RULES = [
  "single game item icon, flat front-facing 45-degree Minecraft item style",
  "pixel art, crisp hard edges, limited palette, strong outline",
  "centered, fills most of the frame, plain solid background",
  "no text, no watermark, no shadow on the ground",
].join(", ");

export function buildGuiPrompt(userPrompt: string, preset: GuiPreset): string {
  return [
    `A Minecraft container GUI background panel: ${userPrompt}.`,
    `Aspect ratio must match ${preset.guiWidth}x${preset.guiHeight}.`,
    `Leave ${preset.slots.length} inventory slot areas readable — keep the panel interior calm and low-contrast so item icons stay visible.`,
    GUI_RULES,
  ].join(" ");
}

export function buildItemPrompt(userPrompt: string, size: ItemSize): string {
  return [
    `A Minecraft item texture: ${userPrompt}.`,
    `It will be downscaled to ${size}x${size} pixels, so keep shapes chunky and readable at that size.`,
    ITEM_RULES,
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
