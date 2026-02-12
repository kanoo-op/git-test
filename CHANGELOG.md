# Changelog

이 문서는 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)

---

## [2026-02-12]

### Added
- 운동 모드 3열 레이아웃 - 참고 영상 패널 추가
- 실시간 운동 자세 확인 모드: 웹캠 포즈 감지 + 관절 각도 피드백
- 운동 처방 라이브러리: 부위별/난이도별 운동 카드 탐색
- 리포트 뷰: 자세분석/경과/의뢰 리포트 생성 + PDF 다운로드
- 추천운동 패널 + SOAP 음성입력 + UI 전반 개선

### Changed
- 운동 모드 기능 개선
- 운동 모드 로딩 메시지 개선: 모델 이미 로드 시 상태 메시지 생략

### Fixed
- 보안 및 안정성 크리티컬 이슈 수정
- QA 통합 검수 이슈 수정

---

## [2026-02-11]

### Added
- SOAP 노트 기능: 평가 종료 시 구조화된 임상 기록
- App UX 기능: 토스트 알림, 스크린샷, 모바일 메뉴, 키보드 단축키, PIN 잠금
- Backend API 서버 구축: FastAPI + PostgreSQL + Docker 인프라
- Frontend 인증/API 모듈: 백엔드 연동용 클라이언트 모듈
- 프로젝트 README 추가

### Changed
- Vite + 모듈화 아키텍처 마이그레이션: js/css/ 제거, src/ 도입
- 3D Viewer 비주얼 개선: 다크 임상 테마, 향상된 조명, 3단계 심각도 컬러 시스템
- .gitignore 업데이트: .claude/, *.zip, __pycache__ 등 제외 항목 추가

### Fixed
- CSS 경로 수정: 삭제된 css/styles.css를 src/styles/로 복구

### Removed
- 불필요 파일 삭제: 구버전 GLB 모델, 매핑 JSON, 리깅 스크립트 제거

---

## [2026-02-10]

### Changed
- v2 매핑 시스템 완성: anatomy-viewer-v2 좌표계 일치, vertex 컬러링, UI 개선

---

## [2026-02-06]

### Added
- PostureView 초기 구축: 환자관리 + 평가기록 통합, 평가별 3D 상태 저장, 모델 선택 기능
- Git LFS로 GLB 파일 추적 설정
