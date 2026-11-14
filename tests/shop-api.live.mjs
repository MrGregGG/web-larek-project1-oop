import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const build = process.env.WEB_LAREK_API_BUILD_DIR;
if (!build) throw new Error('Запустите node scripts/check-shop-api.mjs --live');
const { Api } = require(join(build, 'components/base/api.js'));
const { EventEmitter } = require(join(build, 'components/base/events.js'));
const { CatalogModel } = require(join(build, 'models/CatalogModel.js'));
const { ShopApi } = require(join(build, 'services/ShopApi.js'));
const { loadCatalog } = require(join(build, 'integration/loadCatalog.js'));
const { resolveProductImage } = require(join(
	build,
	'utils/resolveProductImage.js'
));
const origin = 'https://larek-api.nomoreparties.co';
const base = `${origin}/api/weblarek`;
const cdn = `${origin}/content/weblarek`;

// Только реальные GET, без моков и без создания заказов.
test(
	'LIVE: ShopApi → Api → сервер → проверка → CatalogModel',
	{ timeout: 30000 },
	async () => {
		const events = new EventEmitter();
		const catalog = new CatalogModel(events);
		let notifications = 0;
		events.on('catalog:changed', () => notifications++);
		const products = await loadCatalog(
			new ShopApi(new Api(base), cdn),
			catalog
		);
		assert.equal(products.total, products.items.length);
		assert.equal(catalog.items.length, products.items.length);
		assert.equal(notifications, 1);
		assert.ok(catalog.items.length > 0);
		console.log(
			`LIVE: получено ${products.total} товаров; ${notifications} событие catalog:changed.`
		);
	}
);

test(
	'LIVE: отдельный товар, CDN и реальная HTTP-ошибка',
	{ timeout: 30000 },
	async () => {
		const api = new Api(base);
		const shop = new ShopApi(api, cdn);
		const { items } = await shop.getProducts();
		const first = items[0];
		const detail = await api.get(`/product/${encodeURIComponent(first.id)}`);
		assert.deepEqual(detail, first);
		const imageUrl = resolveProductImage(first.image, cdn);
		const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
		assert.equal(image.status, 200);
		assert.ok(image.headers.get('content-type')?.startsWith('image/'));
		await image.arrayBuffer();
		await assert.rejects(api.get('/product/no-such-product'));
		console.log(
			`LIVE: отдельный товар подтверждён; CDN ${imageUrl} вернул HTTP 200.`
		);
	}
);
