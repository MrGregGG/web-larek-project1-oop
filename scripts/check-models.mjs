import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = mkdtempSync(join(tmpdir(), 'web-larek-models-'));

// Используем установленный TypeScript; package.json и конфигурации не меняются.
try {
	const compilation = spawnSync(
		process.execPath,
		[
			require.resolve('typescript/bin/tsc'),
			'--strict',
			'--skipLibCheck',
			'--target',
			'es2017',
			'--module',
			'commonjs',
			'--moduleResolution',
			'node',
			'--rootDir',
			'src',
			'--outDir',
			buildDirectory,
			'src/models/CatalogModel.ts',
			'src/models/BasketModel.ts',
			'src/models/OrderModel.ts',
		],
		{ cwd: root, stdio: 'inherit' }
	);
	if (compilation.error) throw compilation.error;
	if (compilation.status !== 0) {
		process.exitCode = compilation.status ?? 1;
	} else {
		const tests = spawnSync(
			process.execPath,
			['--test', 'tests/models.test.mjs'],
			{
				cwd: root,
				stdio: 'inherit',
				env: {
					...process.env,
					WEB_LAREK_MODEL_BUILD_DIR: buildDirectory,
				},
			}
		);
		if (tests.error) throw tests.error;
		process.exitCode = tests.status ?? 1;
	}
} finally {
	// Удаляется только собственная временная сборка этого запуска.
	rmSync(buildDirectory, { recursive: true, force: true });
}
