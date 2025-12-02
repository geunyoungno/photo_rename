import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import * as ExifReader from 'exifreader';
import { DateTime } from 'luxon';
import chalk from 'chalk';

const filenameMap: Map<string, number> = new Map();

async function readFilenames(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
}

async function getDateTime(filePath: string): Promise<string | undefined> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const tags = ExifReader.load(fileBuffer);
    const dateTimeOriginal = tags['DateTimeOriginal']?.description;
    if (dateTimeOriginal) {
      return dateTimeOriginal;
    }

    const stats = await fs.stat(filePath);
    return DateTime.fromJSDate(stats.mtime).toFormat('yyyy:LL:dd HH:mm:ss');
  } catch (error) {
    console.error(`Could not get date from ${path.basename(filePath)}:`, error);
    return undefined;
  }
}

async function getChangedFilename(filePath: string): Promise<string | undefined> {
  const dateTime = await getDateTime(filePath);
  if (!dateTime) {
    return undefined;
  }

  return DateTime.fromFormat(dateTime, 'yyyy:LL:dd HH:mm:ss').toFormat('yyyyLLdd_HHmmss');
}

export async function rename(providedPath?: string, dryRun: boolean = false) {
  const targetPath = providedPath || path.join(os.homedir(), 'Desktop', 'Kakao');
  console.log(`Starting Kakao rename process in: ${chalk.cyan(targetPath)}`);
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
    const changedFilenameOrigin = await getChangedFilename(oldPath);

    if (!changedFilenameOrigin) {
      console.log(`- Skipping (could not determine new name): ${filename}`);
      skippedCount++;
      continue;
    }

    const count = filenameMap.get(changedFilenameOrigin) || 0;
    filenameMap.set(changedFilenameOrigin, count + 1);

    const ext = path.extname(filename);
    const finalFilename = count > 0 ? `${changedFilenameOrigin}_${count}${ext}` : `${changedFilenameOrigin}${ext}`;

    if (filename === finalFilename) {
      console.log(`- Skipping (no change): ${filename}`);
      skippedCount++;
      continue;
    }

    if (dryRun) {
      console.log(`${chalk.blue('[DRY RUN]')} ${filename} -> ${chalk.green(finalFilename)}`);
      successCount++;
    } else {
      try {
        const newPath = path.join(targetPath, finalFilename);
        await fs.rename(oldPath, newPath);
        console.log(`${chalk.green('✔')} Renamed: ${filename} -> ${chalk.green(finalFilename)}`);
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
