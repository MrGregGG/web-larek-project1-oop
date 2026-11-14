import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'web-larek-ui-'));
const site = join(temporary, 'site');
const keepServing = process.argv.includes('--serve');
const suite = process.argv.includes('--stage6')
	? 'app.browser.mjs'
	: process.argv.includes('--stage5')
	? 'checkout-ui.browser.mjs'
	: 'ui.browser.mjs';
const portOption = process.argv.find((argument) =>
	argument.startsWith('--port=')
);
const port = portOption ? Number(portOption.slice('--port='.length)) : 8084;
const exportOption = process.argv.find((argument) =>
	argument.startsWith('--export=')
);
let server;
let stopped = false;

function stop() {
	if (stopped) return;
	stopped = true;
	if (server) server.close();
	rmSync(temporary, { recursive: true, force: true });
}

try {
	const compilation = spawnSync(
		process.execPath,
		[
			require.resolve('typescript/bin/tsc'),
			'--project',
			join(root, 'tsconfig.json'),
			'--module',
			'commonjs',
			'--outDir',
			join(temporary, 'src'),
			'--noEmitOnError',
		],
		{ cwd: root, stdio: 'inherit' }
	);
	if (compilation.error) throw compilation.error;
	if (compilation.status !== 0)
		throw new Error('TypeScript-сборка стенда завершилась с ошибкой.');
	mkdirSync(join(temporary, 'tests'));
	copyFileSync(
		join(root, 'tests', suite),
		join(temporary, 'tests/ui.browser.mjs')
	);
	const entry = join(temporary, 'entry.cjs');
	writeFileSync(
		entry,
		`require(${JSON.stringify(join(root, 'src/scss/styles.scss'))});\n` +
			`window.__uiTestImage = require(${JSON.stringify(
				join(root, 'src/images/Subtract.svg')
			)});\n` +
			`require('./tests/ui.browser.mjs');\n`
	);
	const webpack = require('webpack');
	const originalConfig = require(join(root, 'webpack.config.js'))();
	// Уже скомпилированный JS обходит Babel только в тестовом стенде.
	// Файл конфигурации приложения не меняется; HTML, CSS и assets — исходные.
	const compiler = webpack({
		...originalConfig,
		context: root,
		mode: 'development',
		entry,
		output: { ...originalConfig.output, path: site },
		devtool: false,
		optimization: { minimize: false },
	});
	await new Promise((resolveBuild, rejectBuild) => {
		compiler.run((error, stats) => {
			compiler.close((closeError) => {
				if (error || closeError) return rejectBuild(error || closeError);
				if (stats.hasErrors())
					return rejectBuild(
						new Error(stats.toString({ all: false, errors: true }))
					);
				resolveBuild();
			});
		});
	});
	cpSync(join(root, 'src/public'), site, { recursive: true });
	if (exportOption) {
		const destination = resolve(exportOption.slice('--export='.length));
		mkdirSync(destination, { recursive: true });
		cpSync(site, destination, { recursive: true });
		console.log(`UI_FIXTURE_FILE ${join(destination, 'index.html')}`);
		stop();
	} else {
		const mime = {
			'.html': 'text/html; charset=utf-8',
			'.js': 'text/javascript; charset=utf-8',
			'.css': 'text/css; charset=utf-8',
			'.svg': 'image/svg+xml',
			'.ico': 'image/x-icon',
			'.json': 'application/json',
			'.png': 'image/png',
			'.woff': 'font/woff',
			'.woff2': 'font/woff2',
			'.ttf': 'font/ttf',
		};
		server = createServer(async (request, response) => {
			const url = new URL(request.url, 'http://127.0.0.1');
			if (request.method === 'POST' && url.pathname === '/__ui_results') {
				try {
					let body = '';
					for await (const chunk of request) {
						body += chunk;
						if (body.length > 1_000_000)
							throw new Error('Слишком большой отчёт.');
					}
					const report = JSON.parse(body);
					if (
						!Array.isArray(report.results) ||
						typeof report.failed !== 'number' ||
						typeof report.passed !== 'number'
					)
						throw new Error('Некорректный отчёт.');
					for (const result of report.results)
						console.log(
							`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${
								result.error ? `\n${result.error}` : ''
							}`
						);
					console.log(`UI_BROWSER_RESULT ${JSON.stringify(report)}`);
					response.writeHead(200, { 'Content-Type': 'application/json' });
					response.end('{"received":true}');
					process.exitCode = report.failed ? 1 : 0;
					if (!keepServing) stop();
				} catch (error) {
					response.writeHead(400);
					response.end(String(error));
				}
				return;
			}
			try {
				const filename = resolve(
					site,
					`.${decodeURIComponent(
						url.pathname === '/' ? '/index.html' : url.pathname
					)}`
				);
				if (!filename.startsWith(`${site}${sep}`) || !existsSync(filename)) {
					response.writeHead(404);
					response.end('Not found');
					return;
				}
				response.writeHead(200, {
					'Content-Type': mime[extname(filename)] || 'application/octet-stream',
				});
				response.end(readFileSync(filename));
			} catch {
				response.writeHead(400);
				response.end('Bad request');
			}
		});
		server.on('error', (error) => {
			console.error(error);
			process.exitCode = 1;
			stop();
		});
		server.listen(port, '127.0.0.1', () => {
			console.log(`UI_FIXTURE_URL http://127.0.0.1:${server.address().port}/`);
			console.log(
				'Откройте адрес в браузере: проверки выполнятся автоматически. Остановка: Ctrl+C.'
			);
		});
		process.once('SIGINT', stop);
		process.once('SIGTERM', stop);
	}
} catch (error) {
	console.error(error);
	process.exitCode = 1;
	stop();
}
