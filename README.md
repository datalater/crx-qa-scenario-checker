# QA Scenario Checker

[English](README.en.md)

QA Scenario Checker는 QA 시나리오 JSON을 편집하고, Given/When/Then 체크리스트 형태로 검수할 수 있는 Chrome 확장 프로그램입니다.

![](images/2026-07-02-02-12-02.png)

- [주요 기능](#주요-기능)
- [설치](#설치)
- [개발](#개발)
- [사용 방법](#사용-방법)
  - [시나리오 작성](#시나리오-작성)
  - [노트 (notes)](#노트-notes)
    - [노트 패널 폭](#노트-패널-폭)
- [개발 동기](#개발-동기)
- [브라우저 호환성](#브라우저-호환성)

## 주요 기능

- JSON Editor와 Table Editor를 나란히 보며 시나리오를 편집
- `given`, `when`, `then`, `pass` 필드를 체크리스트 테이블로 표시
- 구분선(`divider`) 행과 구분선 색상 지원
- 행별 노트(`notes`)로 원문 추적 — 노트 여러 개, 각각 link/text/code 블록을 조합
- 노트의 code 블록은 CodeMirror 편집기로 문법 강조
- Note 컬럼을 전환하는 밀도 모드와 `{pass}/{total}` 진척도 표시
- 파일 트리에서 폴더/파일 생성, 이름 변경, 복사, 삭제, 검색 지원
- 폴더 또는 단일 JSON 파일 가져오기
- localStorage 자동 저장과 파일/폴더 기반 작업 흐름 지원
- JSON 유효성 검사, 포맷팅, 라인 넘버, 오류 위치 표시
- 에디터 검색/바꾸기, 실행 취소/다시 실행, 커서 이동 히스토리
- 전체 필드 또는 선택 필드 기반 JSON 내보내기

## 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
4. 이 저장소 폴더를 선택합니다.
5. 툴바의 QA Scenario Checker 아이콘을 눌러 실행합니다.

CodeMirror 번들(`vendor/codemirror/codemirror.bundle.js`)은 저장소에 포함되어 있어서 별도 번들링 없이 바로 동작합니다.

## 개발

노트의 code 블록 편집기만 번들이 필요합니다. 에디터 설정을 바꿀 때만 다시 번들하면 됩니다.

```sh
npm install
npm run build   # src/codemirror-entry.js -> vendor/codemirror/codemirror.bundle.js
npm test
```

## 사용 방법

### 시나리오 작성

- 오른쪽 Table Editor에 내용을 작성하면 왼쪽 JSON Editor가 자동으로 갱신됩니다
- 왼쪽 JSON Editor에 시나리오 JSON을 작성하면 오른쪽 Table Editor가 자동으로 갱신됩니다

> [!TIP]
>
> [명세]-[구현]-[검증]의 개발 프로세스 3단계에서 활용하는 방법
>
> [명세]를 작성할 때는 Table Editor로 손쉽게 작성하고, 작성한 산출물을 JSON 파일 LLM 컨텍스트에 주입해서 더 정확하게 [구현]하도록 유도하고, Table Editor를 보면서 [검증]할 수 있는 개발 프로세스를 구축할 수 있습니다.

```json
{
  "scenario": "Login flow",
  "steps": [
    {
      "given": ["User is on the login page"],
      "when": ["User enters valid credentials"],
      "then": ["Dashboard is displayed"],
      "pass": false
    },
    {
      "divider": "Error cases"
    },
    {
      "given": ["User is on the login page"],
      "when": ["User enters a wrong password"],
      "then": ["An error message is displayed"],
      "pass": false
    }
  ]
}
```

### 노트 (`notes`)

시나리오가 어떤 원문에서 나왔는지, 무엇을 확인해야 하는지 기록합니다. 생략 가능하며 기존 시나리오 파일은 수정 없이 그대로 동작합니다.

한 step에 **여러 개의 노트**를 둘 수 있습니다. 노트마다 `label` 이 있고, 그 안에 필요한 블록을 원하는 순서로 넣습니다. 출처, 변환 근거, 샘플 코드처럼 성격이 다른 기록을 분리할 수 있습니다.

```json
{
  "given": ["초기 비밀번호가 발급된 상태"],
  "when": ["초기 비밀번호로 로그인한다"],
  "then": ["비밀번호 재설정 화면으로 이동한다"],
  "pass": false,
  "notes": [
    {
      "label": "#1-1 AC-02",
      "blocks": [
        { "type": "link", "value": "https://example.com/prd", "label": "PRD" },
        { "type": "text", "value": "Given: 초기 비밀번호가 발급됨 / Then: 재설정 화면으로 이동한다." }
      ]
    },
    {
      "label": "변환 근거",
      "blocks": [
        { "type": "text", "value": "AC 표 원문 1:1 대응." }
      ]
    },
    {
      "label": "검증 정규식",
      "blocks": [
        { "type": "code", "value": "const RULE = /^.{8,20}$/;", "lang": "javascript" }
      ]
    }
  ]
}
```

| 필드 | 설명 |
| --- | --- |
| `notes[].label` | 표의 칩에 표시되는 이름 |
| `notes[].blocks` | 노트를 구성하는 블록 배열 |

블록 종류는 3가지입니다.

| 블록 | 필드 | 설명 |
| --- | --- | --- |
| `link` | `value`, `label?` | 원문 링크. `http(s)`만 허용합니다 |
| `text` | `value` | 원문이나 자유 메모. 여러 개 넣을 수 있습니다 |
| `code` | `value`, `lang?` | CodeMirror 편집기. 문법 강조를 제공합니다 |

`lang` 에 넣을 수 있는 값은 다음과 같으며, 생략하면 plain text로 표시됩니다.

| `lang` | 비고 |
| --- | --- |
| `javascript` | |
| `typescript` | 타입 문법 인식 |
| `jsx` | JSX 태그 인식 |
| `tsx` | 타입 + JSX |
| `json` | |
| `html` | |
| `css` | |

편집기는 다크 테마로 등록하고(`dark: true`) 하이라이팅 색은 JSON Editor와 같은 팔레트를 씁니다. CodeMirror 기본 `defaultHighlightStyle` 은 밝은 배경용이라 이 배경에서는 읽기 어렵고, 다크로 등록하지 않으면 캐럿이 검은색으로 남아 보이지 않습니다.

줄 번호·접기·괄호 매칭·자동완성·검색(`⌘F`)을 제공합니다. 검색 패널이 열려 있을 때 `Esc` 는 검색만 닫고, 노트 패널은 유지됩니다.

새 code 블록은 **마지막에 고른 언어**로 시작합니다. 같은 언어를 연달아 쓰는 경우가 많아서, 선택한 값을 localStorage에 기억해 둡니다. 기억된 언어가 더 이상 지원되지 않으면 `javascript` 로 되돌립니다.

#### 노트 패널 폭

기본 폭은 code 블록에서 80칸이 보이도록 맞춰져 있습니다. 패널 왼쪽 경계를 드래그해 조절할 수 있고, 조절한 폭은 localStorage에 저장됩니다.

창이 좁아지면 표를 가리지 않도록 폭을 자동으로 줄이지만 저장된 값은 그대로 두므로, 창을 다시 넓히면 원래 폭으로 돌아옵니다.

#### 표에 표시되는 방식

헤더의 `Note` 버튼으로 노트 열을 켜고 끕니다. pass/fail을 점검할 때는 꺼둔 기본 상태로 단순하게 보고, 대조 검수할 때만 켭니다.

노트 하나가 칩 하나입니다. 칩에 표시되는 값은 이 순서로 결정됩니다.

1. 노트의 `label`
2. `label` 이 비어 있으면 `link` 의 `label` 또는 도메인
3. 둘 다 없으면 `Note 1`, `Note 2` ...

클릭 동작은 세 가지입니다.

| 클릭 위치 | 동작 |
| --- | --- |
| 노트 칼럼의 빈 영역 | 노트 패널을 엽니다 |
| 노트 칩 | 패널을 열고 **그 노트를 포커스**합니다 |
| `+` 버튼 | 패널을 열고 **새 노트를 만들어 포커스**합니다 |
| 칩의 ↗ 아이콘 | 새 탭에서 링크를 엽니다. 현재 화면은 그대로 유지됩니다 |

↗ 아이콘은 `link` 블록이 있고 주소가 `http(s)` 일 때만 나타납니다. 같은 이름의 탭을 재사용하므로 여러 번 눌러도 탭이 쌓이지 않습니다. 노트 패널의 `link` 블록에도 같은 아이콘이 있습니다.

표에서 직접 편집하지 않고 패널에서 전체 노트를 보면서 편집합니다. 행 우클릭 → `노트 편집` 으로도 열 수 있습니다.

모든 입력은 **타이핑하는 즉시 저장**됩니다. 패널을 `Esc` 로 닫아도 작성한 내용이 남습니다.

내보낼 때 `notes` 는 기본 제외됩니다. 판단 근거는 사람을 위한 기록이므로 LLM 컨텍스트에는 넣지 않습니다.
## 개발 동기

situations:

- AI의 발전에 따라 개발 프로세스인 [명세]-[구현]-[검증]의 3단계 과정에서 [구현]이 AI로 쉽게 대체되면서 [명세]와 [검증]의 중요성의 더 높아진 상황이었습니다.
- 평소에도 [명세]와 [검증]의 중요성을 고려해서 Google Sheet에 given/when/then 구조로 QA 시나리오로 작성하여 ATDD 방식으로 개발하고 있었으나, Google Sheet는 AI에게 컨텍스트로 전달하기에 데이터 구조가 적절하지 않아서 프롬프트 입력 비용이 큰 상황이었습니다.
- LLM이 이해하기에 훨씬 더 나은 데이터 구조인 JSON을 선택하되, 사람이 요구사항을 작성하고 검증하려면 Sheet UI가 더 적합하다고 판단했습니다.

actions:

- ATDD와 AI 활용을 함께 유지하기 위해 QA 시나리오를 JSON으로 관리하면서도 사람이 Sheet UI로 작성하고 검증할 수 있는 QA Scenario Checker 크롬 익스텐션 제작했습니다.
- QA Scenario Checker 크롬 익스텐션으로 [명세]를 손쉽게 작성하고, 작성한 산출물을 JSON 파일로 AI 컨텍스트로 주입하여 더 정확하게 [구현]하도록 유도하고, 구현된 내용을 [검증]하는 개발 프로세스를 구축했습니다.

## 브라우저 호환성

Chrome 확장 프로그램으로 사용하는 것을 기준으로 합니다. 폴더 직접 열기와 쓰기 권한은 브라우저의 File System Access API 지원 여부에 따라 동작이 달라질 수 있습니다.
