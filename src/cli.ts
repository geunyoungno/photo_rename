import { Command } from 'commander';

const program = new Command();

program
  .version('1.0.0')
  .description('A CLI tool to rename photos and videos');

import { rename } from './rename';

program
  .command('rename')
  .description('Rename photos and videos with a unified logic')
  .requiredOption('-p, --path <value>', 'Path to the target directory')
  .option('-t, --timezone <value>', 'Timezone for date conversion')
  .option('--dry-run', 'Perform a dry run without actual renaming')
  .action((options) => {
    rename({
      path: options.path,
      timezone: options.timezone,
      dryRun: options.dryRun,
    });
  });

program.parse(process.argv);
