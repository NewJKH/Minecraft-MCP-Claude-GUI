"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GUI_PRESETS, findPreset } from "@/lib/mc/canvas";
import { REGION_PALETTE, unpaintedSlots, type Region } from "@/lib/mc/regions";
import { ART_STYLES, type ArtStyle } from "@/lib/ai/styles";
import { PACK_FORMATS, vanillaTexturePath } from "@/lib/pack/build";
import { SlotPainter } from "@/components/SlotPainter";

let seq = 0;
function newRegion(index: number): Region {
  const p = REGION_PALETTE[index % REGION_PALETTE.length];
  return {
    id: `r${++seq}`,
    color: p.color,
    label: p.label,
    prompt: "",
    slots: [],
  };
}

export default function RegionsPage() {
  const [presetId, setPresetId] = useState(GUI_PRESETS[0].id);
  const preset = useMemo(() => findPreset(presetId), [presetId]);

  const [regions, setRegions] = useState<Region[]>([newRegion(0), newRegion(1)]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [backgroundPrompt, setBackgroundPrompt] = useState("dark stone dungeon wall");

  const [artStyle, setArtStyle] = useState<ArtStyle>("pixel_ui");
  const [colors, setColors] = useState(96);
  const [punch, setPunch] = useState(130);
  const [drawSlots, setDrawSlots] = useState(true);
  const [slotOpacity, setSlotOpacity] = useState(45);

  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [layers, setLayers] = useState<{ label: string; slots: number }[]>([]);

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

  // 프리셋을 바꾸면 슬롯 개수가 달라지므로 칠한 내용을 비운다
  useEffect(() => {
    setRegions((rs) => rs.map((r) => ({ ...r, slots: [] })));
  }, [presetId]);

  const leftover = unpaintedSlots(preset, regions).length;

  async function generate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/generate-regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId,
          background: backgroundPrompt.trim()
            ? { prompt: backgroundPrompt, artStyle }
            : undefined,
          regions: regions.filter((r) => r.slots.length && r.prompt.trim()),
          artStyle,
          colors,
          punch: punch / 100,
          provider: provider || undefined,
          drawSlots,
          slotOpacity: slotOpacity / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");

      setResult(data.image);
      setLayers(data.layers ?? []);
      setNote(data.note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportPack() {
    if (!result) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: packName,
          packFormat,
          entries: [
            {
              path: vanillaTexturePath(preset.texturePath),
              image: result,
              isGui: true,
            },
          ],
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
          <h1 className="text-lg font-semibold tracking-tight">영역 에디터</h1>
          <p className="mt-1 text-xs text-zinc-500">
            칸을 색으로 칠하고, 색깔마다 다른 프롬프트로 그림을 뽑아 그 칸에만 넣습니다.
          </p>
        </div>
        <Link href="/" className="text-xs text-zinc-400 underline hover:text-zinc-200">
          단일 생성으로
        </Link>
      </header>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_420px]">
        {/* 좌: 페인터 */}
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
            <p className="pb-2 text-xs text-zinc-500">
              칠하지 않은 칸 {leftover}개 → 배경 레이어가 채웁니다
            </p>
          </div>

          <SlotPainter
            preset={preset}
            regions={regions}
            activeRegionId={activeId}
            onChange={setRegions}
            backdrop={result}
          />

          {result && (
            <div className="flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result}
                alt="합성 결과"
                width={256 * 2}
                height={256 * 2}
                style={{ imageRendering: "pixelated" }}
                className="rounded-md bg-[#141418] ring-1 ring-white/10"
              />
              <ul className="space-y-1 text-xs text-zinc-500">
                {layers.map((l, i) => (
                  <li key={i}>
                    {l.label} {l.slots ? `· ${l.slots}칸` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 우: 영역 목록 + 설정 */}
        <section className="space-y-4">
          <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
              배경 (칠하지 않은 전부)
            </label>
            <textarea
              value={backgroundPrompt}
              onChange={(e) => setBackgroundPrompt(e.target.value)}
              rows={2}
              placeholder="비우면 투명하게 둡니다"
              className="w-full resize-none rounded-md bg-black/30 px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-emerald-500/50"
            />
          </div>

          <div className="space-y-2">
            {regions.map((r) => (
              <div
                key={r.id}
                className={`rounded-lg p-3 ring-1 transition ${
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
                    onChange={(e) =>
                      setRegions((rs) =>
                        rs.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x))
                      )
                    }
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
                <textarea
                  value={r.prompt}
                  onChange={(e) =>
                    setRegions((rs) =>
                      rs.map((x) => (x.id === r.id ? { ...x, prompt: e.target.value } : x))
                    )
                  }
                  onFocus={() => setActiveId(r.id)}
                  rows={2}
                  placeholder="이 칸들에 들어갈 그림"
                  className="mt-2 w-full resize-none rounded-md bg-black/30 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none focus:ring-emerald-500/50"
                />
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
            <div className="grid grid-cols-3 gap-1.5">
              {ART_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setArtStyle(s.id)}
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

            <Slider label={`팔레트 ${colors}색`} min={16} max={256} step={4} value={colors} onChange={setColors} />
            <Slider label={`채도·대비 ${punch}%`} min={100} max={200} step={5} value={punch} onChange={setPunch} />

            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={drawSlots}
                onChange={(e) => setDrawSlots(e.target.checked)}
                className="accent-emerald-500"
              />
              슬롯 우물 굽기
            </label>
            {drawSlots && (
              <Slider
                label={`슬롯 불투명도 ${slotOpacity}%`}
                min={10}
                max={100}
                step={5}
                value={slotOpacity}
                onChange={setSlotOpacity}
              />
            )}

            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md bg-black/30 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            >
              {providers.map((p) => (
                <option key={p} value={p} className="bg-zinc-900">
                  {p}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={generate}
            disabled={busy}
            className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? "생성 중… (영역마다 한 번씩 호출합니다)" : "영역별로 생성"}
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

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}
