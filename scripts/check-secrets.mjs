#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

let files;
try {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  files = out.split('\0').filter((f) => f && existsSync(f));
} catch (error) {
  console.error(`check-secrets: falha ao listar arquivos do git: ${error.message}`);
  process.exit(2);
}

if (files.length === 0) {
  console.log('check-secrets: nenhum arquivo versionado a verificar.');
  process.exit(0);
}

const result = spawnSync('secretlint', ['--no-glob', ...files], {
  stdio: 'inherit',
  encoding: 'utf8',
});

console.error(
  'check-secrets: observação — nenhuma ferramenta garante detecção total de segredos; revisão humana adicional é recomendada.',
);

if (result.error) {
  console.error(`check-secrets: erro ao executar secretlint: ${result.error.message}`);
  process.exit(2);
}

process.exit(result.status === 0 ? 0 : 1);
