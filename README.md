# QA Scenario Checker

[English](README.en.md)

QA Scenario Checker는 QA 시나리오 JSON을 편집하고, Given/When/Then 체크리스트 형태로 검수할 수 있는 Chrome 확장 프로그램입니다.

![](images/2026-07-02-02-12-02.png)

- [주요 기능](#주요-기능)
- [설치](#설치)
- [사용 방법](#사용-방법)
  - [시나리오 작성](#시나리오-작성)
- [개발 동기](#개발-동기)
- [브라우저 호환성](#브라우저-호환성)

## 주요 기능

- JSON Editor와 Table Editor를 나란히 보며 시나리오를 편집
- `given`, `when`, `then`, `pass` 필드를 체크리스트 테이블로 표시
- 구분선(`divider`) 행과 구분선 색상 지원
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
