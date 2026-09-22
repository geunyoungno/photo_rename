import { execFileSync } from 'child_process';
import path from 'path';

/**
 * exifr 이 EXIF 문자열을 되살리는 방식 그대로 Date 를 만든 뒤 파일명을 뽑는다.
 * 자식 프로세스로 돌려야 TZ 를 바꿔가며 확인할 수 있다.
 */
function formatUnderTimezone(timezone: string): string {
  const script = `
    const { formatDateFromJsDate } = require(${JSON.stringify(path.join(__dirname, 'rename.ts'))});
    const date = new Date(2026, 8, 17);
    date.setHours(10);
    date.setMinutes(59);
    date.setSeconds(17);
    process.stdout.write(formatDateFromJsDate(date));
  `;

  return execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
    env: { ...process.env, TZ: timezone },
    encoding: 'utf8',
  });
}

describe('formatDateFromJsDate', () => {
  // 회귀 방지: 여기에 setZone 을 되살리면 머신 시간대에 따라 9시간이 밀린다.
  it('실행 머신의 시간대와 무관하게 같은 이름을 만든다', () => {
    expect(formatUnderTimezone('Asia/Seoul')).toBe('20260917_105917');
    expect(formatUnderTimezone('UTC')).toBe('20260917_105917');
    expect(formatUnderTimezone('America/New_York')).toBe('20260917_105917');
  }, 60000);
});
