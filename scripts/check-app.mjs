import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const bundle = resolve(dist, 'main.js');
if (!existsSync(bundle) || !statSync(bundle).size) {
	throw new Error(
		'dist/main.js отсутствует или пуст. Сначала выполните npm run build.'
	);
}
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
if (!/<script\b[^>]*src=["'][^"']*main\.js["']/i.test(html)) {
	throw new Error('Production HTML не подключает main.js.');
}
const code = readFileSync(bundle, 'utf8');
if (
	!code.includes('createApp') ||
	!code.includes('product:open') ||
	!code.includes('order:submit')
) {
	throw new Error('main.js не содержит ожидаемый код координатора приложения.');
}
console.log(
	`PRODUCTION_BUNDLE PASS: main.js ${
		statSync(bundle).size
	} bytes; HTML подключает приложение.`
);
if (process.argv.includes('--check-only')) process.exit(0);

const portOption = process.argv.find((x) => x.startsWith('--port='));
const port = portOption ? Number(portOption.slice(7)) : 8087;
const svg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="purple"/></svg>';
const product = (id, price) => ({
	id,
	price,
	title: `Контролируемый ${id}`,
	description: 'Только тестовые данные',
	category: 'другое',
	image: '/test.svg',
});
const products = [
	product('paid', 100),
	product('free', 0),
	product('priceless', null),
];
let state;
function reset() {
	state = {
		gets: 0,
		posts: [],
		failNext: false,
		malformedNext: false,
		delay: 0,
	};
}
reset();
const shim = `<script>
// Только тестовая обёртка HTML. Production main.js остаётся побайтно исходным.
const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
 const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
 const method = (options?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
 if (url.pathname.startsWith('/api/weblarek/')) return originalFetch('/__test-api' + url.pathname, options);
 if (method !== 'GET' && !(url.origin === location.origin && url.pathname.startsWith('/__test/'))) throw new Error('Тест запрещает внешние изменения');
 return originalFetch(input, options);
};
</script>`;
const controlledHtml = html.replace('<head>', '<head>' + shim);
const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.json': 'application/json',
};
const server = createServer(async (request, response) => {
	const url = new URL(request.url, 'http://127.0.0.1');
	const json = (value, status = 200) => {
		response.writeHead(status, {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		});
		response.end(JSON.stringify(value));
	};
	async function body() {
		let value = '';
		for await (const chunk of request) {
			value += chunk;
			if (value.length > 1_000_000) throw new Error('Большой запрос');
		}
		return JSON.parse(value);
	}
	try {
		if (url.pathname === '/__test/control' && request.method === 'POST') {
			const config = await body();
			if (config.reset) reset();
			for (const key of ['failNext', 'malformedNext'])
				if (typeof config[key] === 'boolean') state[key] = config[key];
			if (typeof config.delay === 'number')
				state.delay = Math.max(0, Math.min(5000, config.delay));
			return json({ ok: true });
		}
		if (url.pathname === '/__test/state' && request.method === 'GET')
			return json(state);
		if (url.pathname === '/__test/results' && request.method === 'POST') {
			const report = await body();
			console.log(`PRODUCTION_BROWSER_RESULT ${JSON.stringify(report)}`);
			return json({ received: true });
		}
		if (
			url.pathname === '/__test-api/api/weblarek/product/' &&
			request.method === 'GET'
		) {
			state.gets++;
			return json({
				total: products.length,
				items: products.map((item) => ({
					...item,
					image: `http://127.0.0.1:${
						server.address().port
					}/content/weblarek/test.svg`,
				})),
			});
		}
		if (
			url.pathname === '/__test-api/api/weblarek/order' &&
			request.method === 'POST'
		) {
			const order = await body();
			state.posts.push(order);
			const { failNext, malformedNext, delay } = state;
			state.failNext = false;
			state.malformedNext = false;
			if (delay) await new Promise((done) => setTimeout(done, delay));
			if (failNext) return json({ error: 'ControlledFailure' }, 500);
			if (malformedNext) return json({ invalid: true });
			if (
				order.payment !== 'online' ||
				!order.items?.length ||
				!order.address ||
				!order.email ||
				!order.phone
			)
				return json({ error: 'BadTestOrder' }, 400);
			return json({ id: 'controlled-order', total: order.total });
		}
		if (url.pathname === '/__controlled/' || url.pathname === '/__controlled') {
			response.writeHead(200, { 'Content-Type': mime['.html'] });
			return response.end(
				'<!doctype html><html lang="ru"><meta charset="utf-8"><title>Production checks</title><body><p id="summary">Проверяем production main.js на контролируемом API…</p><div id="frames"></div><pre id="results"></pre><script src="/__test/production.browser.js"></script></body></html>'
			);
		}
		if (url.pathname === '/__test/page') {
			response.writeHead(200, { 'Content-Type': mime['.html'] });
			return response.end(
				controlledHtml.replace('<head>', '<head><base href="/">')
			);
		}
		if (url.pathname === '/__test/production.browser.js') {
			response.writeHead(200, { 'Content-Type': mime['.js'] });
			return response.end(
				readFileSync(resolve(root, 'tests/production.browser.mjs'))
			);
		}
		if (request.method !== 'GET')
			return json({ error: 'Only controlled order POST is allowed here' }, 405);
		if (url.pathname === '/content/weblarek/test.svg') {
			response.writeHead(200, { 'Content-Type': mime['.svg'] });
			return response.end(svg);
		}
		const name =
			url.pathname === '/'
				? 'index.html'
				: decodeURIComponent(url.pathname).replace(/^\//, '');
		let file = resolve(dist, name);
		if (!file.startsWith(dist + sep)) return json({ error: 'NotFound' }, 404);
		if (!existsSync(file)) {
			const publicRoot = resolve(root, 'src/public');
			file = resolve(publicRoot, name);
			if (!file.startsWith(publicRoot + sep) || !existsSync(file))
				return json({ error: 'NotFound' }, 404);
		}
		if (!statSync(file).isFile()) return json({ error: 'NotFound' }, 404);
		response.writeHead(200, {
			'Content-Type': mime[extname(file)] || 'application/octet-stream',
			'Cache-Control': 'no-store',
		});
		response.end(readFileSync(file));
	} catch {
		json({ error: 'InvalidTestRequest' }, 400);
	}
});
server.on('error', (error) => {
	console.error(error);
	process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
	const base = `http://127.0.0.1:${server.address().port}`;
	console.log(`APP_URL ${base}/`);
	console.log(`CONTROLLED_CHECK_URL ${base}/__controlled/`);
	console.log(
		'Обычная страница использует реальный каталог; заказы проверяйте только по CONTROLLED_CHECK_URL. Остановка Ctrl+C.'
	);
});
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
