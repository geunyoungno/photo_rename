import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

interface OrganizeOptions {
  path?: string;
  dryRun?: boolean;
}

const STANDARD_TIMESTAMP_PATTERN = /^\d{8}_\d{6}(?:_\d{3})?(?:_\d+|\(\d+\))*$/;

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
  // 괄호 형식 (n) 제거하고 root 추출
  const normalized = baseName.replace(/\(\d+\)/g, '');
  const match = normalized.match(/^(\d{8}_\d{6}(?:_\d{3})?)(?:_(\d+))?$/);
  if (!match) {
    return null;
  }

  // 괄호 형식에서 최대 인덱스 추출
  const parenMatches = baseName.match(/\((\d+)\)/g);
  let parenIndex = 0;
  if (parenMatches) {
    parenIndex = Math.max(...parenMatches.map(m => Number(m.slice(1, -1))));
  }

  const underscoreIndex = match[2] ? Number(match[2]) : 0;

  return {
    root: match[1],
    index: Math.max(underscoreIndex, parenIndex),
  };
}

function getYearMonthFromRoot(root: string) {
  const year = root.slice(0, 4);
  const month = root.slice(4, 6);
  return `${year}-${month}`;
}

function ensureCountMap(
  countMaps: Map<string, Map<string, number>>,
  dir: string
): Map<string, number> {
  if (!countMaps.has(dir)) {
    countMaps.set(dir, new Map());
  }
  return countMaps.get(dir)!;
}

async function seedCountMapForDir(
  countMaps: Map<string, Map<string, number>>,
  dir: string
) {
  const map = ensureCountMap(countMaps, dir);

  try {
    const existing = await fs.readdir(dir);
    for (const filename of existing) {
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);
      const parsed = parseStandardTimestamp(baseName);

      if (!parsed) {
        continue;
      }

      const current = map.get(parsed.root) ?? 0;
      const next = Math.max(current, parsed.index + 1);
      map.set(parsed.root, next);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Error reading directory ${dir}:`, error);
    }
  }
}

function getUniqueFilename(
  countMaps: Map<string, Map<string, number>>,
  dir: string,
  baseName: string,
  ext: string
): string {
  const map = ensureCountMap(countMaps, dir);
  const count = map.get(baseName) ?? 0;
  map.set(baseName, count + 1);

  return count > 0 ? `${baseName}_${count}${ext}` : `${baseName}${ext}`;
}

export async function organize(options: OrganizeOptions = {}) {
  const { path: providedPath, dryRun = false } = options;

  if (!providedPath) {
    console.error(chalk.red('Error: --path is required for the organize command.'));
    return;
  }

  const targetPath = providedPath;

  console.log(`Starting organize process in: ${chalk.cyan(targetPath)}`);
  if (dryRun) {
    console.log(chalk.yellow('-- DRY RUN MODE --'));
  }

  const filenames = await readFilenames(targetPath);
  if (filenames.length === 0) {
    console.log(chalk.yellow('No files found to organize.'));
    return;
  }

  const countMaps = new Map<string, Map<string, number>>();
  let movedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const filename of filenames) {
    const oldPath = path.join(targetPath, filename);

    let stats: fs.Stats;
    try {
      stats = await fs.stat(oldPath);
    } catch (error) {
      console.error(`${chalk.red('✖')} Failed to stat ${filename}:`, error);
      errorCount++;
      continue;
    }

    if (!stats.isFile()) {
      skippedCount++;
      continue;
    }

    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    if (!isStandardTimestampFilename(baseName)) {
      console.log(`- Skipping (not standard format): ${filename}`);
      skippedCount++;
      continue;
    }

    const parsed = parseStandardTimestamp(baseName);
    if (!parsed) {
      console.log(`- Skipping (invalid standard format): ${filename}`);
      skippedCount++;
      continue;
    }

    const yearMonth = getYearMonthFromRoot(parsed.root);
    const destDir = path.join(targetPath, yearMonth);

    if (!countMaps.has(destDir)) {
      await seedCountMapForDir(countMaps, destDir);
    }

    const finalFilename = getUniqueFilename(countMaps, destDir, parsed.root, ext);
    const newPath = path.join(destDir, finalFilename);

    if (dryRun) {
      console.log(`${chalk.blue('[DRY RUN]')} ${filename} -> ${chalk.green(path.join(yearMonth, finalFilename))}`);
      movedCount++;
      continue;
    }

    try {
      await fs.ensureDir(destDir);
      await fs.move(oldPath, newPath, { overwrite: false });
      console.log(`${chalk.green('✔')} Moved: ${filename} -> ${chalk.green(path.join(yearMonth, finalFilename))}`);
      movedCount++;
    } catch (error) {
      console.error(`${chalk.red('✖')} Failed to move ${filename}:`, error);
      errorCount++;
    }
  }

  console.log('\n--- Organize Summary ---');
  console.log(chalk.green(`Moved:   ${movedCount}`));
  console.log(chalk.yellow(`Skipped: ${skippedCount}`));
  console.log(chalk.red(`Errors:  ${errorCount}`));
  console.log('------------------------');
}
