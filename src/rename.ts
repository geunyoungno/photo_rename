import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import exifr from 'exifr';
import * as ExifReader from 'exifreader';
import { DateTime } from 'luxon';
import chalk from 'chalk';

interface LivePhotoSet {
  photo?: string;
  video?: string;
}

interface RenameOptions {
  path?: string;
  timezone?: string;
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

function formatDateFromJsDate(date: Date, timezone: string) {
  return DateTime.fromJSDate(date).setZone(timezone).toFormat('yyyyLLdd_HHmmss');
}

function formatDateFromExifString(value: string, timezone: string) {
  const dt = DateTime.fromFormat(value, EXIF_DATETIME_FORMAT, { zone: timezone });
  return dt.isValid ? dt.toFormat('yyyyLLdd_HHmmss') : undefined;
}

async function getDateTimeFromExif(filePath: string, timezone: string): Promise<string | undefined> {
  try {
    const exif = await exifr.parse(filePath);
    const createDate = exif?.CreateDate;
    const dateTimeOriginal = exif?.DateTimeOriginal;

    if (createDate) {
      return formatDateFromJsDate(createDate, timezone);
    }
    if (dateTimeOriginal) {
      return formatDateFromJsDate(dateTimeOriginal, timezone);
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
      return formatDateFromExifString(value, timezone);
    }
  } catch (error) {
    // Ignore and fall back to file metadata.
  }

  return undefined;
}

async function getDateTimeFromFile(filePath: string, timezone: string): Promise<string | undefined> {
  const exifDate = await getDateTimeFromExif(filePath, timezone);
  if (exifDate) {
    return exifDate;
  }

  console.warn(`No EXIF date in ${path.basename(filePath)}, using file modification time`);

  try {
    const stats = await fs.stat(filePath);
    return formatDateFromJsDate(stats.mtime, timezone);
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
  const { path: providedPath, timezone, dryRun = false } = options;

  if (!providedPath) {
    console.error(chalk.red('Error: --path is required for the unified rename command.'));
    return;
  }

  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const targetPath = providedPath || path.join(os.homedir(), 'Desktop');

  console.log(`Starting rename process in: ${chalk.cyan(targetPath)}`);
  console.log(`Timezone: ${chalk.cyan(resolvedTimezone)}`);
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
      const newBaseName = await getDateTimeFromFile(photoPath, resolvedTimezone);

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
    const newBaseName = await getDateTimeFromFile(filePath, resolvedTimezone);

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
