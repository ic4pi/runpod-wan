// Builds every app and assembles one site:
//   /            Produce (free hub)
//   /bakery/     Bakery   } gated by middleware.ts
//   /beet/       Beet     }
//   /sprouts/    Sprouts  }
//   /account/    sign in and buy
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const apps = [
  { dir: 'produce', mount: '' },
  { dir: 'bakery', mount: 'bakery' },
  { dir: 'beet', mount: 'beet' },
  { dir: 'sprouts', mount: 'sprouts' },
];
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });

for (const { dir, mount } of apps) {
  const cwd = join(root, dir);
  console.log(`\n== ${dir}`);
  if (!existsSync(join(cwd, 'node_modules'))) run('npm', ['ci', '--no-audit', '--no-fund'], cwd);
  run('npm', ['run', 'build'], cwd);
  cpSync(join(cwd, 'dist'), join(root, 'dist', mount), { recursive: true });
}

cpSync(join(root, 'account'), join(root, 'dist', 'account'), { recursive: true });
console.log('\nSite assembled in dist/');
