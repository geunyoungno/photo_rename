import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import exifr from 'exifr';
import { DateTime } from 'luxon';
import chalk from 'chalk';

interface LivePhotoSet {
  photo?: string;
  video?: string;
}

const filenameMap = new Map<string, number>();

async function readFilenames(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
}

/**
 * 라이브 포토 페어를 감지합니다.
 * IMG_1234.HEIC와 IMG_1234.MOV 같은 패턴을 찾습니다.
 */
function groupLivePhotos(filenames: string[]): Map<string, LivePhotoSet> {
  const groups = new Map<string, LivePhotoSet>();

  for (const filename of filenames) {
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, path.extname(filename));

    // IMG_XXXX 패턴 확인
    if (!baseName.startsWith('IMG_')) {
      continue;
    }

    if (!groups.has(baseName)) {
      groups.set(baseName, {});
    }

    const group = groups.get(baseName)!;

    if (['.heic', '.jpg', '.jpeg', '.png'].includes(ext)) {
      group.photo = filename;
    } else if (ext === '.mov') {
      group.video = filename;
    }
  }

  // 사진과 비디오 둘 다 없는 그룹 제거 (발생하지 않아야 하지만 방어 코드)
  for (const [key, group] of groups.entries()) {
    if (!group.photo && !group.video) {
      groups.delete(key);
    }
  }

  return groups;
}

async function getDateTimeFromFile(
  filePath: string,
  timezone: string
): Promise<string | undefined> {
  try {
    // exifr이 모든 포맷을 자동 감지하도록 최소 옵션만 사용
    const exif = await exifr.parse(filePath);

    const createDate = exif?.CreateDate;
    const dateTimeOriginal = exif?.DateTimeOriginal;

    if (createDate) {
      return DateTime.fromJSDate(createDate).setZone(timezone).toFormat('yyyyLLdd_HHmmss');
    }
    if (dateTimeOriginal) {
      return DateTime.fromJSDate(dateTimeOriginal).setZone(timezone).toFormat('yyyyLLdd_HHmmss');
    }

    // EXIF 정보가 없으면 파일 수정 시간 사용
    const stats = await fs.stat(filePath);
    return DateTime.fromJSDate(stats.mtime).setZone(timezone).toFormat('yyyyLLdd_HHmmss');
  } catch (error) {
    // EXIF 파싱 실패 시 파일 수정 시간으로 폴백
    console.warn(`Could not parse EXIF from ${path.basename(filePath)}, using file modification time`);
    try {
      const stats = await fs.stat(filePath);
      return DateTime.fromJSDate(stats.mtime).setZone(timezone).toFormat('yyyyLLdd_HHmmss');
    } catch (statError) {
      console.error(`Could not get date from ${path.basename(filePath)}:`, error);
      return undefined;
    }
  }
}

function getUniqueFilename(baseName: string, ext: string): string {
  const count = filenameMap.get(baseName) || 0;
  filenameMap.set(baseName, count + 1);

  return count > 0 ? `${baseName}_${count}${ext}` : `${baseName}${ext}`;
}

interface IpadRenameOptions {
  path?: string;
  timezone?: string;
  dryRun?: boolean;
}

export async function rename(options: IpadRenameOptions = {}) {
  const { path: providedPath, timezone, dryRun = false } = options;

  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const targetPath = providedPath || path.join(os.homedir(), 'Desktop', '100APPLE');

  console.log(`Starting iPad rename process in: ${chalk.cyan(targetPath)}`);
  console.log(`Timezone: ${chalk.cyan(resolvedTimezone)}`);
  if (dryRun) {
    console.log(chalk.yellow('-- DRY RUN MODE --'));
  }

  const filenames = await readFilenames(targetPath);
  if (filenames.length === 0) {
    console.log(chalk.yellow('No files found to rename.'));
    return;
  }

  const livePhotoGroups = groupLivePhotos(filenames);
  console.log(
    `Found ${chalk.cyan(String(livePhotoGroups.size))} photo(s), including ${chalk.cyan(String(Array.from(livePhotoGroups.values()).filter((g) => g.video).length))} live photo pair(s)`
  );

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [, group] of livePhotoGroups.entries()) {
    // 사진 파일이 있는 경우: 사진 기준으로 타임스탬프 결정
    if (group.photo) {
      const photoPath = path.join(targetPath, group.photo);
      const photoExt = path.extname(group.photo);

      const newBaseName = await getDateTimeFromFile(photoPath, resolvedTimezone);

      if (!newBaseName) {
        console.log(`- Skipping ${group.photo} (could not determine date)`);
        skippedCount++;
        continue;
      }

      const newPhotoName = getUniqueFilename(newBaseName, photoExt);

      // 사진 파일 이름 변경
      if (dryRun) {
        console.log(`${chalk.blue('[DRY RUN]')} ${group.photo} -> ${chalk.green(newPhotoName)}`);
        successCount++;
      } else {
        try {
          const newPhotoPath = path.join(targetPath, newPhotoName);
          await fs.rename(photoPath, newPhotoPath);
          console.log(`${chalk.green('✔')} Renamed: ${group.photo} -> ${chalk.green(newPhotoName)}`);
          successCount++;
        } catch (error) {
          console.error(`${chalk.red('✖')} Failed to rename ${group.photo}:`, error);
          errorCount++;
          continue; // 사진 이름 변경 실패 시 비디오도 건너뜀
        }
      }

      // 라이브 포토의 MOV 파일 처리 (페어)
      if (group.video) {
        const videoPath = path.join(targetPath, group.video);
        const videoExt = path.extname(group.video);

        // 사진과 동일한 기본 이름 사용 (카운트 포함)
        const newVideoBaseName = path.basename(newPhotoName, photoExt);
        const newVideoName = `${newVideoBaseName}${videoExt}`;

        if (dryRun) {
          console.log(
            `${chalk.blue('[DRY RUN]')} ${group.video} -> ${chalk.green(newVideoName)} ${chalk.gray('(live photo)')}`
          );
          successCount++;
        } else {
          try {
            const newVideoPath = path.join(targetPath, newVideoName);
            await fs.rename(videoPath, newVideoPath);
            console.log(
              `${chalk.green('✔')} Renamed: ${group.video} -> ${chalk.green(newVideoName)} ${chalk.gray('(live photo)')}`
            );
            successCount++;
          } catch (error) {
            console.error(`${chalk.red('✖')} Failed to rename ${group.video}:`, error);
            errorCount++;
          }
        }
      }
    }
    // 비디오만 있는 경우: 비디오 단독 처리
    else if (group.video) {
      const videoPath = path.join(targetPath, group.video);
      const videoExt = path.extname(group.video);

      const newBaseName = await getDateTimeFromFile(videoPath, resolvedTimezone);

      if (!newBaseName) {
        console.log(`- Skipping ${group.video} (could not determine date)`);
        skippedCount++;
        continue;
      }

      const newVideoName = getUniqueFilename(newBaseName, videoExt);

      if (dryRun) {
        console.log(
          `${chalk.blue('[DRY RUN]')} ${group.video} -> ${chalk.green(newVideoName)} ${chalk.gray('(video only)')}`
        );
        successCount++;
      } else {
        try {
          const newVideoPath = path.join(targetPath, newVideoName);
          await fs.rename(videoPath, newVideoPath);
          console.log(
            `${chalk.green('✔')} Renamed: ${group.video} -> ${chalk.green(newVideoName)} ${chalk.gray('(video only)')}`
          );
          successCount++;
        } catch (error) {
          console.error(`${chalk.red('✖')} Failed to rename ${group.video}:`, error);
          errorCount++;
        }
      }
    }
  }

  console.log('\n--- Rename Summary ---');
  console.log(chalk.green(`Success: ${successCount}`));
  console.log(chalk.yellow(`Skipped: ${skippedCount}`));
  console.log(chalk.red(`Errors:  ${errorCount}`));
  console.log('----------------------');
}
