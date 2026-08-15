import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const requiredFlags = {
  strict: true,
  noImplicitAny: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  noFallthroughCasesInSwitch: true,
  forceConsistentCasingInFileNames: true,
};

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['tsconfig.base.json', 'tsconfig.web.json', 'tsconfig.api.json'];

let failed = false;

for (const file of files) {
  const config = JSON.parse(readFileSync(join(packageRoot, file), 'utf8'));
  const options = config.compilerOptions ?? {};

  if (file === 'tsconfig.base.json') {
    for (const [flag, expected] of Object.entries(requiredFlags)) {
      if (options[flag] !== expected) {
        console.error(`FAIL ${file}: ${flag} must be ${expected}`);
        failed = true;
      }
    }
  } else {
    if (config.extends !== './tsconfig.base.json') {
      console.error(`FAIL ${file}: must extend "./tsconfig.base.json"`);
      failed = true;
    }
    for (const [flag] of Object.entries(requiredFlags)) {
      if (options[flag] === false) {
        console.error(`FAIL ${file}: must not disable "${flag}"`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
console.log(`OK: ${files.join(', ')} in ${packageRoot} enforce strict flags via extends.`);
