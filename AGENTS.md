# AGENTS.md

이 문서는 이 저장소에서 작업하는 코드 에이전트를 위한 공통 가이드입니다. 기존 `CLAUDE.md` 내용을 바탕으로 범용적으로 정리했습니다.

## 프로젝트 요약

Photo Rename CLI (v2) - 사진/동영상 파일의 EXIF 또는 파일명 패턴을 기반으로 이름을 변경하는 TypeScript CLI 도구입니다. 단일 명령어로 일관된 규칙을 적용합니다.

## 주요 명령어

```bash
# CLI 실행
npm run cli -- <명령어> [옵션]

# 사용 예시
npm run cli -- rename --path ~/Desktop/100APPLE --timezone Asia/Seoul --dry-run
npm run cli -- rename --path /mnt/c/Users/<윈도우사용자>/Desktop/100APPLE --timezone Asia/Seoul --dry-run
```

```bash
# 테스트
npm test
npm test -- --watch
```

## 아키텍처 요약

- 진입점: `src/cli.ts`
- 핵심 로직: `src/rename.ts`의 `rename()`
- 표준 포맷이면 스킵: `YYYYMMDD_HHMMSS` (옵션: 밀리초/중복번호)
- EXIF 우선순위: `exifr` → `exifreader` → 파일 수정 시간
- 라이브 포토 페어링: `IMG_XXXX` 사진/비디오 동일 타임스탬프
- 충돌 처리: `_1`, `_2` 접미사 (기존 표준 포맷 파일로 시드)
- 시간대: Luxon, `--timezone` 옵션 지원

## 에이전트 가이드

- 작고 안전한 변경을 우선합니다.
- 요청하지 않은 리팩토링은 피합니다.
- 필요한 파일만 열어 컨텍스트를 최소화합니다.
- 요구사항이 모호하면 짧고 명확한 질문을 합니다.
- 변경 내용과 위치를 명확히 보고합니다.

## 체크리스트 (작업 전)

- 관련 파일을 먼저 읽었다.
- 요구사항이 불명확하면 질문했다.
- 최소 변경으로 해결 가능한지 검토했다.

## 체크리스트 (작업 후)

- 변경 요약과 파일 경로를 공유했다.
- 동작/사용법 변경 시 `README.md`를 갱신했다.
- 테스트를 실행했거나 미실행 사유를 밝혔다.
- 파괴적 명령은 명시적 승인 후에만 실행했다.
