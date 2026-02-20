# Changelog

이 문서는 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)

---

## [2026-02-20]

### Added
- SelectionService 통합 리팩터링: 선택/호버/우클릭 로직을 단일 모듈로 통합
- 겹침 메쉬 Hit List UI: 겹친 부위 클릭 시 후보 목록 표시 + Tab/Shift+Tab 순환 선택
- 레이어 필터: 골격 모드에서 뼈만 선택 가능, 근육/X-ray 모드는 전체 선택 가능
- SOAP 기록 독립 작성 기능: 3D 평가 세션 없이 환자 상세에서 바로 SOAP 기록 작성/수정/삭제
- 환자 상세 탭 시스템: '내원 기록' | 'SOAP 기록' 탭 전환
- 사이드바 SOAP 보드: 전체 환자 SOAP 기록 통합 조회 (검색/환자필터/날짜필터)
- 운동 처방 태그/카테고리 체계: 목적(가동성/안정화/근력/신경가동/호흡코어), 단계(급성/아급성/만성), 도구(밴드/폼롤러/짐볼 등), 패턴(스트레칭/힌지/스쿼트 등) 4개 차원 45개 운동 태그 매핑
- 운동별 금기/주의사항(precautions) 텍스트 추가
- 운동 라이브러리 태그 chip 필터 UI (목적/단계/도구/패턴 × 부위/난이도/검색 AND 조합)
- 운동 카드에 purpose+pattern 태그 배지 및 주의사항 경고 표시
- 추천 운동 패널: severity→phase 매핑 정렬 (중증→급성기 운동 우선)
- 세션 완료 시 exercisePlan에 태그 메타데이터 포함

### Fixed
- SOAP 타임라인 표시: 자동채우기 필드(painLocation, clinicalImpression, hep, frequency) 폴백 체인 추가
- SOAP 검색: 환자명뿐 아니라 SOAP 노트 전체 필드 검색 가능
- 세션 완료 후 환자 상세 화면으로 자동 전환

---

## [2026-02-13]

### Added
- 주변 재활병원 검색 기능: 네이버 지도 + Local Search API 기반 (대구과학대 기본 위치)
- 네이버 API 설정 UI: 개발자 설정에서 Client ID/Secret 입력 및 관리
- 백엔드 네이버 검색 프록시 API (`/api/naver/local-search`)
- SOAP 노트 자동채우기: S/A/P 섹션 자동 생성 (통증 위치, VAS, 경과, 임상 소견, 운동 처방)
- SQLite 지원: 백엔드 로컬 개발 환경 PostgreSQL → SQLite 호환

### Changed
- 검색 UI 단순화: 검색창 하나로 통합, Enter키 검색 지원
- 위치 없이도 키워드만으로 검색 가능
- 사이드바 "주변 재활병원" 메뉴를 하단 다크모드 위로 이동

### Fixed
- SOAP 자동채우기 HEP 운동 좌/우 부위 중복 제거
- SOAP 경과 수준 판단 시 이전/현재 모두 이상 없는 경우 edge case 처리
- SOAP 임상 소견 심각도 순 정렬 및 마침표 추가
- 네이버 Maps SDK 인증 파라미터 수정 (ncpClientId → ncpKeyId)
- passlib + bcrypt 5.0 호환성 이슈 해결

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
