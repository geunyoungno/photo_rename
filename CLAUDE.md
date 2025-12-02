# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Photo Rename CLI (v2) - 사진 및 동영상 파일의 EXIF 메타데이터 또는 파일명 패턴을 기반으로 파일 이름을 변경하는 TypeScript 기반 CLI 도구입니다. 전략 패턴을 사용하여 서로 다른 사진 출처(일반, Foodie 앱, 카카오톡, iPad)를 처리합니다.

## 주요 명령어

### 개발 및 실행
```bash
# CLI 실행
npm run cli -- <명령어> [옵션]

# 사용 예시:
npm run cli -- foodie --path ~/Desktop/Foodie --dry-run
npm run cli -- kakao --path ~/Desktop/Kakao
npm run cli -- ipad --timezone Asia/Seoul --dry-run
npm run cli -- general --category ipad --timezone Asia/Seoul
```

### 테스트
```bash
# 전체 테스트 실행
npm test

# 특정 테스트 파일만 실행
npm test -- foodie.strategy.test

# 워치 모드로 테스트 실행
npm test -- --watch
```

## 아키텍처

### 전략 패턴 구현

코드베이스는 **전략 패턴**을 사용하여 각 사진 출처마다 고유한 이름 변경 전략을 구현합니다:

1. **General 전략** (`src/strategies/general.strategy.ts`)
   - `exifr` 라이브러리를 사용하여 EXIF 파싱
   - 여러 카테고리 지원: `ipad`, `foodie`, `kakao`
   - `photoCategoryPaths` 레코드를 통해 카테고리를 폴더명으로 매핑
   - EXIF의 `CreateDate`를 `DateTimeOriginal`보다 우선 사용
   - EXIF 데이터가 없으면 원본 파일명으로 폴백
   - 커스텀 시간대 변환 지원

2. **Foodie 전략** (`src/strategies/foodie.strategy.ts`)
   - Foodie 앱 형식 처리: `YYYY-MM-DD-HH-mm-ss-ms.ext`
   - 순수 문자열 변환 (EXIF 파싱 없음)
   - 변환 결과: `YYYYMMDD_HHmmss_ms.ext`
   - EXIF 라이브러리를 사용하지 않음

3. **Kakao 전략** (`src/strategies/kakao.strategy.ts`)
   - `exifreader` 라이브러리 사용 (general 전략과 다름)
   - EXIF에서 `DateTimeOriginal` 추출
   - EXIF가 없으면 파일 수정 시간(`stats.mtime`)으로 폴백
   - 출력 형식: `YYYYMMDD_HHmmss.ext`

4. **iPad 전략** (`src/strategies/ipad.strategy.ts`)
   - `exifr` 라이브러리 사용 (general 전략과 동일)
   - **라이브 포토 페어링**: `IMG_XXXX.HEIC` + `IMG_XXXX.MOV` 자동 감지
   - `groupLivePhotos()` 함수로 같은 번호의 사진과 비디오 매칭
   - 사진 파일의 EXIF 기준으로 타임스탬프 결정
   - 페어의 두 파일을 동일한 기본 이름으로 변경 (확장자만 다름)
   - MOV 파일만 있고 사진이 없으면 무시
   - 출력 형식: `YYYYMMDD_HHmmss.ext`

### 중요한 구현 세부사항

**파일명 충돌 처리**: 모든 전략은 `filenameMap` (Map<string, number>)을 유지하여 중복된 이름을 추적하고, 파일 덮어쓰기를 방지하기 위해 숫자 접미사(`_1`, `_2` 등)를 자동으로 추가합니다.

**EXIF 라이브러리 차이점**:
- General 전략: `exifr` 사용 (비동기, Date 객체로 파싱된 날짜 반환)
- iPad 전략: `exifr` 사용 (General과 동일)
- Kakao 전략: `exifreader` 사용 (동기 로드, 문자열 설명 반환)
- EXIF 기능 추가 시, 각 전략에서 사용하는 라이브러리를 존중해야 함

**라이브 포토 페어링 로직** (iPad 전략):
- `IMG_XXXX` 패턴의 파일명을 기준으로 그룹화
- 사진 파일 확장자: `.heic`, `.jpg`, `.jpeg`, `.png`
- 비디오 파일 확장자: `.mov`
- 사진 파일이 없으면 해당 그룹은 처리하지 않음 (MOV만 있는 경우 무시)
- 페어의 두 파일은 사진의 EXIF 정보를 기준으로 같은 타임스탬프 사용
- 충돌 시 접미사는 두 파일 모두에 동일하게 적용 (예: `20240101_120000_1.HEIC`, `20240101_120000_1.MOV`)

**CLI 구조**: `src/cli.ts`는 Commander.js를 사용하여 서브커맨드를 구현합니다. 각 전략은 `rename()` 함수를 export하며, CLI는 파싱된 옵션과 함께 이 함수를 호출합니다.

**날짜 포맷팅**: 모든 전략은 Luxon의 DateTime을 사용하여 날짜 포맷팅과 시간대 처리를 수행합니다. 전략 간 일관된 출력 형식은 별도 지정이 없는 한 `YYYYMMDD_HHmmss`입니다.

## 테스트 접근 방식

- 테스트는 `src/strategies/__tests__/` 에 위치
- export된 유틸리티 함수(예: `getChangedFilename`) 테스트에 집중
- `rename()` 함수의 전체 통합 테스트는 `fs-extra` 모킹 필요
- 현재 foodie와 ipad 전략에 테스트가 구현되어 있음
- iPad 전략 테스트는 라이브 포토 페어링 로직(그룹화, 매칭)을 검증

## 문서화

README.md는 한국어로 작성되어 있으며 사용자 대상 문서 역할을 합니다. 기능 업데이트 시 한국어 README도 코드 변경사항과 동기화해야 합니다.
