/* Интеграция с настоящими моделями/View/ShopApi и контролируемым транспортом. */
import { createApp } from '../src/app.js';
import { EventEmitter } from '../src/components/base/events.js';
import { ShopApi } from '../src/services/ShopApi.js';
import { Page } from '../src/components/Page.js';
import { Component } from '../src/components/base/Component.js';

const source = document.body.innerHTML;
const tests = [];
let cleanup = [];
const test = (name, run) => tests.push({ name, run });
const assert = (value, message = 'Условие не выполнено') => {
	if (!value) throw new Error(message);
};
const equal = (actual, expected) =>
	assert(Object.is(actual, expected), `${actual} !== ${expected}`);
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, canonical(item)])
		);
	}
	return value;
}
const deepEqual = (actual, expected) =>
	equal(JSON.stringify(canonical(actual)), JSON.stringify(canonical(expected)));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const q = (root, selector) => {
	const result = root.querySelector(selector);
	assert(result, `Не найден ${selector}`);
	return result;
};
const product = (changes = {}) => ({
	id: 'paid',
	title: 'Тестовый товар',
	description: 'Контролируемое описание',
	category: 'софт-скил',
	image: '/5_Dots.svg',
	price: 100,
	...changes,
});
const products = () => [
	product(),
	product({ id: 'free', price: 0 }),
	product({ id: 'priceless', price: null }),
	product({ id: 'unknown', category: '__proto__' }),
];
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function make(options = {}) {
	const root = document.createElement('section');
	root.innerHTML = source;
	document.body.append(root);
	cleanup.push(() => root.remove());
	const events = new EventEmitter();
	const calls = { gets: [], posts: [] };
	const transport = {
		baseUrl: 'https://controlled.invalid/api/weblarek',
		get(uri) {
			calls.gets.push(uri);
			return options.get
				? options.get()
				: Promise.resolve({ total: 4, items: products() });
		},
		post(uri, body, method) {
			calls.posts.push({ uri, body: JSON.parse(JSON.stringify(body)), method });
			return options.post
				? options.post(body)
				: Promise.resolve({ id: 'controlled-success', total: body.total });
		},
	};
	const app = createApp({
		root,
		events,
		cdnUrl: 'https://larek-api.nomoreparties.co/content/weblarek',
		shopApi: new ShopApi(
			transport,
			'https://larek-api.nomoreparties.co/content/weblarek'
		),
	});
	cleanup.push(() => app.destroy());
	return { root, events, calls, app };
}
const counter = (root) => q(root, '.header__basket-counter').textContent;
const modal = (root) => q(root, '#modal-container');
const openBasket = (root) => q(root, '.header__basket').click();
const close = (root) => q(modal(root), '.modal__close').click();
function add(root, index = 0) {
	root.querySelectorAll('.gallery .card')[index].click();
	q(modal(root), '.card__button').click();
}
function input(root, name, value) {
	const element = q(modal(root), `input[name="${name}"]`);
	element.value = value;
	element.dispatchEvent(new Event('input', { bubbles: true }));
	return element;
}
function submit(root) {
	const form = q(modal(root), 'form');
	const event = new Event('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	assert(event.defaultPrevented);
}
function checkout(root, payment = 'card', index = 0) {
	add(root, index);
	close(root);
	openBasket(root);
	q(modal(root), '.basket__button').click();
	q(modal(root), `[name="${payment}"]`).click();
	input(root, 'address', '  Адрес 1  ');
	submit(root);
	input(root, 'email', '  user@example.test  ');
	input(root, 'phone', '  123  ');
}

test('Bootstrap: каталог автоматически загружается через ShopApi', async () => {
	const { root, app, calls } = make();
	await app.ready;
	equal(calls.gets.length, 1);
	equal(calls.gets[0], '/product/');
	equal(root.querySelectorAll('.gallery .card').length, 4);
	equal(counter(root), '0');
	assert(!modal(root).classList.contains('modal_active'));
	equal(calls.posts.length, 0);
});
test('Категории: известная получает soft, неизвестная — other', async () => {
	const { root, app } = make();
	await app.ready;
	assert(
		root
			.querySelectorAll('.gallery .card__category')[0]
			.classList.contains('card__category_soft')
	);
	assert(
		root
			.querySelectorAll('.gallery .card__category')[3]
			.classList.contains('card__category_other')
	);
});
test('Изображения: путь разрешён относительно существующего CDN', async () => {
	const { root, app } = make();
	await app.ready;
	equal(
		q(root, '.gallery .card__image').src,
		'https://larek-api.nomoreparties.co/content/weblarek/5_Dots.svg'
	);
});
test('CatalogCard → ProductPreview: все поля и блокировка страницы', async () => {
	const { root, app } = make();
	await app.ready;
	q(root, '.gallery .card').click();
	equal(q(modal(root), '.card__text').textContent, 'Контролируемое описание');
	assert(q(root, '.page__wrapper').classList.contains('page__wrapper_locked'));
});
test('Добавление: счётчик и Уже в корзине, дубль по событию исключён', async () => {
	const { root, app, events } = make();
	await app.ready;
	add(root);
	equal(counter(root), '1');
	equal(q(modal(root), '.card__button').textContent, 'Уже в корзине');
	assert(q(modal(root), '.card__button').disabled);
	events.emit('basket:add', { id: 'paid' });
	equal(counter(root), '1');
});
test('Товар без цены: кнопка disabled и событие не обходит модель', async () => {
	const { root, app, events } = make();
	await app.ready;
	root.querySelectorAll('.gallery .card')[2].click();
	equal(q(modal(root), '.card__price').textContent, 'Бесценно');
	assert(q(modal(root), '.card__button').disabled);
	events.emit('basket:add', { id: 'priceless' });
	equal(counter(root), '0');
});
test('Нулевая цена: товар можно оформить и подтвердить с total=0', async () => {
	const { root, app, calls } = make();
	await app.ready;
	checkout(root, 'card', 1);
	submit(root);
	await tick();
	equal(calls.posts[0].body.total, 0);
	equal(
		q(modal(root), '.order-success__description').textContent,
		'Списано 0 синапсов'
	);
});
test('Корзина: список, сумма, удаление и переход в пустое состояние', async () => {
	const { root, app } = make();
	await app.ready;
	add(root);
	close(root);
	add(root, 1);
	close(root);
	openBasket(root);
	equal(q(modal(root), '.modal__title').textContent, 'Корзина (2)');
	equal(q(modal(root), '.basket__price').textContent, '100 синапсов');
	q(modal(root), '.basket__item-delete').click();
	equal(counter(root), '1');
	equal(q(modal(root), '.basket__item-index').textContent, '1');
	equal(q(modal(root), '.basket__price').textContent, '0 синапсов');
	q(modal(root), '.basket__item-delete').click();
	equal(counter(root), '0');
	assert(q(modal(root), '.basket__button').disabled);
	assert(q(modal(root), '.basket__list').textContent.includes('Корзина пуста'));
});
test('Пустая корзина: checkout:start не открывает форму', async () => {
	const { root, app, events } = make();
	await app.ready;
	openBasket(root);
	events.emit('checkout:start', {});
	assert(!modal(root).querySelector('form'));
});
test('Валидация: пробелы в адресе и пустая оплата не дают перейти дальше', async () => {
	const { root, app, events } = make();
	await app.ready;
	add(root);
	close(root);
	openBasket(root);
	q(modal(root), '.basket__button').click();
	input(root, 'address', '   ');
	events.emit('order:next', {});
	equal(q(modal(root), 'form').name, 'order');
	q(modal(root), '[name="card"]').click();
	events.emit('order:next', {});
	equal(q(modal(root), 'form').name, 'order');
	assert(q(modal(root), '[type="submit"]').disabled);
});
test('Ввод: обратный render сохраняет активное поле и курсор', async () => {
	const { root, app } = make();
	await app.ready;
	add(root);
	close(root);
	openBasket(root);
	q(modal(root), '.basket__button').click();
	const control = q(modal(root), '[name="address"]');
	control.focus();
	control.value = '123456';
	control.setSelectionRange(2, 2);
	control.dispatchEvent(new Event('input', { bubbles: true }));
	equal(document.activeElement, control);
	equal(control.selectionStart, 2);
});
test('Контакты: пробельные поля не допускают отправку даже через шину', async () => {
	const { root, app, events, calls } = make();
	await app.ready;
	checkout(root);
	input(root, 'email', ' ');
	events.emit('order:submit', {});
	await tick();
	equal(calls.posts.length, 0);
	equal(q(modal(root), 'form').name, 'contacts');
});
test('Полный успех: online DTO, подтверждение, очистка, Success', async () => {
	const { root, app, calls } = make();
	await app.ready;
	checkout(root);
	submit(root);
	await tick();
	deepEqual(calls.posts, [
		{
			uri: '/order',
			body: {
				payment: 'online',
				address: 'Адрес 1',
				email: 'user@example.test',
				phone: '123',
				items: ['paid'],
				total: 100,
			},
			method: 'POST',
		},
	]);
	equal(counter(root), '0');
	assert(modal(root).querySelector('.order-success'));
	q(modal(root), '.order-success__close').click();
	assert(!modal(root).classList.contains('modal_active'));
	add(root);
	close(root);
	openBasket(root);
	q(modal(root), '.basket__button').click();
	equal(q(modal(root), '[name="address"]').value, '');
	assert(!modal(root).querySelector('.button_alt-active'));
});
test('До подтверждения: корзина и данные сохранены, успех не показан', async () => {
	const response = deferred();
	const { root, app } = make({ post: () => response.promise });
	await app.ready;
	checkout(root);
	submit(root);
	equal(counter(root), '1');
	assert(!modal(root).querySelector('.order-success'));
	equal(q(modal(root), '[name="email"]').value, '  user@example.test  ');
	response.resolve({ id: 'test', total: 100 });
	await tick();
});
test('Pending: два submit создают только один запрос', async () => {
	const response = deferred();
	const { root, app, calls, events } = make({ post: () => response.promise });
	await app.ready;
	checkout(root);
	submit(root);
	events.emit('order:submit', {});
	events.emit('order:submit', {});
	equal(calls.posts.length, 1);
	for (const control of modal(root).querySelectorAll(
		'input,button[type="submit"]'
	))
		assert(control.disabled);
	response.resolve({ id: 'test', total: 100 });
	await tick();
});
test('Pending: события изменения/удаления/навигации игнорируются', async () => {
	const response = deferred();
	const { root, app, events, calls } = make({ post: () => response.promise });
	await app.ready;
	checkout(root);
	submit(root);
	for (const [name, payload] of [
		['basket:remove', { id: 'paid' }],
		['basket:open', {}],
		['product:open', { id: 'free' }],
		['contacts:change', { field: 'email', value: 'lost' }],
		['order:change', { field: 'address', value: 'lost' }],
		['checkout:start', {}],
	])
		events.emit(name, payload);
	equal(counter(root), '1');
	equal(q(modal(root), 'form').name, 'contacts');
	equal(calls.posts[0].body.email, 'user@example.test');
	response.reject(new TypeError('controlled failure'));
	await tick();
});
test('Ошибка HTTP: данные сохранены, кнопка разблокирована, ручной повтор успешен', async () => {
	let failed = true;
	const { root, app, calls } = make({
		post: (body) =>
			failed
				? Promise.reject('HTTP 500 controlled')
				: Promise.resolve({ id: 'retry', total: body.total }),
	});
	await app.ready;
	checkout(root);
	submit(root);
	await tick();
	equal(counter(root), '1');
	equal(calls.posts.length, 1);
	equal(q(modal(root), '[name="email"]').value, '  user@example.test  ');
	assert(
		q(modal(root), '.form__errors').textContent.includes('Данные сохранены')
	);
	assert(!q(modal(root), '[type="submit"]').disabled);
	failed = false;
	submit(root);
	await tick();
	equal(calls.posts.length, 2);
	equal(counter(root), '0');
});
test('Сетевая ошибка POST: нет очистки и автоматического повторения', async () => {
	const { root, app, calls } = make({
		post: () => Promise.reject(new TypeError('network detail secret')),
	});
	await app.ready;
	checkout(root);
	submit(root);
	await tick();
	await tick();
	equal(calls.posts.length, 1);
	equal(counter(root), '1');
	assert(!q(modal(root), '.form__errors').textContent.includes('secret'));
});
test('Неправильное подтверждение сервера не очищает корзину', async () => {
	const { root, app } = make({
		post: () => Promise.resolve({ id: 'bad', total: 999 }),
	});
	await app.ready;
	checkout(root);
	submit(root);
	await tick();
	equal(counter(root), '1');
	assert(!modal(root).querySelector('.order-success'));
});
test('cash: отказ до HTTP, нет ложного успеха и потери данных', async () => {
	const { root, app, calls } = make();
	await app.ready;
	checkout(root, 'cash');
	submit(root);
	await tick();
	equal(calls.posts.length, 0);
	equal(counter(root), '1');
	assert(
		q(modal(root), '.form__errors').textContent.includes('не подтверждён')
	);
});
test('Закрытие во время POST: успех очищает данные, но не открывает окно', async () => {
	const response = deferred();
	const { root, app } = make({ post: () => response.promise });
	await app.ready;
	checkout(root);
	submit(root);
	close(root);
	response.resolve({ id: 'test', total: 100 });
	await tick();
	equal(counter(root), '0');
	assert(!modal(root).classList.contains('modal_active'));
	assert(!q(root, '.page__wrapper').classList.contains('page__wrapper_locked'));
});
test('Закрытие во время POST: ошибка сохранена и доступна при новом открытии', async () => {
	const response = deferred();
	const { root, app } = make({ post: () => response.promise });
	await app.ready;
	checkout(root);
	submit(root);
	close(root);
	response.reject(new TypeError('network'));
	await tick();
	equal(counter(root), '1');
	assert(!modal(root).classList.contains('modal_active'));
	openBasket(root);
	q(modal(root), '.basket__button').click();
	equal(q(modal(root), '[name="address"]').value, '  Адрес 1  ');
	submit(root);
	equal(q(modal(root), '[name="email"]').value, '  user@example.test  ');
});
test('Modal: внутренний клик не закрывает, overlay и крестик разблокируют страницу', async () => {
	const { root, app } = make();
	await app.ready;
	q(root, '.gallery .card').click();
	q(modal(root), '.card__text').click();
	assert(modal(root).classList.contains('modal_active'));
	modal(root).click();
	assert(!modal(root).classList.contains('modal_active'));
	openBasket(root);
	close(root);
	assert(!q(root, '.page__wrapper').classList.contains('page__wrapper_locked'));
});
test('Повторное открытие и ввод: один клик даёт одно добавление', async () => {
	const { root, app } = make();
	await app.ready;
	for (let i = 0; i < 50; i++) {
		q(root, '.gallery .card').click();
		close(root);
	}
	add(root);
	equal(counter(root), '1');
});
test('GET: параллельные повторы не создают дополнительных запросов', async () => {
	const response = deferred();
	const { root, app, calls, events } = make({ get: () => response.promise });
	app.reloadCatalog();
	events.emit('catalog:retry', {});
	equal(calls.gets.length, 1);
	assert(q(root, '.page__status').textContent.includes('Загрузка'));
	response.resolve({ total: 4, items: products() });
	await app.ready;
	equal(root.querySelectorAll('.gallery .card').length, 4);
});
test('GET: ошибка, кнопка повторения и успешная загрузка без дублей', async () => {
	let failed = true;
	const { root, app, calls } = make({
		get: () =>
			failed
				? Promise.reject(new TypeError('secret'))
				: Promise.resolve({ total: 4, items: products() }),
	});
	await app.ready;
	assert(!q(root, '.page__retry').hidden);
	assert(!q(root, '.page__status').textContent.includes('secret'));
	failed = false;
	q(root, '.page__retry').click();
	await tick();
	equal(calls.gets.length, 2);
	equal(root.querySelectorAll('.gallery .card').length, 4);
	assert(q(root, '.page__retry').hidden);
});
test('GET: пустой список отображается отдельно от ошибки', async () => {
	const { root, app } = make({
		get: () => Promise.resolve({ total: 0, items: [] }),
	});
	await app.ready;
	equal(q(root, '.page__status').textContent, 'Товаров пока нет.');
	assert(q(root, '.page__retry').hidden);
});
test('GET: некорректные данные не попадают в каталог', async () => {
	const { root, app } = make({
		get: () => Promise.resolve({ total: 1, items: [{ id: 'bad' }] }),
	});
	await app.ready;
	equal(root.querySelectorAll('.gallery .card').length, 0);
	assert(!q(root, '.page__retry').hidden);
});
test('Повторный каталог уничтожает старые карточки и не теряет корзину', async () => {
	const { root, app, events } = make();
	await app.ready;
	const oldCard = q(root, '.gallery .card');
	add(root);
	close(root);
	let emitted = 0;
	const handler = () => emitted++;
	events.on('product:open', handler);
	cleanup.push(() => events.off('product:open', handler));
	await app.reloadCatalog();
	oldCard.click();
	equal(emitted, 0);
	equal(counter(root), '1');
	q(root, '.gallery .card').click();
	equal(emitted, 1);
});
test('События вне своего экрана не начинают заказ или добавление', async () => {
	const { root, app, events, calls } = make();
	await app.ready;
	events.emit('basket:add', { id: 'paid' });
	events.emit('order:submit', {});
	events.emit('order:next', {});
	equal(counter(root), '0');
	equal(calls.posts.length, 0);
	assert(!modal(root).classList.contains('modal_active'));
});
test('destroy: точные подписки сняты, внешние подписчики сохранены', async () => {
	const { root, app, events, calls } = make();
	await app.ready;
	const external = () => undefined;
	events.on('external', external);
	app.destroy();
	app.destroy();
	equal(events._events.size, 1);
	assert(events._events.has('external'));
	q(root, '.gallery .card').click();
	openBasket(root);
	await app.reloadCatalog();
	equal(calls.gets.length, 1);
	assert(!modal(root).classList.contains('modal_active'));
	events.off('external', external);
});
test('destroy: исключение внешнего modal:closed не оставляет Page заблокированным', async () => {
	const { root, app, events } = make();
	await app.ready;
	add(root);
	close(root);
	openBasket(root);
	const oldCard = q(root, '.gallery .card');
	const retry = q(root, '.page__retry');
	const failure = new Error('Внешний подписчик modal:closed');
	let shouldThrow = true;
	let closed = 0;
	const external = () => {
		closed++;
		if (shouldThrow) throw failure;
	};
	const emitted = [];
	const observer = ({ eventName }) => emitted.push(eventName);
	events.on('modal:closed', external);
	events.onAll(observer);
	cleanup.push(() => {
		events.off('modal:closed', external);
		events.off('*', observer);
	});
	let caught;
	try {
		app.destroy();
	} catch (error) {
		caught = error;
	}
	equal(caught, failure);
	assert(!q(root, '.page__wrapper').classList.contains('page__wrapper_locked'));
	assert(!modal(root).classList.contains('modal_active'));
	assert(!root.contains(retry));
	assert(events._events.get('modal:closed').has(external));
	assert(events._events.get('*').has(observer));
	equal(events._events.size, 2);
	emitted.length = 0;
	app.destroy();
	oldCard.click();
	openBasket(root);
	retry.click();
	deepEqual(emitted, []);
	equal(closed, 1);

	shouldThrow = false;
	const second = createApp({
		root,
		events,
		cdnUrl: 'https://cdn.example.test',
		shopApi: {
			getProducts: async () => ({ total: 4, items: products() }),
			submitOrder: async () => ({ total: 100 }),
		},
	});
	cleanup.push(() => second.destroy());
	await second.ready;
	equal(root.querySelectorAll('.page__retry').length, 1);
	emitted.length = 0;
	add(root);
	equal(counter(root), '1');
	equal(emitted.filter((name) => name === 'product:open').length, 1);
	equal(emitted.filter((name) => name === 'basket:add').length, 1);
	close(root);
	equal(closed, 2);
});
test('destroy: все собственные View очищаются, первая ошибка сохраняется', async () => {
	const { root, app, events } = make();
	await app.ready;
	add(root);
	const first = new Error('Ошибка первой карточки');
	const second = new Error('Ошибка modal:closed');
	const external = () => {
		throw second;
	};
	events.on('modal:closed', external);
	cleanup.push(() => events.off('modal:closed', external));
	const original = Component.prototype.destroy;
	const destroyed = [];
	Component.prototype.destroy = function () {
		destroyed.push(this.constructor.name);
		original.call(this);
		if (destroyed.length === 1) throw first;
	};
	let caught;
	try {
		app.destroy();
	} catch (error) {
		caught = error;
	} finally {
		Component.prototype.destroy = original;
	}
	equal(caught, first);
	deepEqual(destroyed, [
		...Array(4).fill('CatalogCard'),
		'BasketItem',
		'ProductPreview',
		'Basket',
		'OrderForm',
		'ContactsForm',
		'Success',
		'Modal',
		'Page',
	]);
	app.destroy();
	equal(destroyed.length, 12);
});
test('destroy: даже throw undefined передаётся после освобождения Page', async () => {
	const { root, app, events } = make();
	await app.ready;
	openBasket(root);
	const external = () => {
		throw undefined;
	};
	events.on('modal:closed', external);
	cleanup.push(() => events.off('modal:closed', external));
	let thrown = false;
	try {
		app.destroy();
	} catch (error) {
		thrown = true;
		equal(error, undefined);
	}
	assert(thrown);
	assert(!q(root, '.page__wrapper').classList.contains('page__wrapper_locked'));
	assert(!root.querySelector('.page__retry'));
	app.destroy();
});
test('destroy во время GET: поздний ответ не обновляет модель/DOM', async () => {
	const response = deferred();
	const { root, app, events } = make({ get: () => response.promise });
	let changes = 0;
	events.on('catalog:changed', () => changes++);
	app.destroy();
	response.resolve({ total: 4, items: products() });
	await app.ready;
	equal(changes, 0);
	equal(root.querySelectorAll('.gallery .card').length, 0);
});
test('destroy во время POST: поздний ответ не открывает окно и не шлёт изменения', async () => {
	const response = deferred();
	const { root, app, events } = make({ post: () => response.promise });
	await app.ready;
	checkout(root);
	submit(root);
	app.destroy();
	let changes = 0;
	events.on('basket:changed', () => changes++);
	response.resolve({ id: 'test', total: 100 });
	await tick();
	equal(changes, 0);
	assert(!modal(root).classList.contains('modal_active'));
});
test('Page: retry скрыт по умолчанию, disabled защищён и destroy удаляет кнопку', () => {
	const root = document.createElement('section');
	root.innerHTML = source;
	document.body.append(root);
	cleanup.push(() => root.remove());
	const events = new EventEmitter();
	const page = new Page(root, events);
	cleanup.push(() => page.destroy());
	const retry = q(root, '.page__retry');
	let count = 0;
	events.on('catalog:retry', () => count++);
	retry.dispatchEvent(new MouseEvent('click'));
	equal(count, 0);
	page.setCatalogRetry(true, true);
	retry.dispatchEvent(new MouseEvent('click'));
	equal(count, 0);
	page.setCatalogRetry(true, false);
	retry.click();
	equal(count, 1);
	page.destroy();
	retry.click();
	equal(count, 1);
	assert(!root.contains(retry));
});
test('Page: пересоздание не оставляет две кнопки повторения', () => {
	const root = document.createElement('section');
	root.innerHTML = source;
	const events = new EventEmitter();
	const first = new Page(root, events);
	first.destroy();
	const second = new Page(root, events);
	equal(root.querySelectorAll('.page__retry').length, 1);
	second.destroy();
});
test('Повторная сборка приложения на том же DOM после destroy', async () => {
	const { root, app, events } = make();
	await app.ready;
	app.destroy();
	const second = createApp({
		root,
		events,
		cdnUrl: 'https://cdn.example.test',
		shopApi: {
			getProducts: async () => ({ total: 4, items: products() }),
			submitOrder: async () => ({ total: 100 }),
		},
	});
	cleanup.push(() => second.destroy());
	await second.ready;
	equal(root.querySelectorAll('.page__retry').length, 1);
	add(root);
	equal(counter(root), '1');
});
test('Экран успеха закрывается без второй очистки моделей', async () => {
	const { root, app, events } = make();
	await app.ready;
	checkout(root);
	submit(root);
	await tick();
	let changes = 0;
	events.on('order:changed', () => changes++);
	q(modal(root), '.order-success__close').click();
	equal(changes, 0);
});

(async () => {
	const results = [];
	for (const { name, run } of tests) {
		cleanup = [];
		let error;
		try {
			await run();
		} catch (caught) {
			error = String(caught.stack || caught);
		} finally {
			for (const dispose of cleanup.reverse()) {
				try {
					dispose();
				} catch (caught) {
					error = error || String(caught);
				}
			}
		}
		results.push({ name, passed: !error, ...(error ? { error } : {}) });
	}
	const report = {
		passed: results.filter((r) => r.passed).length,
		failed: results.filter((r) => !r.passed).length,
		results,
	};
	const summary = document.createElement('p');
	summary.id = 'ui-test-summary';
	summary.textContent = `AppPresenter: ${report.passed}/${results.length}; ошибок: ${report.failed}. Только контролируемый API.`;
	const output = document.createElement('pre');
	output.id = 'ui-test-results';
	output.textContent = JSON.stringify(report, null, 2);
	document.body.prepend(summary, output);
	window.__uiTestReport = report;
	if (/^https?:$/.test(location.protocol))
		await fetch('/__ui_results', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(report),
		});
})().catch((error) => {
	document.body.dataset.uiFatalError = String(error);
	console.error(error);
});
