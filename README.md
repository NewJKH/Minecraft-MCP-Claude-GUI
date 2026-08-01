# Minecraft GUI Studio

AI로 마인크래프트 **GUI 배경**과 **아이템 텍스처**를 만들고, 바로 리소스팩 `.zip`으로 내보내는 웹앱.

## 핵심 규칙: GUI는 항상 256×256

마인크래프트는 GUI 텍스처를 **256×256 파일에서 좌상단 일부만 잘라(UV)** 쓴다.
그래서 이 앱은 GUI를 만들 때:

1. 그림을 프리셋의 `guiWidth × guiHeight`(예: 6줄 상자 = 176×222)로 픽셀 스냅해 그리고,
2. **투명한 256×256 캔버스 좌상단 (0,0)** 에 붙이고,
3. `assertGuiCanvas()` 로 최종 파일이 정확히 256×256인지 검사한 뒤에만 내보낸다.

이 게이트를 통과하지 못한 이미지는 미리보기에도, zip에도 들어가지 않는다.
파일을 176×222로 잘라 저장하면 게임에서 GUI가 어긋난다.

### 슬롯은 AI가 아니라 코드가 그린다

바닐라 `generic_54.png`에는 슬롯 우물(18×18)이 텍스처에 이미 그려져 있다.
AI에게 "9×6 격자를 정확한 좌표에" 요구하면 절대 안 맞으므로, **배경만 AI가 그리고
슬롯 우물은 [`slots.ts`](src/lib/image/slots.ts)가 바닐라 좌표로 합성**한다.

좌표 규약: `canvas.ts`의 `slot.x/y`는 아이템이 놓이는 16×16 영역의 좌상단이고,
텍스처에 그려지는 우물은 `(x-1, y-1)`에서 18×18이다.
6줄 상자는 컨테이너 54 + 플레이어 인벤토리 27 + 핫바 9 = **90칸**.

## 실행

```bash
npm install
```

```bash
npm run dev
```

`.env.example` 을 `.env.local` 로 복사해 키를 넣는다. 키가 없어도 실행된다.
접속: `http://localhost:3000`

## 이미지 모델

| provider | 환경변수 | 비용 | 비고 |
|---|---|---|---|
| `pollinations` | **없음** | 완전 무료 | FLUX. 가입·키 불필요, 기본값. SLA 없음 |
| `cloudflare` | `CF_ACCOUNT_ID`, `CF_API_TOKEN` | 무료 티어 | Workers AI, 하루 10,000 뉴런, FLUX.1-schnell |
| `gemini` | `GEMINI_API_KEY` | 무료 티어 | AI Studio, `gemini-2.5-flash-image` |
| `openai` | `OPENAI_API_KEY` | 유료 | `gpt-image-1`, 투명 배경 지원 |
| `procedural` | 없음 | — | 전부 실패했을 때의 절차적 패널 폴백 |

어느 provider든 실패하면 `procedural`로 폴백하고 UI에 사유를 띄운다.
요청 해상도는 종횡비를 유지한 채 64 단위·긴 변 1024로 스냅해서 보낸다.

> **Claude(Anthropic) API는 이미지를 생성하지 못한다.** 텍스트/코드 전용이다.
> `ANTHROPIC_API_KEY`를 넣으면 Claude는 *프롬프트를 다듬는 역할*만 한다
> (사용자 문장 → 재질·색·모티프가 구체화된 영문 텍스처 프롬프트).

## 구조

```
src/
  lib/mc/canvas.ts        GUI 프리셋, 슬롯 좌표, 256×256 상수
  lib/image/pixelize.ts   픽셀 스냅 · 팔레트 양자화 · 256×256 합성/검증
  lib/image/panel.ts      키 없을 때 쓰는 절차적 패널
  lib/ai/image.ts         gemini / openai / procedural provider 추상화
  lib/ai/prompt.ts        텍스처용 프롬프트 빌더 + Claude 정제
  lib/pack/build.ts       pack.mcmeta · zip 빌드 · pack_format 표
  app/api/generate        생성 + 규격 강제
  app/api/pack            리소스팩 zip
  components/GuiPreview   256×256 위에 GUI 영역·슬롯 격자 오버레이
```

## GUI 프리셋

| id | GUI 크기 | 텍스처 경로 |
|---|---|---|
| `chest_6` | 176×222 | `textures/gui/container/generic_54.png` |
| `chest_3` | 176×168 | 〃 |
| `chest_1` | 176×132 | 〃 |
| `furnace` | 176×166 | `textures/gui/container/furnace.png` |
| `crafting_table` | 176×166 | `textures/gui/container/crafting_table.png` |
| `dispenser` | 176×166 | `textures/gui/container/dispenser.png` |
| `hopper` | 176×133 | `textures/gui/container/hopper.png` |

상자 높이는 바닐라 공식 `114 + rows × 18` 을 따른다. 파일은 어느 프리셋이든 256×256.

## 아직 안 된 것

- 커스텀 폰트 오프셋 방식 GUI (Oraxen/ItemsAdder식 음수 스페이스 + 비트맵 글리프)
- 1.21.4+ 아이템 모델 정의(`items/*.json`) 자동 생성
- 계정 / 저장 (Supabase)
- `pack_format` 표는 수동 관리 — 새 버전 나오면 `src/lib/pack/build.ts` 갱신 필요
