/**
 * 폰트 오프셋 방식 커스텀 GUI.
 *
 * 인벤토리 타이틀 자리에 비트맵 글리프를 얹고, 음수 스페이스로 위치를 밀어
 * 화면 아무 데나 임의 크기 이미지를 그리는 기법. 바닐라 컨테이너 텍스처의
 * 176x222 / 256x256 제약을 받지 않는다.
 *
 * 좌표 계산의 근거:
 * - 컨테이너 타이틀은 GUI 기준 (8, 6)에 그려진다 (titleLabelX/Y).
 * - 바닐라 ascii 폰트는 height 8 / ascent 7 이므로, 텍스트를 y=Ty에 그리면
 *   베이스라인은 Ty + 7 에 온다.
 * - 글리프는 베이스라인에서 ascent 만큼 위로 올라간다.
 *     glyphTop = Ty + 7 - ascent = 13 - ascent
 *   따라서 원하는 위치 glyphTop 에 놓으려면  ascent = 13 - glyphTop.
 * - 가로는 x=8 에서 시작하므로, glyphLeft 로 보내려면 (glyphLeft - 8) 만큼
 *   음수/양수 스페이스를 앞에 붙인다.
 *
 * 사설 영역(PUA) 문자는 소스에 리터럴로 박지 않는다. 에디터·인코딩을 거치며
 * 깨지기 쉬워서, 코드포인트로만 다룬다.
 */

/** 컨테이너 타이틀이 그려지는 GUI 기준 좌표 */
export const TITLE_X = 8;
export const TITLE_Y = 6;
/** 바닐라 ascii 폰트의 ascent */
export const ASCII_ASCENT = 7;

/** glyphTop(=이미지 상단이 놓일 GUI y) → 폰트 json의 ascent */
export function ascentFor(glyphTop: number): number {
  return TITLE_Y + ASCII_ASCENT - glyphTop;
}

/** ascent → glyphTop (역변환, UI 표시용) */
export function glyphTopFor(ascent: number): number {
  return TITLE_Y + ASCII_ASCENT - ascent;
}

/** 스페이스 문자 코드포인트 시작점. 음수 U+F801~, 양수 U+F811~ */
const NEG_BASE = 0xf801;
const POS_BASE = 0xf811;
/** 2의 거듭제곱 9단계: 1, 2, 4, ... 256 */
const EXPONENTS = 9;

const NEG_CHARS = Array.from({ length: EXPONENTS }, (_, i) =>
  String.fromCharCode(NEG_BASE + i)
);
const POS_CHARS = Array.from({ length: EXPONENTS }, (_, i) =>
  String.fromCharCode(POS_BASE + i)
);

/** 기본 글리프 문자 U+E000. 여러 개 만들 때는 뒤로 하나씩 밀어 쓴다. */
export function glyphCharAt(index = 0): string {
  return String.fromCharCode(0xe000 + index);
}

/** 스페이스 문자 → 전진 픽셀 수. 폰트 json의 space provider에 그대로 들어간다. */
export const SPACE_ADVANCES: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  NEG_CHARS.forEach((ch, i) => (out[ch] = -(2 ** i)));
  POS_CHARS.forEach((ch, i) => (out[ch] = 2 ** i));
  return out;
})();

/** 임의의 정수 오프셋을 스페이스 문자열로 분해한다. 큰 단위부터 써 문자 수를 줄인다. */
export function offsetToChars(offset: number): string {
  let rest = Math.abs(Math.round(offset));
  if (rest === 0) return "";

  const table = offset < 0 ? NEG_CHARS : POS_CHARS;
  let out = "";
  for (let i = EXPONENTS - 1; i >= 0; i--) {
    const step = 2 ** i;
    while (rest >= step) {
      out += table[i];
      rest -= step;
    }
  }
  return out;
}

/** 비트맵 글리프의 전진 폭. 1:1 렌더(renderHeight = 이미지 높이)면 width + 1. */
export function glyphAdvance(
  imageWidth: number,
  imageHeight: number,
  renderHeight: number
): number {
  return Math.round((imageWidth * renderHeight) / imageHeight) + 1;
}

export type FontGuiSpec = {
  /** 리소스팩 네임스페이스 */
  namespace: string;
  /** 폰트 이름. 최종 폰트 키는 `<namespace>:<fontName>` */
  fontName: string;
  /** 글리프에 쓸 문자 */
  glyphChar: string;
  /** assets/<ns>/textures/ 이하 경로 (예: "gui/market.png") */
  texturePath: string;
  imageWidth: number;
  imageHeight: number;
  /** 렌더 높이. 이미지 높이와 같으면 1:1 */
  renderHeight: number;
  /** 이미지 상단이 놓일 GUI y (음수면 GUI 위로 올라간다) */
  glyphTop: number;
  /** 이미지 좌측이 놓일 GUI x */
  glyphLeft: number;
};

/** 폰트 json. bitmap과 space를 한 파일에 담아 폰트 하나만 지정하면 되게 한다. */
export function buildFontJson(spec: FontGuiSpec) {
  return {
    providers: [
      { type: "space", advances: SPACE_ADVANCES },
      {
        type: "bitmap",
        file: `${spec.namespace}:${spec.texturePath}`,
        ascent: ascentFor(spec.glyphTop),
        height: spec.renderHeight,
        chars: [spec.glyphChar],
      },
    ],
  };
}

export type TitleStrings = {
  /** 실제 문자가 들어간 원본 문자열 */
  raw: string;
  /** \uXXXX 로 escape 한 형태 (yml/json에 붙여넣기 좋음) */
  escaped: string;
  /** MiniMessage (Adventure 쓰는 플러그인용) */
  miniMessage: string;
  fontKey: string;
  /** 앞쪽 오프셋 픽셀 수 */
  leadOffset: number;
  /** 글리프가 소모하는 전진 폭 */
  advance: number;
};

/**
 * 타이틀에 넣을 문자열을 만든다.
 * 글리프를 그린 뒤 전진한 만큼 되돌려 놓아, 뒤에 일반 텍스트를 이어 붙여도
 * 위치가 밀리지 않는다.
 */
export function buildTitleStrings(spec: FontGuiSpec): TitleStrings {
  const lead = spec.glyphLeft - TITLE_X;
  const advance = glyphAdvance(spec.imageWidth, spec.imageHeight, spec.renderHeight);
  const raw = offsetToChars(lead) + spec.glyphChar + offsetToChars(-advance);
  const fontKey = `${spec.namespace}:${spec.fontName}`;

  return {
    raw,
    escaped: escapeUnicode(raw),
    miniMessage: `<font:${fontKey}>${escapeUnicode(raw)}</font>`,
    fontKey,
    leadOffset: lead,
    advance,
  };
}

/** ASCII 밖의 문자를 \uXXXX 로 바꾼다. 설정 파일에 붙여넣을 때 안전하다. */
export function escapeUnicode(s: string): string {
  return s.replace(
    /[^\x20-\x7E]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")
  );
}

/**
 * 폰트 json의 사설 영역 문자를 \uXXXX 로 escape 한다.
 * 개행·들여쓰기까지 escape 하면 JSON 자체가 깨지므로 U+007F 위쪽만 건드린다.
 */
export function stringifyFontJson(json: unknown): string {
  return JSON.stringify(json, null, 2).replace(/./gu, (c) =>
    c.charCodeAt(0) > 0x7e ? escapeChar(c) : c
  );
}

/** 한 글자를 리터럴 "\uXXXX" 여섯 자로 바꾼다. */
function escapeChar(c: string): string {
  return "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
}
