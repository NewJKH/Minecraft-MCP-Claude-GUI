import JSZip from "jszip";

/**
 * pack_format 표. 마인크래프트가 버전마다 올리는 값이라 UI에서 직접 수정 가능하게 두었다.
 * 새 버전이 나오면 여기만 갱신하면 된다.
 */
export const PACK_FORMATS: { version: string; format: number }[] = [
  { version: "1.20.1", format: 15 },
  { version: "1.20.2", format: 18 },
  { version: "1.20.4", format: 22 },
  { version: "1.20.6", format: 32 },
  { version: "1.21.1", format: 34 },
  { version: "1.21.3", format: 42 },
  { version: "1.21.4", format: 46 },
  { version: "1.21.5", format: 55 },
  { version: "1.21.8", format: 64 },
];

export type PackFile = {
  /** assets/ 부터 시작하는 zip 내부 경로 */
  path: string;
  data: Buffer;
};

export type PackMeta = {
  name: string;
  description: string;
  packFormat: number;
  /** pack.png 로 쓸 이미지 (선택) */
  icon?: Buffer;
};

export async function buildResourcePack(
  meta: PackMeta,
  files: PackFile[]
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "pack.mcmeta",
    JSON.stringify(
      {
        pack: {
          pack_format: meta.packFormat,
          description: meta.description,
        },
      },
      null,
      2
    )
  );

  if (meta.icon) zip.file("pack.png", meta.icon);

  for (const f of files) zip.file(f.path, f.data);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

/** 바닐라 GUI 텍스처 덮어쓰기 경로 */
export function vanillaTexturePath(relative: string): string {
  return `assets/minecraft/${relative}`;
}

/** 커스텀 네임스페이스 아이템 텍스처 경로 */
export function namespacedItemPath(ns: string, id: string): string {
  return `assets/${ns}/textures/item/${id}.png`;
}
