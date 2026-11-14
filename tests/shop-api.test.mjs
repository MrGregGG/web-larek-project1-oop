import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const build = process.env.WEB_LAREK_API_BUILD_DIR;
if (!build) throw new Error('Запустите node scripts/check-shop-api.mjs');
const { Api } = require(join(build, 'components/base/api.js'));
const { EventEmitter } = require(join(build, 'components/base/events.js'));
const { CatalogModel } = require(join(build, 'models/CatalogModel.js'));
const { ShopApi } = require(join(build, 'services/ShopApi.js'));
const { ShopApiError } = require(join(build, 'services/ShopApiError.js'));
const { loadCatalog } = require(join(build, 'integration/loadCatalog.js'));
const { resolveProductImage } = require(join(
	build,
	'utils/resolveProductImage.js'
));

// Только контролируемые тестовые данные; не реальные товары или ответы сервера.
const base = 'https://api.example.test/api/weblarek';
const cdn = 'https://api.example.test/content/weblarek';
const product = () => ({
	id: 'test-product',
	title: 'Test product',
	description: 'Test description',
	image: '/test.svg',
	category: 'Test category',
	price: 10,
});
const list = (items = [product()]) => ({ total: items.length, items });
const order = () => ({
	payment: 'card',
	address: ' Address ',
	email: ' Email ',
	phone: ' Phone ',
	total: 10,
	items: ['test-product'],
});
const isError = (code) => (error) => {
	assert.ok(error instanceof ShopApiError);
	assert.equal(error.code, code);
	return true;
};
function mocked(t, value, status = 200, apiBase = base) {
	const calls = [];
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		calls.push({ url, options });
		return new Response(JSON.stringify(value), { status });
	});
	return { shop: new ShopApi(new Api(apiBase), cdn), calls };
}

test('Корректный каталог проходит через настоящий Api и нормализуется', async (t) => {
	const dto = list([{ ...product(), extra: 'not-a-domain-field' }]);
	const { shop, calls } = mocked(t, dto);
	const result = await shop.getProducts();
	assert.deepEqual(result, list());
	assert.deepEqual(
		calls.map(({ url, options }) => [url, options.method]),
		[[`${base}/product/`, 'GET']]
	);
	assert.equal(result.items[0].image, '/test.svg');
	assert.equal(result.items[0].extra, undefined);
});

test('Завершающий слеш base URL не дублируется', async (t) => {
	const { shop, calls } = mocked(t, list(), 200, `${base}/`);
	await shop.getProducts();
	assert.equal(calls[0].url, `${base}/product/`);
});

test('Пустой каталог корректно очищает модель', async (t) => {
	const { shop } = mocked(t, list([]));
	const catalog = new CatalogModel(new EventEmitter());
	catalog.setItems([product()]);
	assert.deepEqual(await loadCatalog(shop, catalog), list([]));
	assert.deepEqual(catalog.items, []);
});

test('Нулевая и null-цена сохраняются; категория не ограничивается старым enum', async (t) => {
	const items = [
		{ ...product(), id: 'zero', price: 0 },
		{ ...product(), id: 'priceless', price: null },
	];
	const { shop } = mocked(t, list(items));
	assert.deepEqual((await shop.getProducts()).items, items);
});

for (const [label, value] of [
	['null', null],
	['array', []],
	['string', 'bad'],
	['missing items', { total: 0 }],
	['non-array items', { total: 1, items: {} }],
	['missing total', { items: [] }],
	['string total', { total: '0', items: [] }],
	['fraction total', { total: 0.5, items: [] }],
	['wrong total', { total: 3, items: [product()] }],
	['duplicate ID', list([product(), product()])],
]) {
	test(`Неверный каталог отклоняется без изменения модели: ${label}`, async (t) => {
		const { shop } = mocked(t, value);
		const events = new EventEmitter();
		const catalog = new CatalogModel(events);
		catalog.setItems([product()]);
		let changed = 0;
		events.on('catalog:changed', () => changed++);
		await assert.rejects(loadCatalog(shop, catalog), isError('invalid-data'));
		assert.deepEqual(catalog.items, [product()]);
		assert.equal(changed, 0);
	});
}

for (const field of [
	'id',
	'title',
	'description',
	'image',
	'category',
	'price',
]) {
	test(`Отсутствующее обязательное поле отклоняется: ${field}`, async (t) => {
		const dto = product();
		delete dto[field];
		const { shop } = mocked(t, list([dto]));
		await assert.rejects(shop.getProducts(), isError('invalid-data'));
	});
}

for (const [field, value] of [
	['id', 123],
	['title', null],
	['description', null],
	['image', null],
	['category', []],
	['price', '10'],
	['price', -1],
	['price', Infinity],
	['image', ''],
	['id', '  '],
	['title', ' '],
	['image', 'javascript:alert(1)'],
]) {
	test(`Неверное поле отклоняется: ${field} = ${JSON.stringify(
		value
	)}`, async (t) => {
		// JSON не умеет Infinity: передаём его как неизвестный разобранный ответ Api.
		const dto = { ...product(), [field]: value };
		if (value === Infinity) {
			const api = new Api(base);
			t.mock.method(api, 'get', async () => list([dto]));
			await assert.rejects(
				new ShopApi(api, cdn).getProducts(),
				isError('invalid-data')
			);
		} else {
			const { shop } = mocked(t, list([dto]));
			await assert.rejects(shop.getProducts(), isError('invalid-data'));
		}
	});
}

test('Некорректный JSON безопасно отклоняется', async (t) => {
	t.mock.method(
		globalThis,
		'fetch',
		async () => new Response('{ broken json', { status: 200 })
	);
	await assert.rejects(
		new ShopApi(new Api(base), cdn).getProducts(),
		isError('invalid-data')
	);
});

test('HTTP-ошибка с JSON не раскрывает сырое сообщение сервера', async (t) => {
	const { shop, calls } = mocked(t, { error: 'internal-secret-details' }, 500);
	await assert.rejects(shop.getProducts(), (error) => {
		assert.equal(error.code, 'request-failed');
		assert.equal(error.message.includes('internal-secret'), false);
		return true;
	});
	assert.equal(calls.length, 1);
});

test('HTTP-ошибка с HTML также отклоняется и сохраняет старый каталог', async (t) => {
	t.mock.method(
		globalThis,
		'fetch',
		async () => new Response('<html>Error</html>', { status: 502 })
	);
	const catalog = new CatalogModel(new EventEmitter());
	catalog.setItems([product()]);
	await assert.rejects(
		loadCatalog(new ShopApi(new Api(base), cdn), catalog),
		isError('invalid-data')
	);
	assert.deepEqual(catalog.items, [product()]);
});

test('Сетевая ошибка безопасно отклоняется без автоматического повтора', async (t) => {
	let calls = 0;
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		throw new TypeError('private-network-info');
	});
	await assert.rejects(
		new ShopApi(new Api(base), cdn).getProducts(),
		isError('request-failed')
	);
	assert.equal(calls, 1);
});

test('Успешная интеграция обновляет CatalogModel и публикует одно событие', async (t) => {
	const { shop } = mocked(t, list());
	const events = new EventEmitter();
	const states = [];
	events.on('catalog:changed', (data) => states.push(data));
	const catalog = new CatalogModel(events);
	const result = await loadCatalog(shop, catalog);
	assert.equal(states.length, 1);
	assert.deepEqual(catalog.items, [product()]);
	result.items[0].title = 'Mutation';
	assert.equal(catalog.items[0].title, 'Test product');
});

test('Один неверный товар отклоняет весь каталог без частичного обновления', async (t) => {
	const invalid = { ...product(), id: 'bad-product' };
	delete invalid.image;
	const { shop } = mocked(t, list([product(), invalid]));
	const catalog = new CatalogModel(new EventEmitter());
	const previous = { ...product(), id: 'previous-product' };
	catalog.setItems([previous]);
	await assert.rejects(loadCatalog(shop, catalog), isError('invalid-data'));
	assert.deepEqual(catalog.items, [previous]);
});

for (const [image, expected] of [
	['/test.svg', `${cdn}/test.svg`],
	['test.svg', `${cdn}/test.svg`],
	['icons//test.svg', `${cdn}/icons/test.svg`],
	['/content/weblarek/test.svg', `${cdn}/test.svg`],
	['content/weblarek/test.svg', `${cdn}/test.svg`],
	[`${cdn}/test.svg`, `${cdn}/test.svg`],
	[
		'https://assets.example.test/image.svg?sig=a%2Fb#part',
		'https://assets.example.test/image.svg?sig=a%2Fb#part',
	],
	[
		'http://assets.example.test/image.svg',
		'http://assets.example.test/image.svg',
	],
	['test.svg?v=1#part', `${cdn}/test.svg?v=1#part`],
]) {
	test(`CDN: ${image}`, () => {
		assert.equal(resolveProductImage(image, `${cdn}///`), expected);
	});
}

for (const image of [
	'',
	' ',
	'/',
	'../test.svg',
	'%2e%2e/test.svg',
	'folder/%2f.svg',
	'file%zz.svg',
	'test\\x.svg',
	'test\nx.svg',
	'javascript:alert(1)',
	'data:image/svg+xml,test',
	'//assets.example.test/x.svg',
	'https:/invalid.test/x.svg',
	'https://user:pass@example.test/x.svg',
]) {
	test(`CDN отклоняет небезопасный путь: ${JSON.stringify(image)}`, () => {
		assert.throws(
			() => resolveProductImage(image, cdn),
			isError('invalid-data')
		);
	});
}

for (const invalidBase of [
	'relative/cdn',
	'javascript:bad',
	`${cdn}?secret=1`,
	'https://user:pass@example.test/cdn',
]) {
	test(`Некорректная конфигурация CDN отклоняется: ${invalidBase}`, () => {
		assert.throws(
			() => resolveProductImage('/test.svg', invalidBase),
			isError('configuration')
		);
	});
}

test('Отправка заказа преобразует card в online, явно формирует body и проверяет ответ', async (t) => {
	const { shop, calls } = mocked(t, {
		id: 'test-confirmation',
		total: 10,
		extra: 'ignored',
	});
	const input = order();
	input.extra = 'must-not-be-sent';
	assert.deepEqual(await shop.submitOrder(input), { total: 10 });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, `${base}/order`);
	assert.equal(calls[0].options.method, 'POST');
	assert.deepEqual(JSON.parse(calls[0].options.body), {
		payment: 'online',
		address: 'Address',
		email: 'Email',
		phone: 'Phone',
		total: 10,
		items: ['test-product'],
	});
	assert.equal(input.payment, 'card');
	assert.equal(input.address, ' Address ');
});

test('Неподтверждённая оплата cash отклоняется до HTTP', async (t) => {
	const { shop, calls } = mocked(t, { id: 'test', total: 10 });
	await assert.rejects(
		shop.submitOrder({ ...order(), payment: 'cash' }),
		isError('contract-unavailable')
	);
	assert.equal(calls.length, 0);
});

for (const changes of [
	{ address: '' },
	{ email: ' ' },
	{ phone: '' },
	{ items: [] },
	{ items: ['x', 'x'] },
	{ items: [1] },
	{ total: -1 },
	{ total: NaN },
	{ payment: 'unknown' },
]) {
	test(`Некорректный заказ не отправляется: ${JSON.stringify(
		changes
	)}`, async (t) => {
		const { shop, calls } = mocked(t, { id: 'test', total: 10 });
		await assert.rejects(
			shop.submitOrder({ ...order(), ...changes }),
			isError('invalid-data')
		);
		assert.equal(calls.length, 0);
	});
}

for (const response of [
	null,
	[],
	{},
	{ id: '', total: 10 },
	{ id: 'test', total: '10' },
	{ id: 'test', total: -1 },
	{ id: 'test', total: 99 },
	{ total: 10 },
]) {
	test(`Некорректное подтверждение заказа отклоняется: ${JSON.stringify(
		response
	)}`, async (t) => {
		const { shop } = mocked(t, response);
		await assert.rejects(shop.submitOrder(order()), isError('invalid-data'));
	});
}

test('Ошибка POST сохраняет входной заказ и не вызывает автоматический повтор', async (t) => {
	const { shop, calls } = mocked(t, { error: 'Неверная сумма заказа' }, 400);
	const input = order();
	const before = structuredClone(input);
	await assert.rejects(shop.submitOrder(input), isError('request-failed'));
	assert.deepEqual(input, before);
	assert.equal(calls.length, 1);
});
