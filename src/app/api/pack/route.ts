import { buildResourcePack, type PackFile } from "@/lib/pack/build";
import { assertGuiCanvas } from "@/lib/image/pixelize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Entry = {
  path: string;
  /** data:image/png;base64,... */
  image: string;
  /** true면 256x256 규격 검사를 강제한다 */
  isGui?: boolean;
};

/** 폰트 json처럼 텍스트로 들어가는 파일 */
type TextEntry = {
  path: string;
  content: string;
};

type Body = {
  name?: string;
  description?: string;
  packFormat?: number;
  entries: Entry[];
  textFiles?: TextEntry[];
};

function decode(dataUrl: string): Buffer {
  const i = dataUrl.indexOf(",");
  return Buffer.from(i >= 0 ? dataUrl.slice(i + 1) : dataUrl, "base64");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  if (!body.entries?.length && !body.textFiles?.length) {
    return NextResponse.json({ error: "내보낼 텍스처가 없습니다." }, { status: 400 });
  }

  const files: PackFile[] = [];
  try {
    for (const e of body.entries ?? []) {
      const data = decode(e.image);
      if (e.isGui) await assertGuiCanvas(data);
      files.push({ path: e.path, data });
    }
    for (const t of body.textFiles ?? []) {
      files.push({ path: t.path, data: Buffer.from(t.content, "utf8") });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const name = body.name?.trim() || "my-pack";
  const zip = await buildResourcePack(
    {
      name,
      description: body.description?.trim() || `${name} — Minecraft GUI Studio`,
      packFormat: body.packFormat ?? 34,
    },
    files
  );

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.zip"`,
    },
  });
}
