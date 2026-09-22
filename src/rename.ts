import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import exifr from 'exifr';
import * as ExifReader from 'exifreader';
import { DateTime } from 'luxon';
import chalk from 'chalk';
import { getDateTimeFromVideo, isVideoExtension } from './mp4-date';

interface LivePhotoSet {
  photo?: string;
  video?: string;
}

interface RenameOptions {
  path?: string;
  dryRun?: boolean;
}

const STANDARD_TIMESTAMP_PATTERN = /^\d{8}_\d{6}(?:_\d{3})?(?:_\d+)?$/;
const EXIF_DATETIME_FORMAT = 'yyyy:LL:dd HH:mm:ss';
const filenameMap = new Map<string, number>();

async function readFilenames(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
}

function isStandardTimestampFilename(baseName: string) {
  return STANDARD_TIMESTAMP_PATTERN.test(baseName);
}

function parseStandardTimestamp(baseName: string): { root: string; index: number } | null {
  const match = baseName.match(/^(\d{8}_\d{6}(?:_\d{3})?)(?:_(\d+))?$/);
  if (!match) {
    return null;
  }

  return {
    root: match[1],
    index: match[2] ? Number(match[2]) : 0,
  };
}

function seedFilenameMap(filenames: string[]) {
  filenameMap.clear();

  for (const filename of filenames) {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const parsed = parseStandardTimestamp(baseName);

    if (!parsed) {
      continue;
    }

    const current = filenameMap.get(parsed.root) ?? 0;
    const next = Math.max(current, parsed.index + 1);
    filenameMap.set(parsed.root, next);
  }
}

/**
 * Detect live photo pairs like IMG_1234.HEIC + IMG_1234.MOV.
 */
function groupLivePhotos(filenames: string[]): Map<string, LivePhotoSet> {
  const groups = new Map<string, LivePhotoSet>();

  for (const filename of filenames) {
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, path.extname(filename));

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

  for (const [key, group] of groups.entries()) {
    if (!group.photo && !group.video) {
      groups.delete(key);
    }
  }

  return groups;
}

/**
 * 기기가 적어 둔 벽시계 숫자를 그대로 파일명 형식으로 만든다.
 *
 * 시간대 변환은 하지 않는다. EXIF 에는 시간대 정보가 없어서, exifr 은 '2026:09:17 10:59:17' 을
 * 실행 머신의 시간대로 되살린다 (node_modules/exifr/src/dicts/tiff-revivers.mjs:52).
 * 여기서 다른 시간대로 변환하면 같은 파일이 머신마다 다른 이름이 된다 — TZ=UTC 로 돌리면
 * 9시간이 밀리는 걸 확인했다. 되살린 벽시계를 그대로 읽으면 어느 머신에서 돌려도 결과가 같다.
 */
export function formatDateFromJsDate(date: Date) {
  return DateTime.fromJSDate(date).toFormat('yyyyLLdd_HHmmss');
}

function formatDateFromExifString(value: string) {
  const parsed = DateTime.fromFormat(value, EXIF_DATETIME_FORMAT);
  return parsed.isValid ? parsed.toFormat('yyyyLLdd_HHmmss') : undefined;
}

async function getDateTimeFromExif(filePath: string): Promise<string | undefined> {
  // MP4/MOV 는 EXIF 가 아니라 moov 박스에 촬영 시각이 있다. exifr/exifreader 는 못 읽는다.
  if (isVideoExtension(path.extname(filePath))) {
    return getDateTimeFromVideo(filePath);
  }

  try {
    const exif = await exifr.parse(filePath);
    const createDate = exif?.CreateDate;
    const dateTimeOriginal = exif?.DateTimeOriginal;

    if (createDate) {
      return formatDateFromJsDate(createDate);
    }
    if (dateTimeOriginal) {
      return formatDateFromJsDate(dateTimeOriginal);
    }
  } catch (error) {
    // Ignore and fall back to other parsers or file metadata.
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    const tags = ExifReader.load(fileBuffer);
    const dateTimeOriginal = tags['DateTimeOriginal']?.description;
    const createDate = tags['CreateDate']?.description;
    const value = dateTimeOriginal || createDate;

    if (value) {
      return formatDateFromExifString(value);
    }
  } catch (error) {
    // Ignore and fall back to file metadata.
  }

  return undefined;
}

async function getDateTimeFromFile(filePath: string): Promise<string | undefined> {
  const exifDate = await getDateTimeFromExif(filePath);
  if (exifDate) {
    return exifDate;
  }

  console.warn(`No EXIF date in ${path.basename(filePath)}, using file modification time`);

  try {
    // 수정 시각은 EXIF 와 달리 진짜 절대 시각이라, 머신의 현재 시간대로 읽는 게 맞다.
    const stats = await fs.stat(filePath);
    return formatDateFromJsDate(stats.mtime);
  } catch (error) {
    console.error(`Could not get date from ${path.basename(filePath)}:`, error);
    return undefined;
  }
}

function getUniqueFilename(baseName: string, ext: string): string {
  const count = filenameMap.get(baseName) || 0;
  filenameMap.set(baseName, count + 1);

  return count > 0 ? `${baseName}_${count}${ext}` : `${baseName}${ext}`;
}

export async function rename(options: RenameOptions = {}) {
  const { path: providedPath, dryRun = false } = options;

  if (!providedPath) {
    console.error(chalk.red('Error: --path is required for the unified rename command.'));
    return;
  }

  const targetPath = providedPath || path.join(os.homedir(), 'Desktop');

  console.log(`Starting rename process in: ${chalk.cyan(targetPath)}`);
  if (dryRun) {
    console.log(chalk.yellow('-- DRY RUN MODE --'));
  }

  const filenames = await readFilenames(targetPath);
  if (filenames.length === 0) {
    console.log(chalk.yellow('No files found to rename.'));
    return;
  }

  seedFilenameMap(filenames);

  const livePhotoGroups = groupLivePhotos(filenames);
  const groupedFiles = new Set<string>();
  for (const group of livePhotoGroups.values()) {
    if (group.photo) groupedFiles.add(group.photo);
    if (group.video) groupedFiles.add(group.video);
  }

  console.log(
    `Found ${chalk.cyan(String(filenames.length))} file(s), including ${chalk.cyan(String(Array.from(livePhotoGroups.values()).filter((g) => g.video).length))} live photo pair(s)`
  );

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [, group] of livePhotoGroups.entries()) {
    if (group.photo) {
      const photoPath = path.join(targetPath, group.photo);
      const photoExt = path.extname(group.photo);
      const newBaseName = await getDateTimeFromFile(photoPath);

      if (!newBaseName) {
        console.log(`- Skipping ${group.photo} (could not determine date)`);
        skippedCount++;
        continue;
      }

      const newPhotoName = getUniqueFilename(newBaseName, photoExt);

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
          continue;
        }
      }

      if (group.video) {
        const videoPath = path.join(targetPath, group.video);
        const videoExt = path.extname(group.video);
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
    } else if (group.video) {
      const videoPath = path.join(targetPath, group.video);
      const videoExt = path.extname(group.video);
      const newBaseName = await getDateTimeFromFile(videoPath);

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

  for (const filename of filenames) {
    if (groupedFiles.has(filename)) {
      continue;
    }

    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    if (isStandardTimestampFilename(baseName)) {
      console.log(`- Skipping (already standard format): ${filename}`);
      skippedCount++;
      continue;
    }

    const filePath = path.join(targetPath, filename);
    const newBaseName = await getDateTimeFromFile(filePath);

    if (!newBaseName) {
      console.log(`- Skipping ${filename} (could not determine date)`);
      skippedCount++;
      continue;
    }

    const newFilename = getUniqueFilename(newBaseName, ext);

    if (newFilename === filename) {
      console.log(`- Skipping (no change): ${filename}`);
      skippedCount++;
      continue;
    }

    if (dryRun) {
      console.log(`${chalk.blue('[DRY RUN]')} ${filename} -> ${chalk.green(newFilename)}`);
      successCount++;
    } else {
      try {
        const newPath = path.join(targetPath, newFilename);
        await fs.rename(filePath, newPath);
        console.log(`${chalk.green('✔')} Renamed: ${filename} -> ${chalk.green(newFilename)}`);
        successCount++;
      } catch (error) {
        console.error(`${chalk.red('✖')} Failed to rename ${filename}:`, error);
        errorCount++;
      }
    }
  }

  console.log('\n--- Rename Summary ---');
  console.log(chalk.green(`Success: ${successCount}`));
  console.log(chalk.yellow(`Skipped: ${skippedCount}`));
  console.log(chalk.red(`Errors:  ${errorCount}`));
  console.log('----------------------');
}
