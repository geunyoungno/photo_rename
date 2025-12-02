import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import exifr from 'exifr';
import { DateTime } from 'luxon';
import chalk from 'chalk';

type PhotoCategory = 'foodie' | 'kakao' | 'ipad';

const photoCategoryPaths: Record<PhotoCategory, string> = {
  foodie: 'Foodie',
  kakao: 'KakaoTalk',
  ipad: '100APPLE',
};

const filenameMap = new Map<string, number>();

async function readFilenames(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
}

function getExifDate(exif: any, timezone: string) {
  const createDate = exif?.CreateDate;
  const dateTimeOriginal = exif?.DateTimeOriginal;

  const format = (date: Date) => DateTime.fromJSDate(date).setZone(timezone).toFormat('yyyyLLdd_HHmmss');

  return {
    createDate: createDate ? format(createDate) : undefined,
    dateTimeOriginal: dateTimeOriginal ? format(dateTimeOriginal) : undefined,
  };
}

interface GeneralRenameOptions {
  category?: PhotoCategory;
  base_path?: string;
  timezone?: string;
  dryRun?: boolean;
}

export async function rename(options: GeneralRenameOptions) {
  const { category, base_path, timezone, dryRun = false } = options;

  if (!category) {
    console.error(chalk.red('Error: Category is required for the general strategy.'));
    return;
  }

  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resolvedBasePath = base_path || os.homedir();
  const categoryPath = photoCategoryPaths[category];
  const targetPath = path.join(resolvedBasePath, categoryPath);

  console.log(`Starting General rename process in: ${chalk.cyan(targetPath)}`);
  if (dryRun) {
    console.log(chalk.yellow('-- DRY RUN MODE --'));
  }

  const filenames = await readFilenames(targetPath);
  if (filenames.length === 0) {
    console.log(chalk.yellow('No files found to rename.'));
    return;
  }

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const filename of filenames) {
    const oldPath = path.join(targetPath, filename);
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    try {
      const exif = await exifr.parse(oldPath);
      const { createDate, dateTimeOriginal } = getExifDate(exif, resolvedTimezone);

      const potentialNames = [createDate, dateTimeOriginal, baseName].filter(Boolean);
      const newName = potentialNames[0] as string;

      if (!newName || newName === baseName) {
        console.log(`- Skipping (no change or no date found): ${filename}`);
        skippedCount++;
        continue;
      }

      const count = filenameMap.get(newName) || 0;
      filenameMap.set(newName, count + 1);

      const finalFilename = count > 0 ? `${newName}_${count}${ext}` : `${newName}${ext}`;

      if (dryRun) {
        console.log(`${chalk.blue('[DRY RUN]')} ${filename} -> ${chalk.green(finalFilename)}`);
        successCount++;
      } else {
        const newPath = path.join(targetPath, finalFilename);
        await fs.rename(oldPath, newPath);
        console.log(`${chalk.green('✔')} Renamed: ${filename} -> ${chalk.green(finalFilename)}`);
        successCount++;
      }
    } catch (error) {
      console.error(`${chalk.red('✖')} Failed to process ${filename}:`, error);
      errorCount++;
    }
  }

  console.log('\n--- Rename Summary ---');
  console.log(chalk.green(`Success: ${successCount}`));
  console.log(chalk.yellow(`Skipped: ${skippedCount}`));
  console.log(chalk.red(`Errors:  ${errorCount}`));
  console.log('----------------------');
}
