"use client";

import { useEffect, useMemo, useState } from "react";
import { GUI_PRESETS, ITEM_SIZES, findPreset } from "@/lib/mc/canvas";
import { ART_STYLES, styleDefaults, type ArtStyle } from "@/lib/ai/styles";
import { PACK_FORMATS, vanillaTexturePath, namespacedItemPath } from "@/lib/pack/build";
import { GuiPreview } from "@/components/GuiPreview";

type Kind = "gui" | "item" | "font";

type TextFile = { path: string; content: string };

type Made = {
  id: string;
  kind: Kind;
  path: string;
  image: string;
  label: string;
  isGui: boolean;
  /** 폰트 json처럼 같이 들어가야 하는 텍스트 파일 */
  textFiles?: TextFile[];
};

type FontResult = {
  fontKey: string;
  escaped: string;
  miniMessage: string;
  leadOffset: number;
  advance: number;
  ascent: number;
  texturePath: string;
  fontPath: string;
};

export default function Home() {
  const [kind, setKind] = useState<Kind>("gui");
  const [prompt, setPrompt] = useState("이끼 낀 고대 석재 던전 상자");
  const [presetId, setPresetId] = useState(GUI_PRESETS[0].id);
  const [itemSize, setItemSize] = useState(16);
  const [itemId, setItemId] = useState("my_item");
  const [pixelBlock, setPixelBlock] = useState(2);
  const [colors, setColors] = useState(64);
  const [punch, setPunch] = useState(110);
  const [refine, setRefine] = useState(false);
  const [artStyle, setArtStyle] = useState<ArtStyle>("vanilla");
  const [drawSlots, setDrawSlots] = useState(true);
  const [slotStyle, setSlotStyle] = useState("vanilla");
  const [slotOpacity, setSlotOpacity] = useState(100);

  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [claudeAvailable, setClaudeAvailable] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [made, setMade] = useState<Made[]>([]);

  const [packName, setPackName] = useState("my-pack");
  const [packFormat, setPackFormat] = useState(34);

  // 폰트 오프셋 GUI
  const [fontWidth, setFontWidth] = useState(320);
  const [fontHeight, setFontHeight] = useState(256);
  const [glyphTop, setGlyphTop] = useState(0);
  const [glyphLeft, setGlyphLeft] = useState(0);
  const [namespace, setNamespace] = useState("custom");
  const [assetName, setAssetName] = useState("market");
  const [fontResult, setFontResult] = useState<FontResult | null>(null);

  const preset = useMemo(() => findPreset(presetId), [presetId]);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        setProvider(d.default ?? "");
        setClaudeAvailable(Boolean(d.claudeRefine));
      })
      .catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt,
          presetId,
          size: itemSize,
          pixelBlock,
          colors,
          provider: provider || undefined,
          refine,
          punch: punch / 100,
          artStyle,
          drawSlots,
          slotStyle,
          slotOpacity: slotOpacity / 100,
          fontWidth,
          fontHeight,
          glyphTop,
          glyphLeft,
          namespace,
          assetName,
          fontName: assetName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");

      setCurrent(data.image);
      setNote(data.note ?? null);

      if (kind === "font") {
        setFontResult({
          fontKey: data.title.fontKey,
          escaped: data.title.escaped,
          miniMessage: data.title.miniMessage,
          leadOffset: data.title.leadOffset,
          advance: data.title.advance,
          ascent: JSON.parse(data.font.content).providers[1].ascent,
          texturePath: data.texture.path,
          fontPath: data.font.path,
        });
      }

      setMade((prev) => [
        {
          id: crypto.randomUUID(),
          kind,
          image: data.image,
          isGui: kind === "gui",
          path:
            kind === "gui"
              ? vanillaTexturePath(data.texturePath)
              : kind === "font"
                ? data.texture.path
                : namespacedItemPath("custom", itemId || "my_item"),
          label:
            kind === "gui"
              ? `${preset.label} · 256x256`
              : kind === "font"
                ? `${assetName} · ${data.width}x${data.height}`
                : `${itemId || "my_item"} · ${itemSize}x${itemSize}`,
          textFiles:
            kind === "font"
              ? [{ path: data.font.path, content: data.font.content }]
              : undefined,
        },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportPack() {
    if (!made.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: packName,
          packFormat,
          entries: made.map((m) => ({ path: m.path, image: m.image, isGui: m.isGui })),
          textFiles: made.flatMap((m) => m.textFiles ?? []),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "내보내기 실패");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${packName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0b0e] text-zinc-200">
      <header className="border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Minecraft GUI Studio</h1>
        <p className="mt-1 text-xs text-zinc-500">
          AI가 텍스처를 뽑고, GUI는 <span className="text-emerald-400">항상 256×256</span> 규격으로
          강제 빌드합니다.
        </p>
      </header>

      <div className="grid gap-6 p-6 lg:grid-cols-[380px_1fr]">
        {/* 좌: 컨트롤 */}
        <section className="space-y-4">
          <div className="flex gap-2">
            {(["gui", "font", "item"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  if (k === "font") {
                    setArtStyle("pixel_ui");
                    const d = styleDefaults("pixel_ui");
                    setPixelBlock(d.pixelBlock);
                    setColors(d.colors);
                    setPunch(Math.round(d.punch * 100));
                  }
                }}
                className={`flex-1 rounded-md px-2 py-2 text-xs ring-1 transition ${
                  kind === k
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                    : "bg-white/5 text-zinc-400 ring-white/10 hover:bg-white/10"
                }`}
              >
                {k === "gui" ? "바닐라 GUI" : k === "font" ? "폰트 GUI" : "아이템"}
              </button>
            ))}
          </div>

          <Field label="프롬프트">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-emerald-500/50"
            />
          </Field>

          {kind === "gui" ? (
            <Field label="GUI 종류">
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
              >
                {GUI_PRESETS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900">
                    {p.label} — {p.guiWidth}×{p.guiHeight}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-500">
                파일: {preset.texturePath} (256×256, 그림은 좌상단 {preset.guiWidth}×
                {preset.guiHeight})
              </p>
            </Field>
          ) : kind === "font" ? (
            <div className="space-y-3 rounded-md bg-white/5 p-3 ring-1 ring-white/10">
              <p className="text-[11px] leading-relaxed text-zinc-500">
                타이틀에 비트맵 글리프를 얹는 방식이라{" "}
                <span className="text-emerald-400">크기 제한이 없습니다.</span> 176×222 천장이
                사라집니다.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="가로">
                  <input
                    type="number"
                    min={16}
                    max={1024}
                    value={fontWidth}
                    onChange={(e) => setFontWidth(Number(e.target.value))}
                    className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                  />
                </Field>
                <Field label="세로">
                  <input
                    type="number"
                    min={16}
                    max={1024}
                    value={fontHeight}
                    onChange={(e) => setFontHeight(Number(e.target.value))}
                    className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                  />
                </Field>
                <Field label="이미지 좌측 x">
                  <input
                    type="number"
                    value={glyphLeft}
                    onChange={(e) => setGlyphLeft(Number(e.target.value))}
                    className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                  />
                </Field>
                <Field label="이미지 상단 y">
                  <input
                    type="number"
                    value={glyphTop}
                    onChange={(e) => setGlyphTop(Number(e.target.value))}
                    className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                  />
                </Field>
                <Field label="네임스페이스">
                  <input
                    value={namespace}
                    onChange={(e) => setNamespace(e.target.value)}
                    className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                  />
                </Field>
                <Field label="이름">
                  <input
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="크기">
                <select
                  value={itemSize}
                  onChange={(e) => setItemSize(Number(e.target.value))}
                  className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
                >
                  {ITEM_SIZES.map((s) => (
                    <option key={s} value={s} className="bg-zinc-900">
                      {s}×{s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="아이템 id">
                <input
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {kind === "gui" && (
              <Field label={`픽셀 덩어리 ${pixelBlock}px`}>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={pixelBlock}
                  onChange={(e) => setPixelBlock(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </Field>
            )}
            <Field label={`팔레트 ${colors}색`}>
              <input
                type="range"
                min={4}
                max={256}
                step={4}
                value={colors}
                onChange={(e) => setColors(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </Field>
            <Field label={`채도·대비 ${punch}%`} className="col-span-2">
              <input
                type="range"
                min={100}
                max={200}
                step={5}
                value={punch}
                onChange={(e) => setPunch(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </Field>
          </div>

          {kind !== "item" && (
            <Field label="아트 스타일">
              <div className="grid grid-cols-3 gap-1.5">
                {ART_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setArtStyle(s.id);
                      const d = styleDefaults(s.id);
                      setPixelBlock(d.pixelBlock);
                      setColors(d.colors);
                      setPunch(Math.round(d.punch * 100));
                      if (kind === "gui") setDrawSlots(d.drawSlots);
                    }}
                    className={`rounded-md px-2 py-1.5 text-xs ring-1 transition ${
                      artStyle === s.id
                        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                        : "bg-white/5 text-zinc-400 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                {ART_STYLES.find((s) => s.id === artStyle)?.hint}
              </p>
            </Field>
          )}

          {kind === "gui" && (
            <div className="rounded-md bg-white/5 p-3 ring-1 ring-white/10">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={drawSlots}
                  onChange={(e) => setDrawSlots(e.target.checked)}
                  className="accent-emerald-500"
                />
                슬롯 우물 굽기 ({preset.slots.length + (preset.playerInventory ? 36 : 0)}칸)
              </label>
              <p className="mt-1 text-[11px] text-zinc-500">
                AI는 슬롯 좌표를 못 맞춥니다. 배경만 AI가 그리고 우물은 바닐라 좌표로 직접
                합성합니다.
              </p>

              {drawSlots && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="슬롯 톤">
                    <select
                      value={slotStyle}
                      onChange={(e) => setSlotStyle(e.target.value)}
                      className="w-full rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none"
                    >
                      <option value="vanilla" className="bg-zinc-900">
                        바닐라
                      </option>
                      <option value="dark" className="bg-zinc-900">
                        다크
                      </option>
                      <option value="light" className="bg-zinc-900">
                        라이트
                      </option>
                    </select>
                  </Field>
                  <Field label={`불투명도 ${slotOpacity}%`}>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={slotOpacity}
                      onChange={(e) => setSlotOpacity(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          <Field label="이미지 모델">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            >
              {providers.map((p) => (
                <option key={p} value={p} className="bg-zinc-900">
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={refine}
              onChange={(e) => setRefine(e.target.checked)}
              disabled={!claudeAvailable}
              className="accent-emerald-500"
            />
            Claude로 프롬프트 다듬기
            {!claudeAvailable && (
              <span className="text-[11px] text-zinc-600">(ANTHROPIC_API_KEY 없음)</span>
            )}
          </label>

          <button
            onClick={generate}
            disabled={busy}
            className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? "생성 중…" : "텍스처 생성"}
          </button>

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
              {error}
            </p>
          )}
          {note && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
              {note}
            </p>
          )}
        </section>

        {/* 우: 미리보기 + 팩 */}
        <section className="space-y-6">
          <div className="flex flex-wrap gap-6">
            {kind === "font" ? (
              <div className="rounded-md bg-[#141418] p-3 ring-1 ring-white/10">
                {current ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current}
                    alt="폰트 GUI 미리보기"
                    style={{ imageRendering: "pixelated", maxWidth: 512 }}
                  />
                ) : (
                  <div
                    className="grid place-items-center text-xs text-zinc-600"
                    style={{ width: 320, height: 256 }}
                  >
                    아직 생성 전
                  </div>
                )}
              </div>
            ) : (
              <GuiPreview src={current} preset={preset} scale={2} showGrid={kind === "gui"} />
            )}
            <div className="text-xs text-zinc-500">
              <p>
                <span className="mr-1 inline-block h-2 w-2 bg-emerald-400" /> 게임이 실제로 잘라 쓰는
                영역
              </p>
              <p className="mt-1">
                <span className="mr-1 inline-block h-2 w-2 bg-sky-400" /> 슬롯 위치 (18×18)
              </p>
              <p className="mt-3 max-w-xs leading-relaxed">
                바깥 투명 영역까지 포함해 파일은 256×256으로 저장됩니다. 이 크기를 줄이면 게임에서
                GUI가 어긋납니다.
              </p>
            </div>
          </div>

          {kind === "font" && fontResult && (
            <div className="space-y-3 rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <h2 className="text-sm font-medium text-zinc-200">플러그인에 붙여넣기</h2>

              <CopyRow label="폰트 키" value={fontResult.fontKey} />
              <CopyRow label="타이틀 문자열" value={fontResult.escaped} />
              <CopyRow label="MiniMessage" value={fontResult.miniMessage} />

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-500 sm:grid-cols-4">
                <span>ascent {fontResult.ascent}</span>
                <span>앞 오프셋 {fontResult.leadOffset}px</span>
                <span>전진 폭 {fontResult.advance}px</span>
                <span>1:1 렌더</span>
              </div>

              <div className="space-y-0.5 text-[11px] text-zinc-600">
                <p>{fontResult.texturePath}</p>
                <p>{fontResult.fontPath}</p>
              </div>
            </div>
          )}

          <div className="rounded-lg ring-1 ring-white/10">
            <div className="flex flex-wrap items-end gap-3 border-b border-white/10 p-4">
              <Field label="팩 이름" className="w-40">
                <input
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
                />
              </Field>
              <Field label="pack_format" className="w-52">
                <select
                  value={packFormat}
                  onChange={(e) => setPackFormat(Number(e.target.value))}
                  className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
                >
                  {PACK_FORMATS.map((f) => (
                    <option key={f.format} value={f.format} className="bg-zinc-900">
                      {f.version} — {f.format}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                onClick={exportPack}
                disabled={busy || !made.length}
                className="ml-auto rounded-md bg-white/10 px-4 py-2 text-sm ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-40"
              >
                리소스팩 .zip 내보내기 ({made.length})
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {made.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setCurrent(m.image)}
                  className="group rounded-md bg-white/5 p-2 text-left ring-1 ring-white/10 hover:ring-emerald-500/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.image}
                    alt={m.label}
                    className="w-full rounded bg-[#141418]"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <p className="mt-2 truncate text-[11px] text-zinc-400">{m.label}</p>
                  <p className="truncate text-[10px] text-zinc-600">{m.path}</p>
                </button>
              ))}
              {!made.length && (
                <p className="col-span-full py-8 text-center text-xs text-zinc-600">
                  아직 만든 텍스처가 없습니다.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-black/40 px-2 py-1.5 text-[11px] text-emerald-300 ring-1 ring-white/10">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="shrink-0 rounded-md bg-white/10 px-3 text-xs ring-1 ring-white/15 hover:bg-white/15"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}
