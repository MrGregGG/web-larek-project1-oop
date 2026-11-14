import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const buildDirectory = process.env.WEB_LAREK_MODEL_BUILD_DIR;
if (!buildDirectory) throw new Error('Запустите node scripts/check-models.mjs');
const { CatalogModel } = require(join(
	buildDirectory,
	'models/CatalogModel.js'
));
const { BasketModel } = require(join(buildDirectory, 'models/BasketModel.js'));
const { OrderModel } = require(join(buildDirectory, 'models/OrderModel.js'));
const { EventEmitter } = require(join(
	buildDirectory,
	'components/base/events.js'
));

const product = (id = 'one', price = 100) => ({
	id,
	title: `Товар ${id}`,
	description: 'Описание',
	image: '/image.svg',
	category: 'другое',
	price,
});
const emptyDraft = { payment: null, address: '', email: '', phone: '' };
const validOrder = (events = new EventEmitter(), payment = 'card') => {
	const model = new OrderModel(events);
	model.setField('payment', payment);
	model.setField('address', '  Адрес  ');
	model.setField('email', '  почта  ');
	model.setField('phone', '  телефон  ');
	return model;
};
const basketState = (items) => ({
	items,
	count: items.length,
	total: items.reduce((total, item) => total + item.price, 0),
});

test('Модели работают в Node без DOM', () => {
	assert.equal(typeof document, 'undefined');
	assert.equal(typeof window, 'undefined');
	const events = new EventEmitter();
	assert.deepEqual(new CatalogModel(events).items, []);
	assert.deepEqual(new BasketModel(events).getState(), basketState([]));
	assert.deepEqual(new OrderModel(events).draft, emptyDraft);
});

test('Каталог сохраняет товары, порядок и ищет по ID', () => {
	const catalog = new CatalogModel(new EventEmitter());
	catalog.setItems([product('one'), product('two', null)]);
	assert.deepEqual(
		catalog.items.map((item) => item.id),
		['one', 'two']
	);
	assert.equal(catalog.getById('two').price, null);
	assert.equal(catalog.getById('missing'), undefined);
});

test('Замена и очистка каталога публикуют правильный payload', () => {
	const events = new EventEmitter();
	const changes = [];
	events.on('catalog:changed', (data) => changes.push(data));
	const catalog = new CatalogModel(events);
	catalog.setItems([product()]);
	catalog.setItems([product('two')]);
	catalog.setItems([]);
	assert.deepEqual(
		changes.map(({ items }) => items.length),
		[1, 1, 0]
	);
	assert.equal(changes[1].items[0].id, 'two');
	assert.equal(catalog.getById('one'), undefined);
});

test('Дубли ID отклоняются атомарно, без события и потери старого каталога', () => {
	const events = new EventEmitter();
	const catalog = new CatalogModel(events);
	catalog.setItems([product('old')]);
	let changed = 0;
	events.on('catalog:changed', () => changed++);
	assert.throws(() => catalog.setItems([product(), product()]));
	assert.equal(catalog.items[0].id, 'old');
	assert.equal(changed, 0);
});

test('Каталог защищён от изменения входа, getter и результата поиска', () => {
	const catalog = new CatalogModel(new EventEmitter());
	const input = [product()];
	catalog.setItems(input);
	input[0].title = 'Подмена';
	input.length = 0;
	catalog.items[0].price = 999;
	catalog.getById('one').id = 'Подмена';
	assert.deepEqual(catalog.items, [product()]);
});

test('Изменение payload каталога подписчиком не меняет модель', () => {
	const events = new EventEmitter();
	events.on('catalog:changed', ({ items }) => {
		items[0].price = 999;
	});
	const catalog = new CatalogModel(events);
	catalog.setItems([product()]);
	assert.equal(catalog.getById('one').price, 100);
});

test('Корзина добавляет, проверяет наличие, удаляет и пересчитывает итог', () => {
	const basket = new BasketModel(new EventEmitter());
	assert.equal(basket.add(product('one', 100)), true);
	assert.equal(basket.add(product('two', 250)), true);
	assert.equal(basket.has('one'), true);
	assert.equal(basket.getState().count, 2);
	assert.equal(basket.getState().total, 350);
	assert.equal(basket.remove('one'), true);
	assert.equal(basket.has('one'), false);
	assert.deepEqual(basket.getState(), basketState([product('two', 250)]));
});

test('Повторное добавление по ID не заменяет товар и не публикует изменение', () => {
	const events = new EventEmitter();
	const basket = new BasketModel(events);
	let changes = 0;
	events.on('basket:changed', () => changes++);
	basket.add(product());
	assert.equal(basket.add(product('one', 999)), false);
	assert.equal(basket.getState().total, 100);
	assert.equal(changes, 1);
});

for (const [label, price] of [
	['null', null],
	['undefined', undefined],
	['negative', -1],
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
	['string', '100'],
]) {
	test(`Корзина отклоняет некорректную цену: ${label}`, () => {
		const events = new EventEmitter();
		const basket = new BasketModel(events);
		let changes = 0;
		events.on('basket:changed', () => changes++);
		const item = product();
		item.price = price;
		assert.equal(basket.add(item), false);
		assert.deepEqual(basket.getState(), basketState([]));
		assert.equal(changes, 0);
	});
}

test('Нулевая цена допускается: непустая корзина имеет итог 0', () => {
	const basket = new BasketModel(new EventEmitter());
	assert.equal(basket.add(product('free', 0)), true);
	assert.equal(basket.getState().count, 1);
	assert.equal(basket.getState().total, 0);
});

test('Корзина не допускает переполнения суммы', () => {
	const basket = new BasketModel(new EventEmitter());
	assert.equal(basket.add(product('one', Number.MAX_VALUE)), true);
	assert.equal(basket.add(product('two', Number.MAX_VALUE)), false);
	assert.equal(basket.getState().count, 1);
});

test('Удаление отсутствующего ID и повторная очистка не публикуют события', () => {
	const events = new EventEmitter();
	const states = [];
	events.on('basket:changed', (state) => states.push(state));
	const basket = new BasketModel(events);
	basket.clear();
	assert.equal(basket.remove('missing'), false);
	basket.add(product());
	basket.clear();
	basket.clear();
	assert.deepEqual(
		states.map(({ count, total }) => [count, total]),
		[
			[1, 100],
			[0, 0],
		]
	);
});

test('Корзина копирует вход и выход, старый снимок не меняется', () => {
	const basket = new BasketModel(new EventEmitter());
	const input = product();
	basket.add(input);
	input.price = 999;
	const snapshot = basket.getState();
	basket.add(product('two'));
	assert.equal(snapshot.count, 1);
	assert.equal(snapshot.items.length, 1);
	snapshot.items[0].price = 777;
	snapshot.items.length = 0;
	assert.equal(basket.getState().total, 200);
});

test('Изменение payload корзины подписчиком не меняет модель', () => {
	const events = new EventEmitter();
	events.on('basket:changed', (state) => {
		state.items.length = 0;
		state.total = 999;
	});
	const basket = new BasketModel(events);
	basket.add(product());
	assert.deepEqual(basket.getState(), basketState([product()]));
});

test('Пустой заказ возвращает ошибки обоих шагов', () => {
	const order = new OrderModel(new EventEmitter());
	const validation = order.validate();
	assert.equal(validation.order.valid, false);
	assert.equal(validation.contacts.valid, false);
	assert.deepEqual(Object.keys(validation.order.errors).sort(), [
		'address',
		'payment',
	]);
	assert.deepEqual(Object.keys(validation.contacts.errors).sort(), [
		'email',
		'phone',
	]);
});

test('Пробельные поля не проходят валидацию', () => {
	const order = new OrderModel(new EventEmitter());
	order.setField('payment', 'card');
	for (const field of ['address', 'email', 'phone'])
		order.setField(field, ' \n\t ');
	assert.equal(order.validate().order.valid, false);
	assert.equal(order.validate().contacts.valid, false);
});

test('Шаги валидируются независимо; нет лишней проверки формата контактов', () => {
	const order = new OrderModel(new EventEmitter());
	order.setField('payment', 'cash');
	order.setField('address', 'A');
	assert.equal(order.validate().order.valid, true);
	assert.equal(order.validate().contacts.valid, false);
	order.setField('email', 'x');
	assert.equal(order.validate().contacts.errors.email, undefined);
	assert.ok(order.validate().contacts.errors.phone);
	order.setField('phone', 'y');
	assert.equal(order.validate().contacts.valid, true);
});

test('Отмена выбора оплаты снова делает первый шаг невалидным', () => {
	const order = validOrder();
	order.setField('payment', null);
	assert.equal(order.validate().order.valid, false);
});

test('Изменение поля публикует черновик и валидацию только один раз', () => {
	const events = new EventEmitter();
	const changes = [];
	events.on('order:changed', (data) => changes.push(data));
	const order = new OrderModel(events);
	order.setField('address', 'A');
	order.setField('address', 'A');
	assert.equal(changes.length, 1);
	assert.equal(changes[0].draft.address, 'A');
	assert.ok(changes[0].validation.order.errors.payment);
});

test('Неверное значение поля отклоняется без изменения черновика', () => {
	const order = validOrder();
	const before = order.draft;
	assert.throws(() => order.setField('payment', 'unknown'));
	assert.throws(() => order.setField('address', null));
	assert.deepEqual(order.draft, before);
});

test('Черновик и payload заказа не дают изменить приватное состояние', () => {
	const events = new EventEmitter();
	events.on('order:changed', ({ draft, validation }) => {
		draft.address = 'Подмена';
		validation.order.valid = true;
	});
	const order = new OrderModel(events);
	order.setField('address', 'A');
	order.draft.email = 'Подмена';
	assert.equal(order.draft.address, 'A');
	assert.equal(order.draft.email, '');
	assert.equal(order.validate().order.valid, false);
});

for (const payment of ['card', 'cash']) {
	test(`Создание заказа (${payment}): ID, сумма, trim; данные не очищаются`, () => {
		const order = validOrder(new EventEmitter(), payment);
		const basket = new BasketModel(new EventEmitter());
		basket.add(product('one', 100));
		basket.add(product('two', 0));
		assert.deepEqual(order.createOrder(basket.getState()), {
			payment,
			address: 'Адрес',
			email: 'почта',
			phone: 'телефон',
			items: ['one', 'two'],
			total: 100,
		});
		assert.equal(order.draft.address, '  Адрес  ');
		assert.equal(basket.getState().count, 2);
	});
}

test('Заказ из одного бесплатного товара корректен', () => {
	assert.equal(
		validOrder().createOrder(basketState([product('free', 0)])).total,
		0
	);
});

test('Невалидный черновик и пустая корзина не создают заказ и не теряют данные', () => {
	const empty = new OrderModel(new EventEmitter());
	assert.throws(() => empty.createOrder(basketState([product()])));
	const order = validOrder();
	const before = order.draft;
	assert.throws(() => order.createOrder(basketState([])));
	assert.deepEqual(order.draft, before);
});

for (const [label, state] of [
	['повторный ID', basketState([product(), product()])],
	['отсутствующая цена', { items: [product('one', null)], count: 1, total: 0 }],
	['отрицательная цена', basketState([product('one', -1)])],
	['NaN', basketState([product('one', NaN)])],
	['Infinity', basketState([product('one', Infinity)])],
	['неверная сумма', { ...basketState([product()]), total: 999 }],
	['неверное количество', { ...basketState([product()]), count: 2 }],
	[
		'переполнение суммы',
		basketState([
			product('one', Number.MAX_VALUE),
			product('two', Number.MAX_VALUE),
		]),
	],
]) {
	test(`Создание заказа отклоняет некорректную корзину: ${label}`, () => {
		assert.throws(() => validOrder().createOrder(state));
	});
}

test('Снимок созданного заказа независим от модели и корзины', () => {
	const model = validOrder();
	const state = basketState([product()]);
	const order = model.createOrder(state);
	state.items[0].id = 'Подмена';
	model.clear();
	assert.deepEqual(order.items, ['one']);
	assert.equal(order.address, 'Адрес');
	assert.deepEqual(model.draft, emptyDraft);
});

test('Очистка заказа сбрасывает все поля и публикует невалидные формы', () => {
	const events = new EventEmitter();
	const model = validOrder(events);
	const changes = [];
	events.on('order:changed', (data) => changes.push(data));
	model.clear();
	model.clear();
	assert.equal(changes.length, 1);
	assert.deepEqual(changes[0].draft, emptyDraft);
	assert.equal(changes[0].validation.order.valid, false);
	assert.equal(changes[0].validation.contacts.valid, false);
});

test('Интеграция трёх моделей с одним существующим EventEmitter', () => {
	const events = new EventEmitter();
	const catalog = new CatalogModel(events);
	const basket = new BasketModel(events);
	const order = validOrder(events);
	const observed = [];
	events.onAll(({ eventName }) => observed.push(eventName));
	catalog.setItems([product('one', 100), product('two', null)]);
	basket.add(catalog.getById('one'));
	assert.equal(basket.add(catalog.getById('two')), false);
	assert.equal(order.createOrder(basket.getState()).total, 100);
	assert.deepEqual(observed, ['catalog:changed', 'basket:changed']);
	assert.equal(new BasketModel(events).getState().count, 0);
	assert.deepEqual(new OrderModel(events).draft, emptyDraft);
});
