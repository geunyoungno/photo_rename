import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

async function readFilenames(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
}

export function getChangedFilename(filename: string): string | null {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);

  const parts = baseName.split('-');
  if (parts.length < 4) {
    return null; // Invalid format
  }

  const datePart = parts.slice(0, 3).join('');
  const timePart = parts.slice(3, 6).join('');
  const millisecondPart = parts.length > 6 ? parts[6] : '000';

  return `${datePart}_${timePart}_${millisecondPart}${ext}`;
}

export async function rename(providedPath?: string, dryRun: boolean = false) {
  const targetPath = providedPath || path.join(os.homedir(), 'Desktop', 'Foodie');
  console.log(`Starting Foodie rename process in: ${chalk.cyan(targetPath)}`);
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
    const changedFilename = getChangedFilename(filename);

    if (!changedFilename || filename === changedFilename) {
      console.log(`- Skipping (no change or invalid format): ${filename}`);
      skippedCount++;
      continue;
    }

    if (dryRun) {
      console.log(`${chalk.blue('[DRY RUN]')} ${filename} -> ${chalk.green(changedFilename)}`);
      successCount++;
    } else {
      try {
        const oldPath = path.join(targetPath, filename);
        const newPath = path.join(targetPath, changedFilename);
        await fs.rename(oldPath, newPath);
        console.log(`${chalk.green('✔')} Renamed: ${filename} -> ${chalk.green(changedFilename)}`);
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
