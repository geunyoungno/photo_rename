import fs from 'fs-extra';
import path from 'path';
import { DateTime } from 'luxon';

/** QuickTime/MP4 시간 기준점: 1904-01-01 UTC */
const QUICKTIME_EPOCH_OFFSET_SECONDS = 2082844800;

/** moov 박스를 통째로 읽을 때의 상한. 긴 영상이면 청크 인덱스 때문에 커질 수 있다. */
const MAX_MOOV_BYTES = 32 * 1024 * 1024;

/** 자식 박스를 품는 컨테이너. 이 안쪽까지만 재귀로 들어간다. */
const CONTAINER_BOX_TYPES = new Set(['moov', 'udta', 'trak', 'mdia', 'meta', 'ilst']);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.3gp', '.lrv']);

/** mvhd 의 creation_time 을 무엇으로 적었는가. */
type VideoClockKind = 'utc' | 'local';

interface MakerClock {
  maker: string;
  clock: VideoClockKind;
}

/**
 * mvhd 는 규격상 UTC 지만 현지 시각을 그대로 적는 기기가 많다. 파일 안에 어느 쪽인지 알려주는
 * 표시가 없어서, udta 에 남는 제조사 표식으로 구분한다.
 *
 * ponytail: 표를 늘리는 방식이라 새 기기는 확인 전까지 맞지 않는다. 대신 모르는 기기는 경고를
 * 찍으므로 조용히 틀리지는 않는다. 자동 판별할 방법이 생기면 그때 바꾼다.
 */
const MAKER_CLOCKS: Array<MakerClock & { marker: string }> = [
  // 실측: mvhd 가 2026-09-17T01:51:07, 같은 기기 파일명이 DJI_20260917105107 (KST 10:51:07)
  { marker: '\u00a9dji', maker: 'DJI', clock: 'utc' },
  // 실측: mvhd 가 09:50:32, udta/TAGS 에 현지 'Thu Sep 17 09:50:32 2026' 와 UTC '00:50:32' 가 함께 있다
  { marker: 'OMDS', maker: 'OM System', clock: 'local' },
];

interface BoxLocation {
  type: string;
  contentStart: number;
  contentEnd: number;
}

export function isVideoExtension(extension: string) {
  return VIDEO_EXTENSIONS.has(extension.toLowerCase());
}

/** 버퍼 안의 형제 박스들을 순서대로 훑는다. */
function* iterateBoxes(buffer: Buffer, start: number, end: number): Generator<BoxLocation> {
  let offset = start;

  while (offset + 8 <= end) {
    let boxSize = buffer.readUInt32BE(offset);
    const boxType = buffer.toString('latin1', offset + 4, offset + 8);
    let headerSize = 8;

    if (boxSize === 1) {
      if (offset + 16 > end) return;
      boxSize = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = end - offset;
    }

    if (boxSize < headerSize || offset + boxSize > end) return;

    yield { type: boxType, contentStart: offset + headerSize, contentEnd: offset + boxSize };
    offset += boxSize;
  }
}

function detectMakerClock(moovBuffer: Buffer): MakerClock | undefined {
  return MAKER_CLOCKS.find((entry) => moovBuffer.includes(Buffer.from(entry.marker, 'latin1')));
}

function findBox(buffer: Buffer, targetType: string, start = 0, end = buffer.length): BoxLocation | undefined {
  for (const box of iterateBoxes(buffer, start, end)) {
    if (box.type === targetType) {
      return box;
    }
    if (CONTAINER_BOX_TYPES.has(box.type)) {
      const found = findBox(buffer, targetType, box.contentStart, box.contentEnd);
      if (found) return found;
    }
  }
  return undefined;
}

/** moov/udta/©day — 촬영 시각을 문자열로 담는다. 기기에 따라 UTC 오프셋이 붙는다. */
function readCreationDateText(moovBuffer: Buffer): string | undefined {
  const dayBox = findBox(moovBuffer, '©day');
  if (!dayBox || dayBox.contentEnd - dayBox.contentStart <= 4) {
    return undefined;
  }

  // 앞 4바이트는 길이(2) + 언어코드(2)
  const text = moovBuffer.toString('utf8', dayBox.contentStart + 4, dayBox.contentEnd).trim();
  return text || undefined;
}

/** moov/mvhd — creation_time(1904 기준 초). 값이 없으면 0 이 들어 있다. */
function readMovieHeaderSeconds(moovBuffer: Buffer): number | undefined {
  const mvhdBox = findBox(moovBuffer, 'mvhd');
  if (!mvhdBox) {
    return undefined;
  }

  const version = moovBuffer.readUInt8(mvhdBox.contentStart);
  const creationTimeOffset = mvhdBox.contentStart + 4;

  let creationTime: number;
  if (version === 1) {
    if (creationTimeOffset + 8 > mvhdBox.contentEnd) return undefined;
    creationTime = Number(moovBuffer.readBigUInt64BE(creationTimeOffset));
  } else {
    if (creationTimeOffset + 4 > mvhdBox.contentEnd) return undefined;
    creationTime = moovBuffer.readUInt32BE(creationTimeOffset);
  }

  return creationTime > 0 ? creationTime - QUICKTIME_EPOCH_OFFSET_SECONDS : undefined;
}

async function readMoovBuffer(filePath: string): Promise<Buffer | undefined> {
  const fileHandle = await fs.open(filePath, 'r');

  try {
    const { size: fileSize } = await fs.fstat(fileHandle);
    const headerBuffer = Buffer.alloc(16);
    let offset = 0;

    while (offset + 8 <= fileSize) {
      const { bytesRead } = await fs.read(fileHandle, headerBuffer, 0, 16, offset);
      if (bytesRead < 8) return undefined;

      let boxSize = headerBuffer.readUInt32BE(0);
      const boxType = headerBuffer.toString('latin1', 4, 8);
      let headerSize = 8;

      if (boxSize === 1) {
        if (bytesRead < 16) return undefined;
        boxSize = Number(headerBuffer.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = fileSize - offset;
      }

      if (boxSize < headerSize) return undefined;

      if (boxType === 'moov') {
        const contentLength = Math.min(boxSize - headerSize, MAX_MOOV_BYTES);
        const moovBuffer = Buffer.alloc(contentLength);
        await fs.read(fileHandle, moovBuffer, 0, contentLength, offset + headerSize);
        return moovBuffer;
      }

      offset += boxSize;
    }

    return undefined;
  } finally {
    await fs.close(fileHandle);
  }
}

/**
 * moov 버퍼에서 촬영 시각을 뽑아 `yyyyLLdd_HHmmss` 로 만든다.
 *
 * `©day` 는 적힌 벽시계를 그대로 쓰고, `mvhd` 는 제조사에 따라 UTC 인지 현지 시각인지 갈린다.
 */
export function parseMoovDateTime(moovBuffer: Buffer, fileName?: string): string | undefined {
  const creationDateText = readCreationDateText(moovBuffer);
  if (creationDateText) {
    // ponytail: 뒤에 붙은 오프셋(+09:00, Z)은 의도적으로 무시한다. 현지 시각을 적어 놓고
    // Z 를 붙이는 기기가 흔해서, 오프셋을 믿고 변환하면 그만큼 시각이 밀린다.
    // setZone: true 로 오프셋을 그 값의 시간대로만 받아들이고, 변환 없이 벽시계를 읽는다.
    const parsed = DateTime.fromISO(creationDateText, { setZone: true });
    if (parsed.isValid) {
      return parsed.toFormat('yyyyLLdd_HHmmss');
    }
  }

  const creationSeconds = readMovieHeaderSeconds(moovBuffer);
  if (creationSeconds === undefined) {
    return undefined;
  }

  const makerClock = detectMakerClock(moovBuffer);
  if (!makerClock) {
    console.warn(
      `Unknown camera in ${fileName ?? 'video'}, assuming mvhd is UTC. Check the result if the time looks off.`
    );
  }

  if (makerClock?.clock === 'local') {
    // 적힌 숫자가 곧 현지 시각이므로 변환하지 않는다.
    return DateTime.fromSeconds(creationSeconds, { zone: 'utc' }).toFormat('yyyyLLdd_HHmmss');
  }

  // UTC 로 적는 기기. 파일 수정 시각과 같은 진짜 절대 시각이라 머신 시간대로 읽는다.
  return DateTime.fromSeconds(creationSeconds).toFormat('yyyyLLdd_HHmmss');
}

/** MP4/MOV 파일에서 촬영 시각을 읽는다. 못 읽으면 undefined. */
export async function getDateTimeFromVideo(filePath: string): Promise<string | undefined> {
  try {
    const moovBuffer = await readMoovBuffer(filePath);
    return moovBuffer ? parseMoovDateTime(moovBuffer, path.basename(filePath)) : undefined;
  } catch (error) {
    return undefined;
  }
}
