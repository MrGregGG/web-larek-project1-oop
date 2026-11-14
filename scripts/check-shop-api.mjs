import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = mkdtempSync(join(tmpdir(), 'web-larek-api-'));
const live = process.argv.includes('--live');

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
			'src/services/ShopApi.ts',
			'src/integration/loadCatalog.ts',
			'src/models/CatalogModel.ts',
		],
		{ cwd: root, stdio: 'inherit' }
	);
	if (compilation.error) throw compilation.error;
	if (compilation.status !== 0) {
		process.exitCode = compilation.status ?? 1;
	} else {
		const tests = spawnSync(
			process.execPath,
			['--test', live ? 'tests/shop-api.live.mjs' : 'tests/shop-api.test.mjs'],
			{
				cwd: root,
				stdio: 'inherit',
				env: { ...process.env, WEB_LAREK_API_BUILD_DIR: buildDirectory },
			}
		);
		if (tests.error) throw tests.error;
		process.exitCode = tests.status ?? 1;
	}
} finally {
	rmSync(buildDirectory, { recursive: true, force: true });
}
