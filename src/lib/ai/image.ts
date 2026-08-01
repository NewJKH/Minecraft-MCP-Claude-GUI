/**
 * 이미지 생성 provider 추상화.
 *
 * 주의: Claude(Anthropic) API는 이미지를 생성하지 못한다. 텍스트/코드 전용이다.
 * 그림은 여기 있는 이미지 모델이 뽑고, Claude는 prompt.ts에서 프롬프트 정제만 맡는다.
 * 키가 하나도 없으면 procedural 패널로 폴백해서 앱은 그대로 동작한다.
 */

import { renderProceduralPanel } from "@/lib/image/panel";

export type ProviderId =
  | "pollinations"
  | "cloudflare"
  | "gemini"
  | "openai"
  | "procedural";

export type GenerateArgs = {
  prompt: string;
  /** 생성 요청 해상도. 후처리에서 어차피 규격으로 줄이므로 크게 뽑는 게 유리. */
  width: number;
  height: number;
  seed?: number;
};

export type GenerateResult = {
  png: Buffer;
  provider: ProviderId;
  /** 폴백이 일어났으면 이유 */
  note?: string;
};

export function availableProviders(): ProviderId[] {
  const out: ProviderId[] = [];
  // 키가 필요 없는 무료 provider — 항상 사용 가능
  if (process.env.DISABLE_POLLINATIONS !== "1") out.push("pollinations");
  if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) out.push("cloudflare");
  if (process.env.GEMINI_API_KEY) out.push("gemini");
  if (process.env.OPENAI_API_KEY) out.push("openai");
  out.push("procedural");
  return out;
}

export function defaultProvider(): ProviderId {
  const pref = process.env.IMAGE_PROVIDER as ProviderId | undefined;
  const avail = availableProviders();
  if (pref && avail.includes(pref)) return pref;
  return avail[0];
}

/**
 * 확산 모델은 64의 배수 해상도를 좋아하고, 무료 티어는 대체로 1024를 넘기면 거절한다.
 * 종횡비는 유지하면서 긴 변을 1024로 맞추고 64 단위로 스냅한다.
 */
function fitRequestSize(width: number, height: number): [number, number] {
  const max = 1024;
  const scale = Math.min(1, max / Math.max(width, height));
  const snap = (v: number) =>
    Math.max(256, Math.min(max, Math.round((v * scale) / 64) * 64));
  return [snap(width), snap(height)];
}

/**
 * Pollinations.ai — API 키도 가입도 필요 없는 무료 FLUX 엔드포인트.
 * 대신 SLA가 없고 rate limit이 예고 없이 바뀔 수 있어 실패 시 폴백이 중요하다.
 */
async function generatePollinations(args: GenerateArgs): Promise<Buffer> {
  const model = process.env.POLLINATIONS_MODEL ?? "flux";
  const [w, h] = fitRequestSize(args.width, args.height);
  // 시드가 없으면 같은 프롬프트에 같은 이미지가 캐시로 돌아온다 → 매번 랜덤
  const seed = args.seed ?? Math.floor(Math.random() * 1_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}` +
    `?width=${w}&height=${h}&model=${model}&nologo=true&safe=true&seed=${seed}`;

  const res = await fetch(url, {
    // 무료 엔드포인트가 느릴 때가 있어 넉넉히 잡는다
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Pollinations ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error("Pollinations가 빈 이미지를 반환했습니다.");
  return buf;
}

/** Cloudflare Workers AI — 무료 티어(하루 10,000 뉴런)로 FLUX.1-schnell 사용. */
async function generateCloudflare(args: GenerateArgs): Promise<Buffer> {
  const account = process.env.CF_ACCOUNT_ID!;
  const model = process.env.CF_IMAGE_MODEL ?? "@cf/black-forest-labs/flux-1-schnell";

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: args.prompt, steps: 4 }),
      signal: AbortSignal.timeout(90_000),
    }
  );

  if (!res.ok) {
    throw new Error(`Cloudflare ${res.status} ${await res.text().catch(() => "")}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as { result?: { image?: string } };
    const b64 = json.result?.image;
    if (!b64) throw new Error("Cloudflare 응답에 이미지가 없습니다.");
    return Buffer.from(b64, "base64");
  }
  // SDXL 계열은 PNG 바이너리를 그대로 준다
  return Buffer.from(await res.arrayBuffer());
}

async function generateGemini(args: GenerateArgs): Promise<Buffer> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

  const res = await ai.models.generateContent({
    model,
    contents: args.prompt,
  });

  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini 응답에 이미지가 없습니다.");
}

async function generateOpenAI(args: GenerateArgs): Promise<Buffer> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

  const res = await client.images.generate({
    model,
    prompt: args.prompt,
    size: "1024x1024",
    background: "transparent",
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI 응답에 이미지가 없습니다.");
  return Buffer.from(b64, "base64");
}

export async function generateImage(
  args: GenerateArgs,
  provider: ProviderId = defaultProvider()
): Promise<GenerateResult> {
  try {
    if (provider === "pollinations") {
      return { png: await generatePollinations(args), provider };
    }
    if (provider === "cloudflare" && process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) {
      return { png: await generateCloudflare(args), provider };
    }
    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      return { png: await generateGemini(args), provider };
    }
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      return { png: await generateOpenAI(args), provider };
    }
  } catch (e) {
    const note = e instanceof Error ? e.message : String(e);
    return {
      png: await renderProceduralPanel(args.width, args.height, args.seed),
      provider: "procedural",
      note: `${provider} 실패 → procedural 폴백: ${note}`,
    };
  }

  return {
    png: await renderProceduralPanel(args.width, args.height, args.seed),
    provider: "procedural",
    note:
      provider === "procedural"
        ? undefined
        : `${provider} API 키가 없어 procedural로 대체했습니다.`,
  };
}
