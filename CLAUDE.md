# CLAUDE.md - Project Instructions

## 프로젝트 개요
- 이름: anatomy-pose-viewer (PostureView)
- 스택: Vite + Three.js + FastAPI + PostgreSQL + Docker

## CHANGELOG 자동 업데이트 규칙

**커밋을 할 때마다 반드시 `CHANGELOG.md`를 함께 업데이트할 것.**

작성 규칙:
1. 날짜 기준(`[YYYY-MM-DD]`)으로 섹션을 구분한다
2. 오늘 날짜 섹션이 이미 있으면 해당 섹션에 항목을 추가한다
3. 오늘 날짜 섹션이 없으면 파일 상단(`---` 구분선 바로 아래)에 새 날짜 섹션을 만든다
4. 변경 유형별로 분류한다:
   - `### Added` — 새 기능
   - `### Changed` — 기존 기능 수정/개선
   - `### Fixed` — 버그 수정
   - `### Removed` — 제거된 기능
5. 각 항목은 `-`로 시작하고 한 줄로 간결하게 작성한다
6. CHANGELOG.md 수정도 같은 커밋에 포함시킨다
