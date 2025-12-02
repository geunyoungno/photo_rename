import { Command } from 'commander';

const program = new Command();

program
  .version('1.0.0')
  .description('A CLI tool to rename photos and videos');

import { rename as foodieRename } from './strategies/foodie.strategy';
import { rename as kakaoRename } from './strategies/kakao.strategy';
import { rename as generalRename } from './strategies/general.strategy';
import { rename as ipadRename } from './strategies/ipad.strategy';

program
  .command('foodie')
  .description('Rename photos from the Foodie app')
  .option('-p, --path <value>', 'Path to the Foodie photos directory')
  .option('--dry-run', 'Perform a dry run without actual renaming')
  .action((options) => {
    foodieRename(options.path, options.dryRun);
  });

program
  .command('kakao')
  .description('Rename photos and videos from KakaoTalk')
  .option('-p, --path <value>', 'Path to the KakaoTalk media directory')
  .option('--dry-run', 'Perform a dry run without actual renaming')
  .action((options) => {
    kakaoRename(options.path, options.dryRun);
  });

program
  .command('general')
  .description('Rename general photos based on EXIF data')
  .requiredOption('-c, --category <value>', 'Photo category (ipad, foodie, kakao)')
  .option('-p, --path <value>', 'Base path to the photo directory')
  .option('-t, --timezone <value>', 'Timezone for date conversion')
  .option('--dry-run', 'Perform a dry run without actual renaming')
  .action((options) => {
    generalRename({
      category: options.category,
      base_path: options.path,
      timezone: options.timezone,
      dryRun: options.dryRun,
    });
  });

program
  .command('ipad')
  .description('Rename iPad photos and live photos (with MOV pairing)')
  .option('-p, --path <value>', 'Path to the iPad photos directory (default: ~/Desktop/100APPLE)')
  .option('-t, --timezone <value>', 'Timezone for date conversion')
  .option('--dry-run', 'Perform a dry run without actual renaming')
  .action((options) => {
    ipadRename({
      path: options.path,
      timezone: options.timezone,
      dryRun: options.dryRun,
    });
  });

program.parse(process.argv);
