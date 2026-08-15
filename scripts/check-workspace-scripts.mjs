import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredForAll = ['lint', 'typecheck', 'test'];
const requiredForWebApi = ['dev', 'build'];
const appsRequiringDevBuild = new Set(['@leads/web', '@leads/api']);
const isConfigPackage = (name) => /^@leads\/.*-(config|contracts)$/.test(name);

let failed = false;
let checked = 0;

for (const scope of ['apps', 'packages']) {
  const dir = join(root, scope);
  for (const entry of readdirSync(dir)) {
    let json;
    try {
      json = JSON.parse(readFileSync(join(dir, entry, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (isConfigPackage(json.name)) {
      continue;
    }
    checked += 1;
    const scripts = json.scripts ?? {};
    for (const script of requiredForAll) {
      if (!scripts[script]) {
        console.error(`FAIL ${json.name}: missing required script "${script}"`);
        failed = true;
      }
    }
    if (appsRequiringDevBuild.has(json.name)) {
      for (const script of requiredForWebApi) {
        if (!scripts[script]) {
          console.error(`FAIL ${json.name}: missing required app script "${script}"`);
          failed = true;
        }
      }
    }
  }
}

if (failed) process.exit(1);
console.log(`OK: ${checked} app package(s) checked - required scripts present.`);
