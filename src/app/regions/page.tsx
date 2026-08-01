"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GUI_PRESETS, findPreset } from "@/lib/mc/canvas";
import { REGION_PALETTE, unpaintedSlots, type Region } from "@/lib/mc/regions";
import { MATERIALS, SUB_PANEL_STYLES, type MaterialKind } from "@/lib/image/palettes";
import { PACK_FORMATS } from "@/lib/pack/build";
import { SlotPainter } from "@/components/SlotPainter";

type RenderMode = "panel" | "buttons" | "title";

type FramedRegion = Region & {
  render: RenderMode;
  panelStyle: string;
  /** 빈 문자열이면 AI 프롬프트로 채운다 */
  material: MaterialKind | "";
  materialColor: string;
  shelves: boolean;
  seed: number;
};

const PANEL_STYLE_KEYS = Object.keys(SUB_PANEL_STYLES);

let seq = 0;
function newRegion(index: number): FramedRegion {
  const p = REGION_PALETTE[index % REGION_PALETTE.length];
  return {
    id: `r${++seq}`,
    color: p.color,
    label: p.label,
    prompt: "",
    slots: [],
    render: "panel",
    panelStyle: PANEL_STYLE_KEYS[index % PANEL_STYLE_KEYS.length],
    material: "wood_planks",
    materialColor: "#6b4423",
    shelves: false,
    seed: 1 + index,
  };
}

export default function RegionsPage() {
  const [presetId, setPresetId] = useState(GUI_PRESETS[0].id);
  const preset = useMemo(() => findPreset(presetId), [presetId]);

  const [regions, setRegions] = useState<FramedRegion[]>([newRegion(0)]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [drawPlayerInventory, setDrawPlayerInventory] = useState(true);
  const [namespace, setNamespace] = useState("custom");
  const [assetName, setAssetName] = useState("gui");

  const [colors, setColors] = useState(96);
  const [punch, setPunch] = useState(120);
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [font, setFont] = useState<{
    title: string;
    fontKey: string;
    fontPath: string;
    texturePath: string;
    content: string;
  } | null>(null);

  const [packName, setPackName] = useState("my-pack");
  const [packFormat, setPackFormat] = useState(34);

  useEffect(() => {
    if (!activeId && regions.length) setActiveId(regions[0].id);
  }, [activeId, regions]);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        setProvider(d.default ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setRegions((rs) => rs.map((r) => ({ ...r, slots: [] })));
  }, [presetId]);

  const leftover = unpaintedSlots(preset, regions).length;
  const patch = (id: string, p: Partial<FramedRegion>) =>
    setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function generate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/generate-framed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId,
          namespace,
          assetName,
          drawPlayerInventory,
          colors,
          punch: punch / 100,
          provider: provider || undefined,
          regions: regions
            .filter((r) => r.slots.length)
            .map((r) => ({
              ...r,
              material: r.material || undefined,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");

      setResult(data.image);
      setNote(data.note ?? null);
      setFont({
        title: data.title.escaped,
        fontKey: data.title.fontKey,
        fontPath: data.font.path,
        texturePath: data.texture.path,
        content: data.font.content,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportPack() {
    if (!result || !font) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: packName,
          packFormat,
          entries: [{ path: font.texturePath, image: result, isGui: false }],
          textFiles: [{ path: font.fontPath, content: font.content }],
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
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">GUI 조립기</h1>
          <p className="mt-1 text-xs text-zinc-500">
            칸을 칠하고 영역마다 패널·버튼·타이틀을 지정합니다. 구조는 코드가 그리고 재질만
            고릅니다. 결과는 폰트 GUI 자산으로 나갑니다.
          </p>
        </div>
        <Link href="/" className="text-xs text-zinc-400 underline hover:text-zinc-200">
          단일 생성으로
        </Link>
      </header>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_440px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">
              GUI 종류
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                className="mt-1 block rounded-md bg-white/5 px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/10 outline-none"
              >
                {GUI_PRESETS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900">
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-2 text-xs text-zinc-500">안 칠한 칸 {leftover}개</p>
          </div>

          <div className="flex flex-wrap gap-6">
            <SlotPainter
              preset={preset}
              regions={regions}
              activeRegionId={activeId}
              onChange={(rs) => setRegions(rs as FramedRegion[])}
            />
            {result && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result}
                alt="결과"
                width={preset.guiWidth * 2}
                height={preset.guiHeight * 2}
                style={{ imageRendering: "pixelated" }}
                className="self-start rounded-md bg-[#141418] ring-1 ring-white/10"
              />
            )}
          </div>

          {font && (
            <div className="space-y-2 rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <h2 className="text-sm font-medium">플러그인에 붙여넣기</h2>
              <Copy label="폰트 키" value={font.fontKey} />
              <Copy label="타이틀 문자열" value={font.title} />
              <p className="text-[11px] text-zinc-600">
                {font.texturePath} · {font.fontPath}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="space-y-2">
            {regions.map((r) => (
              <div
                key={r.id}
                className={`space-y-2 rounded-lg p-3 ring-1 transition ${
                  activeId === r.id
                    ? "bg-white/10 ring-emerald-500/40"
                    : "bg-white/5 ring-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveId(r.id)}
                    className="h-5 w-5 shrink-0 rounded ring-1 ring-white/20"
                    style={{ backgroundColor: r.color }}
                    title="이 영역 선택"
                  />
                  <input
                    value={r.label}
                    onChange={(e) => patch(r.id, { label: e.target.value })}
                    className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none focus:bg-black/30"
                  />
                  <span className="shrink-0 text-[11px] text-zinc-500">{r.slots.length}칸</span>
                  <button
                    onClick={() => {
                      setRegions((rs) => rs.filter((x) => x.id !== r.id));
                      if (activeId === r.id) setActiveId(null);
                    }}
                    className="shrink-0 text-xs text-zinc-600 hover:text-red-400"
                  >
                    삭제
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["panel", "패널"],
                      ["buttons", "버튼"],
                      ["title", "타이틀"],
                    ] as [RenderMode, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => patch(r.id, { render: id })}
                      className={`rounded-md px-2 py-1.5 text-xs ring-1 transition ${
                        r.render === id
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                          : "bg-white/5 text-zinc-400 ring-white/10 hover:bg-white/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Small label="액자 색">
                    <select
                      value={r.panelStyle}
                      onChange={(e) => patch(r.id, { panelStyle: e.target.value })}
                      className="w-full rounded bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10 outline-none"
                    >
                      {PANEL_STYLE_KEYS.map((k) => (
                        <option key={k} value={k} className="bg-zinc-900">
                          {k}
                        </option>
                      ))}
                    </select>
                  </Small>

                  {r.render === "panel" && (
                    <Small label="재질">
                      <select
                        value={r.material}
                        onChange={(e) => {
                          const m = e.target.value as MaterialKind | "";
                          patch(r.id, {
                            material: m,
                            materialColor:
                              MATERIALS.find((x) => x.id === m)?.defaultColor ??
                              r.materialColor,
                          });
                        }}
                        className="w-full rounded bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10 outline-none"
                      >
                        {MATERIALS.map((m) => (
                          <option key={m.id} value={m.id} className="bg-zinc-900">
                            {m.label}
                          </option>
                        ))}
                        <option value="" className="bg-zinc-900">
                          AI 생성
                        </option>
                      </select>
                    </Small>
                  )}
                </div>

                {r.render === "panel" && r.material && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={r.materialColor}
                      onChange={(e) => patch(r.id, { materialColor: e.target.value })}
                      className="h-7 w-10 rounded bg-transparent"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={r.shelves}
                        onChange={(e) => patch(r.id, { shelves: e.target.checked })}
                        className="accent-emerald-500"
                      />
                      선반 널판
                    </label>
                    <button
                      onClick={() => patch(r.id, { seed: r.seed + 1 })}
                      className="ml-auto rounded bg-white/5 px-2 py-1 text-xs text-zinc-400 ring-1 ring-white/10 hover:bg-white/10"
                    >
                      결 다시 뽑기
                    </button>
                  </div>
                )}

                {r.render === "panel" && !r.material && (
                  <textarea
                    value={r.prompt}
                    onChange={(e) => patch(r.id, { prompt: e.target.value })}
                    onFocus={() => setActiveId(r.id)}
                    rows={2}
                    placeholder="AI가 채울 재질 (예: mossy stone bricks)"
                    className="w-full resize-none rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none focus:ring-emerald-500/50"
                  />
                )}
              </div>
            ))}

            <button
              onClick={() => setRegions((rs) => [...rs, newRegion(rs.length)])}
              className="w-full rounded-md bg-white/5 py-2 text-xs text-zinc-400 ring-1 ring-white/10 hover:bg-white/10"
            >
              + 영역 추가
            </button>
          </div>

          <div className="space-y-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <div className="grid grid-cols-2 gap-2">
              <Small label="네임스페이스">
                <input
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  className="w-full rounded bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10 outline-none"
                />
              </Small>
              <Small label="이름">
                <input
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  className="w-full rounded bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10 outline-none"
                />
              </Small>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={drawPlayerInventory}
                onChange={(e) => setDrawPlayerInventory(e.target.checked)}
                className="accent-emerald-500"
              />
              플레이어 인벤토리 칸 그리기
            </label>

            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer">AI 재질 설정</summary>
              <div className="mt-2 space-y-2">
                <Small label={`팔레트 ${colors}색`}>
                  <input
                    type="range"
                    min={16}
                    max={256}
                    step={4}
                    value={colors}
                    onChange={(e) => setColors(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </Small>
                <Small label={`채도·대비 ${punch}%`}>
                  <input
                    type="range"
                    min={100}
                    max={200}
                    step={5}
                    value={punch}
                    onChange={(e) => setPunch(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </Small>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded bg-black/30 px-2 py-1 text-xs ring-1 ring-white/10 outline-none"
                >
                  {providers.map((p) => (
                    <option key={p} value={p} className="bg-zinc-900">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </details>
          </div>

          <button
            onClick={generate}
            disabled={busy}
            className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? "생성 중…" : "GUI 만들기"}
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

          <div className="flex items-end gap-2">
            <input
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              className="w-32 rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            />
            <select
              value={packFormat}
              onChange={(e) => setPackFormat(Number(e.target.value))}
              className="rounded-md bg-white/5 px-2 py-2 text-sm ring-1 ring-white/10 outline-none"
            >
              {PACK_FORMATS.map((f) => (
                <option key={f.format} value={f.format} className="bg-zinc-900">
                  {f.version}
                </option>
              ))}
            </select>
            <button
              onClick={exportPack}
              disabled={busy || !result}
              className="flex-1 rounded-md bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-40"
            >
              .zip 내보내기
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function Copy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
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
