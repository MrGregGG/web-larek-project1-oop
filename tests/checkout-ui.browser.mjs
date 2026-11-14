/* Контролируемые DOM-проверки этапа 5. Ни одного HTTP-заказа. */
import { Basket } from '../src/components/Basket.js';
import { BasketItem } from '../src/components/BasketItem.js';
import { Form } from '../src/components/base/Form.js';
import { OrderForm } from '../src/components/OrderForm.js';
import { ContactsForm } from '../src/components/ContactsForm.js';
import { Success } from '../src/components/Success.js';
import { Modal } from '../src/components/Modal.js';
import { EventEmitter } from '../src/components/base/events.js';
import { BasketModel } from '../src/models/BasketModel.js';
import { OrderModel } from '../src/models/OrderModel.js';
import { cloneTemplate } from '../src/utils/utils.js';

const tests = [];
let cleanup = [];
const test = (name, run) => tests.push({ name, run });
const assert = (condition, message = 'Условие не выполнено') => {
	if (!condition) throw new Error(message);
};
const equal = (actual, expected) =>
	assert(Object.is(actual, expected), `${actual} !== ${expected}`);
const deepEqual = (actual, expected) =>
	equal(JSON.stringify(actual), JSON.stringify(expected));
function throws(run) {
	let thrown = false;
	try {
		run();
	} catch {
		thrown = true;
	}
	assert(thrown, 'Ожидалось исключение');
}
function own(view) {
	cleanup.push(() => view.destroy());
	return view;
}
function mount(root) {
	document.body.append(root);
	cleanup.push(() => root.remove());
	return root;
}
function make(View, template, events = new EventEmitter()) {
	const root = mount(cloneTemplate(template));
	return { root, events, view: own(new View(root, events)) };
}
function observe(events, name) {
	const values = [];
	const handler = (data) => values.push(data);
	events.on(name, handler);
	cleanup.push(() => events.off(name, handler));
	return values;
}
function listen(events, name, handler) {
	events.on(name, handler);
	cleanup.push(() => events.off(name, handler));
}
const select = (root, selector) => {
	const node = root.querySelector(selector);
	assert(node, `Нет элемента ${selector}`);
	return node;
};
const click = (element) => element.click();
const forcedClick = (element) => {
	const event = new MouseEvent('click', { bubbles: true, cancelable: true });
	// После destroy снят и preventDefault: тест не должен отправлять HTML-форму.
	event.preventDefault();
	return element.dispatchEvent(event);
};
function input(root, name, value) {
	const element = select(root, `input[name="${name}"]`);
	element.value = value;
	element.dispatchEvent(new Event('input', { bubbles: true }));
	return element;
}
function submit(root) {
	const event = new Event('submit', { bubbles: true, cancelable: true });
	root.dispatchEvent(event);
	return event;
}
const itemData = (changes = {}) => ({
	id: 'one',
	title: 'Тестовая позиция',
	price: 750,
	index: 1,
	disabled: false,
	...changes,
});
const basketData = (changes = {}) => ({
	items: [],
	total: 0,
	checkoutDisabled: false,
	...changes,
});
const orderData = (changes = {}) => ({
	values: { payment: null, address: '' },
	validation: {
		valid: false,
		errors: { payment: 'Выберите оплату.', address: 'Адрес обязателен.' },
	},
	disabled: false,
	serverError: '',
	...changes,
});
const contactsData = (changes = {}) => ({
	values: { email: '', phone: '' },
	validation: {
		valid: false,
		errors: { email: 'Укажите email.', phone: 'Укажите телефон.' },
	},
	disabled: false,
	serverError: '',
	...changes,
});
const valid = { valid: true, errors: {} };
const sourceModal = document.querySelector('#modal-container').cloneNode(true);
function makeModal(events) {
	const root = mount(sourceModal.cloneNode(true));
	root.removeAttribute('id');
	return { root, view: own(new Modal(root, events)) };
}
function makeItem(events) {
	const result = make(BasketItem, '#card-basket', events);
	result.view.render(itemData());
	return result;
}

test('Basket: исходный шаблон, render возвращает контейнер', () => {
	const { view, root } = make(Basket, '#basket');
	equal(view.render(basketData()), root);
	assert(select(root, '.basket__list').tagName === 'UL');
});
test('Basket: отображает переданные DOM-позиции в исходном порядке', () => {
	const { view, root, events } = make(Basket, '#basket');
	const first = makeItem(events).root;
	const second = makeItem(events).root;
	view.render(basketData({ items: [first, second], total: 1500 }));
	deepEqual(Array.from(select(root, '.basket__list').children), [
		first,
		second,
	]);
	equal(select(root, '.basket__list').firstElementChild, first);
	equal(select(root, '.basket__list').lastElementChild, second);
});
test('Basket: количество отображается по числу переданных позиций', () => {
	const { view, root, events } = make(Basket, '#basket');
	view.render(
		basketData({ items: [makeItem(events).root, makeItem(events).root] })
	);
	equal(select(root, '.modal__title').textContent, 'Корзина (2)');
	view.render(basketData({ items: [makeItem(events).root] }));
	equal(select(root, '.modal__title').textContent, 'Корзина (1)');
});
test('Basket: показывает переданную сумму и не пересчитывает товары', () => {
	const { view, root, events } = make(Basket, '#basket');
	view.render(basketData({ items: [makeItem(events).root], total: 321 }));
	equal(select(root, '.basket__price').textContent, '321 синапсов');
	view.render(basketData({ total: 0 }));
	equal(select(root, '.basket__price').textContent, '0 синапсов');
});
test('Basket: понятное пустое состояние и количество 0', () => {
	const { view, root } = make(Basket, '#basket');
	view.render(basketData());
	equal(select(root, '.basket__list').textContent, 'Корзина пуста');
	equal(select(root, '.modal__title').textContent, 'Корзина (0)');
	assert(select(root, '.basket__button').disabled);
});
test('Basket: пустая корзина не отправляет checkout:start даже при forced click', () => {
	const { view, root, events } = make(Basket, '#basket');
	const signals = observe(events, 'checkout:start');
	view.render(basketData({ checkoutDisabled: false }));
	forcedClick(select(root, '.basket__button'));
	equal(signals.length, 0);
});
test('Basket: pending блокирует оформление непустого списка', () => {
	const { view, root, events } = make(Basket, '#basket');
	const signals = observe(events, 'checkout:start');
	view.render(
		basketData({ items: [makeItem(events).root], checkoutDisabled: true })
	);
	forcedClick(select(root, '.basket__button'));
	equal(signals.length, 0);
});
test('Basket: оформление доступно для бесплатного товара', () => {
	const { view, root, events } = make(Basket, '#basket');
	const signals = observe(events, 'checkout:start');
	const item = makeItem(events);
	item.view.render(itemData({ price: 0 }));
	view.render(basketData({ items: [item.root], total: 0 }));
	click(select(root, '.basket__button'));
	deepEqual(signals, [{}]);
});
test('Basket: 200 render не дублируют узлы или checkout:start', () => {
	const { view, root, events } = make(Basket, '#basket');
	const signals = observe(events, 'checkout:start');
	const item = makeItem(events).root;
	for (let i = 0; i < 200; i++) view.render(basketData({ items: [item] }));
	equal(select(root, '.basket__list').children.length, 1);
	click(select(root, '.basket__button'));
	equal(signals.length, 1);
});
test('Basket: переход заполненная/пустая/заполненная без старых позиций', () => {
	const { view, root, events } = make(Basket, '#basket');
	const first = makeItem(events).root;
	const second = makeItem(events).root;
	view.render(basketData({ items: [first] }));
	view.render(basketData());
	assert(!root.contains(first));
	view.render(basketData({ items: [second] }));
	equal(select(root, '.basket__list').children.length, 1);
	assert(!root.textContent.includes('Корзина пуста'));
});
test('Basket: замена списка не уничтожает чужую View', () => {
	const { view, events } = make(Basket, '#basket');
	const item = makeItem(events);
	const signals = observe(events, 'basket:remove');
	view.render(basketData({ items: [item.root] }));
	view.render(basketData());
	item.view.render(itemData({ id: 'reused' }));
	click(select(item.root, '.basket__item-delete'));
	deepEqual(signals, [{ id: 'reused' }]);
});
test('BasketItem: номер, название, цена; render возвращает li', () => {
	const { view, root } = make(BasketItem, '#card-basket');
	equal(view.render(itemData({ index: 3 })), root);
	equal(root.tagName, 'LI');
	equal(select(root, '.basket__item-index').textContent, '3');
	equal(select(root, '.card__title').textContent, 'Тестовая позиция');
	equal(select(root, '.card__price').textContent, '750 синапсов');
});
test('BasketItem: цена 0 отображается числом', () => {
	const { view, root } = makeItem();
	view.render(itemData({ price: 0 }));
	equal(select(root, '.card__price').textContent, '0 синапсов');
});
test('BasketItem: название вставляется безопасным текстом', () => {
	const { view, root } = makeItem();
	view.render(itemData({ title: '<img src=x onerror=alert(1)>' }));
	equal(
		select(root, '.card__title').textContent,
		'<img src=x onerror=alert(1)>'
	);
	equal(root.querySelectorAll('img').length, 0);
});
test('BasketItem: удаление сообщает ID и не удаляет DOM самостоятельно', () => {
	const { root, events } = makeItem();
	const signals = observe(events, 'basket:remove');
	click(select(root, '.basket__item-delete'));
	deepEqual(signals, [{ id: 'one' }]);
	assert(root.isConnected);
});
test('BasketItem: после 200 render удаление использует последний ID', () => {
	const { view, root, events } = makeItem();
	const signals = observe(events, 'basket:remove');
	for (let i = 0; i < 200; i++)
		view.render(itemData({ id: `item-${i}`, index: i + 1 }));
	click(select(root, '.basket__item-delete'));
	deepEqual(signals, [{ id: 'item-199' }]);
	equal(select(root, '.basket__item-index').textContent, '200');
});
test('BasketItem: disabled запрещает удаление, в том числе forced click', () => {
	const { view, root, events } = makeItem();
	const signals = observe(events, 'basket:remove');
	view.render(itemData({ disabled: true }));
	forcedClick(select(root, '.basket__item-delete'));
	equal(signals.length, 0);
	view.render(itemData());
	click(select(root, '.basket__item-delete'));
	equal(signals.length, 1);
});

for (const [name, View, template, data, changeEvent, submitEvent, field] of [
	[
		'OrderForm',
		OrderForm,
		'#order',
		orderData,
		'order:change',
		'order:next',
		'address',
	],
	[
		'ContactsForm',
		ContactsForm,
		'#contacts',
		contactsData,
		'contacts:change',
		'order:submit',
		'email',
	],
]) {
	test(`${name}: наследует общий Form, возвращает исходный form`, () => {
		const { view, root } = make(View, template);
		assert(view instanceof Form);
		equal(view.render(data()), root);
		equal(root.tagName, 'FORM');
	});
	test(`${name}: ввод передаётся точно, без trim/самостоятельной валидации`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, changeEvent);
		view.render(data());
		input(root, field, '  введённое значение  ');
		deepEqual(signals, [{ field, value: '  введённое значение  ' }]);
	});
	test(`${name}: неизвестное имя input игнорируется`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, changeEvent);
		view.render(data());
		const alien = document.createElement('input');
		alien.name = field;
		root.append(alien);
		alien.dispatchEvent(new Event('input', { bubbles: true }));
		alien.name = 'unknown';
		alien.dispatchEvent(new Event('input', { bubbles: true }));
		equal(signals.length, 0);
	});
	test(`${name}: invalid блокирует submit и предотвращает навигацию`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, submitEvent);
		view.render(data());
		assert(select(root, '[type="submit"]').disabled);
		assert(submit(root).defaultPrevented);
		equal(signals.length, 0);
	});
	test(`${name}: валидный submit отправляет одно намерение с пустым payload`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, submitEvent);
		view.render(data({ validation: valid }));
		assert(submit(root).defaultPrevented);
		deepEqual(signals, [{}]);
	});
	test(`${name}: pending блокирует поля и submit при valid`, () => {
		const { view, root, events } = make(View, template);
		const changes = observe(events, changeEvent);
		const submits = observe(events, submitEvent);
		view.render(data({ validation: valid, disabled: true }));
		for (const element of root.querySelectorAll('input, button'))
			assert(element.disabled);
		input(root, field, 'forced input');
		assert(submit(root).defaultPrevented);
		equal(changes.length, 0);
		equal(submits.length, 0);
	});
	test(`${name}: снятие pending восстанавливает ввод и submit`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, submitEvent);
		view.render(data({ validation: valid, disabled: true }));
		view.render(data({ validation: valid }));
		for (const element of root.querySelectorAll('input, button'))
			assert(!element.disabled);
		submit(root);
		equal(signals.length, 1);
	});
	test(`${name}: ошибки полей и сервера отображаются безопасным текстом`, () => {
		const { view, root } = make(View, template);
		view.render(data({ serverError: '<img src=x> Сервер недоступен.' }));
		const errors = select(root, '.form__errors');
		assert(errors.textContent.includes('<img src=x> Сервер недоступен.'));
		assert(
			errors.textContent.includes(Object.values(data().validation.errors)[0])
		);
		equal(errors.querySelectorAll('img').length, 0);
		equal(errors.getAttribute('role'), 'alert');
		equal(
			select(root, `input[name="${field}"]`).getAttribute('aria-invalid'),
			'true'
		);
	});
	test(`${name}: новые данные удаляют прежние ошибки и aria-invalid`, () => {
		const { view, root } = make(View, template);
		view.render(data({ serverError: 'Старая ошибка.' }));
		view.render(data({ validation: valid }));
		equal(select(root, '.form__errors').textContent, '');
		equal(
			select(root, `input[name="${field}"]`).getAttribute('aria-invalid'),
			'false'
		);
	});
	test(`${name}: render не генерирует события и не меняет входные данные`, () => {
		const { view, root, events } = make(View, template);
		const changes = observe(events, changeEvent);
		const state = data({ validation: valid });
		const before = JSON.stringify(state);
		Object.freeze(state.values);
		Object.freeze(state.validation.errors);
		Object.freeze(state.validation);
		Object.freeze(state);
		view.render(state);
		view.render(state);
		equal(JSON.stringify(state), before);
		equal(changes.length, 0);
		assert(!select(root, '[type="submit"]').disabled);
	});
	test(`${name}: 200 render не дублируют input/submit`, () => {
		const { view, root, events } = make(View, template);
		const changes = observe(events, changeEvent);
		const submits = observe(events, submitEvent);
		for (let i = 0; i < 200; i++) view.render(data({ validation: valid }));
		input(root, field, 'одно изменение');
		submit(root);
		equal(changes.length, 1);
		equal(submits.length, 1);
	});
	test(`${name}: обратный render не сбрасывает курсор`, () => {
		const { view, root } = make(View, template);
		const state = data({ values: { ...data().values, [field]: '123456' } });
		view.render(state);
		const control = select(root, `input[name="${field}"]`);
		control.focus();
		control.setSelectionRange(2, 2);
		view.render(state);
		equal(control.selectionStart, 2);
		equal(control.selectionEnd, 2);
	});
	test(`${name}: поля и submit заблокированы до первого render`, () => {
		const { root, events } = make(View, template);
		const changes = observe(events, changeEvent);
		const submits = observe(events, submitEvent);
		input(root, field, 'скрытый черновик');
		submit(root);
		equal(changes.length, 0);
		equal(submits.length, 0);
	});
}

test('OrderForm: значения адреса и выбранной оплаты восстанавливаются', () => {
	const { view, root } = make(OrderForm, '#order');
	view.render(orderData({ values: { payment: 'card', address: 'Москва, 1' } }));
	equal(select(root, '[name="address"]').value, 'Москва, 1');
	assert(select(root, '[name="card"]').classList.contains('button_alt-active'));
	equal(select(root, '[name="card"]').getAttribute('aria-pressed'), 'true');
	assert(
		!select(root, '[name="cash"]').classList.contains('button_alt-active')
	);
});
test('OrderForm: cash и null заменяют предыдущий выбор без двух активных кнопок', () => {
	const { view, root } = make(OrderForm, '#order');
	for (const payment of ['card', 'cash', null]) {
		view.render(orderData({ values: { payment, address: '' } }));
		equal(root.querySelectorAll('.button_alt-active').length, payment ? 1 : 0);
		if (payment)
			assert(
				select(root, `[name="${payment}"]`).classList.contains(
					'button_alt-active'
				)
			);
	}
});
test('OrderForm: обе кнопки публикуют прикладной payment без submit', () => {
	const { view, root, events } = make(OrderForm, '#order');
	const changes = observe(events, 'order:change');
	const submits = observe(events, 'order:next');
	view.render(orderData({ validation: valid }));
	click(select(root, '[name="card"]'));
	click(select(root, '[name="cash"]'));
	deepEqual(changes, [
		{ field: 'payment', value: 'card' },
		{ field: 'payment', value: 'cash' },
	]);
	equal(submits.length, 0);
	// Выбор отображается только после передачи нового состояния координатором.
	equal(root.querySelectorAll('.button_alt-active').length, 0);
});
test('OrderForm: pending блокирует обе оплаты даже при forced click', () => {
	const { view, root, events } = make(OrderForm, '#order');
	const signals = observe(events, 'order:change');
	view.render(orderData({ disabled: true }));
	forcedClick(select(root, '[name="card"]'));
	forcedClick(select(root, '[name="cash"]'));
	equal(signals.length, 0);
});
test('OrderForm: 200 render не дублируют события выбора оплаты', () => {
	const { view, root, events } = make(OrderForm, '#order');
	const signals = observe(events, 'order:change');
	for (let i = 0; i < 200; i++) view.render(orderData());
	click(select(root, '[name="card"]'));
	equal(signals.length, 1);
});
test('ContactsForm: email и телефон отображаются точно из черновика', () => {
	const { view, root } = make(ContactsForm, '#contacts');
	view.render(
		contactsData({
			values: { email: 'user@example.test', phone: '+7 900 000 00 00' },
		})
	);
	equal(select(root, '[name="email"]').value, 'user@example.test');
	equal(select(root, '[name="phone"]').value, '+7 900 000 00 00');
});
test('ContactsForm: изменение телефона отправляет contacts:change', () => {
	const { view, root, events } = make(ContactsForm, '#contacts');
	const signals = observe(events, 'contacts:change');
	view.render(contactsData());
	input(root, 'phone', '123');
	deepEqual(signals, [{ field: 'phone', value: '123' }]);
});
test('ContactsForm: UI доверяет validate, не добавляя regex email/phone', () => {
	const { view, root } = make(ContactsForm, '#contacts');
	view.render(
		contactsData({
			values: { email: 'любая строка', phone: 'x' },
			validation: valid,
		})
	);
	assert(!select(root, '[type="submit"]').disabled);
});
test('Success: выводит подтверждённую сумму, включая 0', () => {
	const { view, root } = make(Success, '#success');
	equal(view.render({ total: 1800 }), root);
	equal(
		select(root, '.order-success__description').textContent,
		'Списано 1800 синапсов'
	);
	view.render({ total: 0 });
	equal(
		select(root, '.order-success__description').textContent,
		'Списано 0 синапсов'
	);
});
test('Success: 200 render и один клик дают только success:close', () => {
	const { view, root, events } = make(Success, '#success');
	const signals = [];
	listen(events, '*', (event) => signals.push(event));
	for (let i = 0; i < 200; i++) view.render({ total: i });
	click(select(root, '.order-success__close'));
	deepEqual(signals, [{ eventName: 'success:close', data: {} }]);
});
test('Success: закрытие не очищает данные модели', () => {
	const { view, root, events } = make(Success, '#success');
	const model = new OrderModel(events);
	model.setField('email', 'сохранить');
	view.render({ total: 0 });
	click(select(root, '.order-success__close'));
	equal(model.draft.email, 'сохранить');
});

for (const [name, View, template, data, selector, eventName] of [
	[
		'Basket',
		Basket,
		'#basket',
		() => basketData({ items: [document.createElement('li')] }),
		'.basket__button',
		'checkout:start',
	],
	[
		'BasketItem',
		BasketItem,
		'#card-basket',
		itemData,
		'.basket__item-delete',
		'basket:remove',
	],
	[
		'OrderForm',
		OrderForm,
		'#order',
		() => orderData({ validation: valid }),
		'[name="card"]',
		'order:change',
	],
	[
		'ContactsForm',
		ContactsForm,
		'#contacts',
		() => contactsData({ validation: valid }),
		'[type="submit"]',
		'order:submit',
	],
	[
		'Success',
		Success,
		'#success',
		() => ({ total: 1 }),
		'.order-success__close',
		'success:close',
	],
]) {
	test(`${name}: destroy идемпотентен, события сняты, render запрещён`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, eventName);
		view.render(data());
		view.destroy();
		view.destroy();
		forcedClick(select(root, selector));
		if (root.tagName === 'FORM') {
			input(root, root.name === 'order' ? 'address' : 'email', 'после destroy');
			// Не отправлять HTMLFormElement.submit(): проверяется только DOM-событие.
			submit(root);
		}
		equal(signals.length, 0);
		throws(() => view.render(data()));
	});
	test(`${name}: нет новых подписок при render, destroy снимает точные callback`, () => {
		const root = mount(cloneTemplate(template));
		const events = new EventEmitter();
		const records = [];
		for (const element of [root, ...root.querySelectorAll('*')]) {
			const add = element.addEventListener;
			const remove = element.removeEventListener;
			element.addEventListener = function (type, handler, options) {
				records.push({ element, type, handler, removed: false });
				return add.call(this, type, handler, options);
			};
			element.removeEventListener = function (type, handler, options) {
				const record = records.find(
					(r) =>
						r.element === element &&
						r.type === type &&
						r.handler === handler &&
						!r.removed
				);
				assert(record, 'Снимается незарегистрированный обработчик');
				record.removed = true;
				return remove.call(this, type, handler, options);
			};
		}
		const view = own(new View(root, events));
		const count = records.length;
		assert(count > 0);
		for (let i = 0; i < 100; i++) view.render(data());
		equal(records.length, count);
		view.destroy();
		assert(records.every((r) => r.removed));
		view.destroy();
	});
	test(`${name}: повторное создание на том же DOM оставляет одно событие`, () => {
		const { view, root, events } = make(View, template);
		const signals = observe(events, eventName);
		view.render(data());
		view.destroy();
		const second = own(new View(root, events));
		second.render(data());
		if (root.tagName === 'FORM' && root.name === 'contacts') submit(root);
		else click(select(root, selector));
		equal(signals.length, 1);
	});
}

test('Интеграция: модель корзины меняет сумму/количество, удаление сообщает актуальный ID', () => {
	const events = new EventEmitter();
	const model = new BasketModel(events);
	const basket = make(Basket, '#basket', events);
	let rows = [];
	const refresh = () => {
		for (const row of rows) row.view.destroy();
		rows = model.getState().items.map((product, index) => {
			const row = makeItem(events);
			row.view.render({ ...product, index: index + 1, disabled: false });
			return row;
		});
		basket.view.render({
			items: rows.map((row) => row.root),
			total: model.getState().total,
			checkoutDisabled: false,
		});
	};
	listen(events, 'basket:changed', refresh);
	listen(events, 'basket:remove', ({ id }) => model.remove(id));
	const product = {
		id: 'one',
		title: 'Один',
		price: 750,
		image: '/test.svg',
		description: '',
		category: 'тест',
	};
	model.add(product);
	model.add({ ...product, id: 'zero', price: 0 });
	equal(select(basket.root, '.modal__title').textContent, 'Корзина (2)');
	equal(select(basket.root, '.basket__price').textContent, '750 синапсов');
	click(select(rows[0].root, '.basket__item-delete'));
	equal(model.getState().count, 1);
	equal(select(rows[0].root, '.basket__item-index').textContent, '1');
	equal(select(basket.root, '.basket__price').textContent, '0 синапсов');
	click(select(rows[0].root, '.basket__item-delete'));
	assert(
		select(basket.root, '.basket__list').textContent.includes('Корзина пуста')
	);
	assert(select(basket.root, '.basket__button').disabled);
});
test('Интеграция: OrderModel валидирует пробелы; два шага в Modal без HTTP и потери черновика', () => {
	const events = new EventEmitter();
	const model = new OrderModel(events);
	const order = make(OrderForm, '#order', events);
	const contacts = make(ContactsForm, '#contacts', events);
	const modal = makeModal(events);
	const render = () => {
		const draft = model.draft;
		const validation = model.validate();
		order.view.render(
			orderData({
				values: { payment: draft.payment, address: draft.address },
				validation: validation.order,
			})
		);
		contacts.view.render(
			contactsData({
				values: { email: draft.email, phone: draft.phone },
				validation: validation.contacts,
			})
		);
	};
	listen(events, 'order:change', ({ field, value }) =>
		model.setField(field, value)
	);
	listen(events, 'contacts:change', ({ field, value }) =>
		model.setField(field, value)
	);
	listen(events, 'order:changed', render);
	const next = observe(events, 'order:next');
	const requests = observe(events, 'order:submit');
	listen(events, 'order:next', () =>
		modal.view.render({ content: contacts.root })
	);
	render();
	modal.view.render({ content: order.root });
	modal.view.open();
	input(order.root, 'address', '   ');
	click(select(order.root, '[name="card"]'));
	submit(order.root);
	equal(next.length, 0);
	input(order.root, 'address', 'Адрес 1');
	submit(order.root);
	equal(next.length, 1);
	assert(modal.root.contains(contacts.root));
	input(contacts.root, 'email', '  ');
	input(contacts.root, 'phone', '123');
	submit(contacts.root);
	equal(requests.length, 0);
	input(contacts.root, 'email', 'user@example.test');
	submit(contacts.root);
	equal(requests.length, 1);
	modal.view.close();
	modal.view.open();
	render();
	equal(select(contacts.root, '[name="email"]').value, 'user@example.test');
	equal(model.draft.address, 'Адрес 1');
});
test('Интеграция: ошибка/повтор/pending и Success проверяются контролируемым состоянием', () => {
	const { view, root, events } = make(ContactsForm, '#contacts');
	const values = { email: 'user@example.test', phone: '123' };
	const signals = observe(events, 'order:submit');
	view.render(contactsData({ values, validation: valid, disabled: true }));
	submit(root);
	equal(signals.length, 0);
	view.render(
		contactsData({
			values,
			validation: valid,
			serverError: 'Контролируемая ошибка сервера.',
		})
	);
	equal(select(root, '[name="email"]').value, values.email);
	assert(
		select(root, '.form__errors').textContent.includes('Контролируемая ошибка')
	);
	submit(root);
	equal(signals.length, 1);
	const modal = makeModal(events);
	const success = make(Success, '#success', events);
	success.view.render({ total: 750 });
	listen(events, 'success:close', () => modal.view.close());
	modal.view.render({ content: success.root });
	modal.view.open();
	click(select(success.root, '.order-success__close'));
	assert(!modal.root.classList.contains('modal_active'));
	equal(select(root, '[name="email"]').value, values.email);
});
test('Изоляция: несколько экземпляров OrderForm не затрагивают чужой DOM', () => {
	const events = new EventEmitter();
	const first = make(OrderForm, '#order', events);
	const second = make(OrderForm, '#order', events);
	first.view.render(
		orderData({ values: { payment: 'card', address: 'Первый' } })
	);
	second.view.render(
		orderData({ values: { payment: 'cash', address: 'Второй' } })
	);
	equal(select(first.root, '[name="address"]').value, 'Первый');
	equal(select(second.root, '[name="address"]').value, 'Второй');
	assert(
		select(first.root, '[name="card"]').classList.contains('button_alt-active')
	);
	assert(
		select(second.root, '[name="cash"]').classList.contains('button_alt-active')
	);
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
	summary.textContent = `UI этапа 5: ${report.passed}/${results.length}; ошибок: ${report.failed}. Реальные заказы не создавались.`;
	const output = document.createElement('pre');
	output.id = 'ui-test-results';
	output.dataset.status = report.failed ? 'failed' : 'passed';
	output.textContent = JSON.stringify(report, null, 2);
	document.body.prepend(summary, output);
	window.__uiTestReport = report;
	if (location.protocol === 'http:' || location.protocol === 'https:') {
		await fetch('/__ui_results', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(report),
		});
	}
})().catch((error) => {
	document.body.dataset.uiFatalError = String(error);
	console.error(error);
});
