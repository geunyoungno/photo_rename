import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { parseMoovDateTime } from './mp4-date';

const QUICKTIME_EPOCH_OFFSET_SECONDS = 2082844800;

function buildBox(type: string, content: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(content.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, content]);
}

/** version 0 mvhd. 인자는 UTC 기준 시각이다. */
function buildMovieHeader(utcTime: string): Buffer {
  const content = Buffer.alloc(100);
  const seconds = Math.floor(Date.parse(`${utcTime}Z`) / 1000) + QUICKTIME_EPOCH_OFFSET_SECONDS;
  content.writeUInt32BE(seconds, 4);
  return buildBox('mvhd', content);
}

function buildCreationDate(text: string): Buffer {
  const textBuffer = Buffer.from(text, 'utf8');
  const content = Buffer.alloc(4 + textBuffer.length);
  content.writeUInt16BE(textBuffer.length, 0);
  textBuffer.copy(content, 4);
  return buildBox('©day', content);
}

/** 머신 시간대에 따라 달라지는 동작은 자식 프로세스에 TZ 를 주고 확인한다. */
function runUnderTimezone(expression: string, timezone: string): string {
  const modulePath = JSON.stringify(path.join(__dirname, 'mp4-date.ts'));
  const script = `
    const mp4Date = require(${modulePath});
    Promise.resolve(${expression}).then((result) => process.stdout.write(String(result)));
  `;

  return execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
    env: { ...process.env, TZ: timezone },
    encoding: 'utf8',
  });
}

function parseMoovUnderTimezone(moovBuffer: Buffer, timezone: string): string {
  const encoded = JSON.stringify(moovBuffer.toString('base64'));
  return runUnderTimezone(`mp4Date.parseMoovDateTime(Buffer.from(${encoded}, 'base64'))`, timezone);
}

async function writeSampleVideo(boxes: Buffer): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mp4-date-'));
  const file = path.join(directory, 'sample.mp4');
  await fs.writeFile(file, boxes);
  return file;
}

describe('parseMoovDateTime', () => {
  // DJI FC8282 실측값: mvhd 가 UTC 01:51:07, 같은 기기 파일명은 DJI_20260917105107 (KST 10:51:07).
  it('UTC 로 적는 기기(DJI)는 머신 시간대로 변환한다', () => {
    const moov = Buffer.concat([
      buildMovieHeader('2026-09-17T01:51:07'),
      buildBox('udta', buildBox('\u00a9dji', Buffer.alloc(4))),
    ]);
    expect(parseMoovUnderTimezone(moov, 'Asia/Seoul')).toBe('20260917_105107');
    expect(parseMoovUnderTimezone(moov, 'UTC')).toBe('20260917_015107');
  }, 60000);

  // OM System TG-7 실측값: mvhd 가 09:50:32 인데 udta/TAGS 의 현지 시각과 같다.
  it('현지 시각으로 적는 기기(OM System)는 변환하지 않는다', () => {
    const moov = Buffer.concat([
      buildMovieHeader('2026-09-17T09:50:32'),
      buildBox('udta', buildBox('TAGS', Buffer.from('OMDS'))),
    ]);
    expect(parseMoovUnderTimezone(moov, 'Asia/Seoul')).toBe('20260917_095032');
    expect(parseMoovUnderTimezone(moov, 'UTC')).toBe('20260917_095032');
  }, 60000);

  it('©day 가 있으면 mvhd 보다 우선한다', () => {
    const moov = Buffer.concat([
      buildMovieHeader('2026-09-17T01:51:07'),
      buildBox('udta', buildCreationDate('2026-09-17T23:11:00+0900')),
    ]);
    expect(parseMoovDateTime(moov)).toBe('20260917_231100');
  });

  // ©day 는 적힌 벽시계를 그대로 쓴다. 현지 시각에 Z 를 붙이는 기기가 있어 오프셋을 믿지 않는다.
  it('©day 는 머신 시간대와 무관하게 적힌 벽시계를 쓴다', () => {
    const moov = buildBox('udta', buildCreationDate('2026-09-17T10:51:07+0000'));
    expect(parseMoovUnderTimezone(moov, 'Asia/Seoul')).toBe('20260917_105107');
    expect(parseMoovUnderTimezone(moov, 'UTC')).toBe('20260917_105107');
  }, 60000);

  it('creation_time 이 0 이면 날짜를 만들지 않는다', () => {
    const moov = buildBox('mvhd', Buffer.alloc(100));
    expect(parseMoovDateTime(moov)).toBeUndefined();
  });
});

describe('getDateTimeFromVideo', () => {
  it('ftyp/mdat 뒤에 있는 moov 도 찾아낸다', async () => {
    const file = await writeSampleVideo(
      Buffer.concat([
        buildBox('ftyp', Buffer.from('isom')),
        buildBox('mdat', Buffer.alloc(4096)),
        buildBox(
          'moov',
          Buffer.concat([
            buildMovieHeader('2026-09-17T01:59:17'),
            buildBox('udta', buildBox('\u00a9dji', Buffer.alloc(4))),
          ])
        ),
      ])
    );

    const encoded = JSON.stringify(file);
    expect(runUnderTimezone(`mp4Date.getDateTimeFromVideo(${encoded})`, 'Asia/Seoul')).toBe('20260917_105917');
  }, 60000);

  it('moov 가 없으면 undefined', async () => {
    const file = await writeSampleVideo(buildBox('ftyp', Buffer.from('isom')));
    const { getDateTimeFromVideo } = await import('./mp4-date');

    expect(await getDateTimeFromVideo(file)).toBeUndefined();
  });
});
