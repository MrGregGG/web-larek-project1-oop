/* Контролируемый браузерный стенд этапа 4. Не точка входа магазина. */
import { Component } from '../src/components/base/Component.js';
import { Modal } from '../src/components/Modal.js';
import { Page } from '../src/components/Page.js';
import { CatalogCard } from '../src/components/CatalogCard.js';
import { EventEmitter } from '../src/components/base/events.js';
import { cloneTemplate } from '../src/utils/utils.js';

const tests = [];
let cleanup = [];
const sourceWrapper = document.querySelector('.page__wrapper').cloneNode(true);
const sourceModal = document.querySelector('#modal-container').cloneNode(true);
const image = window.__uiTestImage;
const cardData = (changes = {}) => ({
	id: 'fixture-one',
	title: 'Тестовая карточка',
	category: 'Тестовая категория',
	categoryModifier: 'soft',
	image,
	price: 750,
	...changes,
});
const test = (name, run) => tests.push({ name, run });
const assert = (condition, message = 'Условие не выполнено') => {
	if (!condition) throw new Error(message);
};
const equal = (actual, expected) =>
	assert(Object.is(actual, expected), `${actual} !== ${expected}`);
const deepEqual = (actual, expected) =>
	equal(JSON.stringify(actual), JSON.stringify(expected));
const throws = (run) => {
	let thrown = false;
	try {
		run();
	} catch {
		thrown = true;
	}
	assert(thrown, 'Ожидалось исключение');
};
function own(component) {
	cleanup.push(() => component.destroy());
	return component;
}
function mount(node) {
	document.body.append(node);
	cleanup.push(() => node.remove());
	return node;
}
function makeCard(events = new EventEmitter()) {
	const root = mount(cloneTemplate('#card-catalog'));
	return { root, events, view: own(new CatalogCard(root, events)) };
}
function makeModal(events = new EventEmitter()) {
	const root = sourceModal.cloneNode(true);
	root.removeAttribute('id');
	mount(root);
	return { root, events, view: own(new Modal(root, events)) };
}
function makePage(events = new EventEmitter()) {
	const root = mount(document.createElement('section'));
	root.append(sourceWrapper.cloneNode(true));
	return { root, events, view: own(new Page(root, events)) };
}
const pageData = (changes = {}) => ({
	catalog: [],
	counter: 0,
	locked: false,
	statusMessage: '',
	...changes,
});

test('HTML: демонстрационные окна инертны, рабочий Modal один', () => {
	equal(document.querySelectorAll('.modal').length, 1);
	equal(document.querySelectorAll('.modal_active').length, 0);
	equal(
		document.querySelector('#demo-layouts').content.querySelectorAll('.modal')
			.length,
		5
	);
});
test('HTML: семь исходных шаблонов сохранены', () => {
	for (const id of [
		'success',
		'card-catalog',
		'card-preview',
		'card-basket',
		'basket',
		'order',
		'contacts',
	]) {
		assert(document.getElementById(id) instanceof HTMLTemplateElement, id);
	}
});
test('Component: общий жизненный цикл снимает несколько DOM-подписок', () => {
	class Probe extends Component {
		constructor(root) {
			super(root);
			this.calls = 0;
			this.listen(root, 'click', () => this.calls++);
			this.listen(root, 'mouseenter', () => this.calls++);
		}
		render(data) {
			this.assertActive();
			this.setText(this.container, data);
			return this.container;
		}
	}
	const root = mount(document.createElement('button'));
	const view = own(new Probe(root));
	equal(view.render('<b>Текст</b>'), root);
	equal(root.children.length, 0);
	root.click();
	root.dispatchEvent(new MouseEvent('mouseenter'));
	equal(view.calls, 2);
	view.destroy();
	view.destroy();
	root.click();
	root.dispatchEvent(new MouseEvent('mouseenter'));
	equal(view.calls, 2);
	throws(() => view.render('Поздний render'));
});

test('Modal: исходное закрытое состояние скрыто CSS и aria-hidden', () => {
	const { root } = makeModal();
	equal(getComputedStyle(root).display, 'none');
	equal(root.getAttribute('role'), 'dialog');
	equal(root.getAttribute('aria-hidden'), 'true');
});
test('Modal.render заменяет содержимое и возвращает исходный контейнер', () => {
	const { root, view } = makeModal();
	const first = document.createElement('p');
	const second = document.createElement('button');
	equal(view.render({ content: first }), root);
	view.render({ content: second });
	equal(root.querySelector('.modal__content').children.length, 1);
	equal(root.querySelector('.modal__content').firstElementChild, second);
	equal(first.isConnected, false);
});
test('Modal.open показывает окно и публикует один объект события', () => {
	const { root, view, events } = makeModal();
	const opened = [];
	events.on('modal:opened', (data) => opened.push(data));
	view.open();
	view.open();
	equal(getComputedStyle(root).display, 'flex');
	equal(root.getAttribute('aria-hidden'), 'false');
	deepEqual(opened, [{}]);
});
test('Modal.close скрывает окно; повторный close не публикует событие', () => {
	const { root, view, events } = makeModal();
	let closed = 0;
	events.on('modal:closed', () => closed++);
	view.close();
	equal(closed, 0);
	view.open();
	view.close();
	view.close();
	equal(closed, 1);
	equal(getComputedStyle(root).display, 'none');
	equal(root.getAttribute('aria-hidden'), 'true');
});
test('Modal: крестик закрывает окно', () => {
	const { root, view } = makeModal();
	view.open();
	root.querySelector('.modal__close').click();
	equal(root.classList.contains('modal_active'), false);
});
test('Modal: внешний слой закрывает окно', () => {
	const { root, view } = makeModal();
	view.open();
	root.click();
	equal(root.classList.contains('modal_active'), false);
});
test('Modal: клики внутри окна не закрывают его', () => {
	const { root, view } = makeModal();
	const button = document.createElement('button');
	view.render({ content: button });
	view.open();
	button.click();
	root.querySelector('.modal__container').click();
	equal(root.classList.contains('modal_active'), true);
});
test('Modal: render открытого окна не создаёт нового lifecycle-события', () => {
	const { view, events } = makeModal();
	let opened = 0;
	events.on('modal:opened', () => opened++);
	view.open();
	for (let i = 0; i < 30; i++)
		view.render({ content: document.createElement('p') });
	equal(opened, 1);
});
test('Modal: после закрытия можно открыть то же содержимое', () => {
	const { root, view } = makeModal();
	const content = document.createElement('p');
	view.render({ content });
	view.open();
	view.close();
	view.open();
	equal(root.querySelector('.modal__content').firstElementChild, content);
	equal(getComputedStyle(root).display, 'flex');
});
test('Modal: 100 циклов не добавляют обработчики, destroy снимает все', () => {
	const root = sourceModal.cloneNode(true);
	root.removeAttribute('id');
	mount(root);
	const button = root.querySelector('.modal__close');
	const nativeAdd = EventTarget.prototype.addEventListener;
	const nativeRemove = EventTarget.prototype.removeEventListener;
	let added = 0;
	let removed = 0;
	EventTarget.prototype.addEventListener = function (...args) {
		if (this === root || this === button) added++;
		return nativeAdd.apply(this, args);
	};
	EventTarget.prototype.removeEventListener = function (...args) {
		if (this === root || this === button) removed++;
		return nativeRemove.apply(this, args);
	};
	try {
		const events = new EventEmitter();
		const view = own(new Modal(root, events));
		const initial = added;
		assert(initial > 0);
		let opened = 0;
		let closed = 0;
		events.on('modal:opened', () => opened++);
		events.on('modal:closed', () => closed++);
		for (let i = 0; i < 100; i++) {
			view.render({ content: document.createElement('p') });
			view.open();
			button.click();
		}
		equal(opened, 100);
		equal(closed, 100);
		equal(added, initial);
		view.destroy();
		equal(removed, initial);
	} finally {
		EventTarget.prototype.addEventListener = nativeAdd;
		EventTarget.prototype.removeEventListener = nativeRemove;
	}
});
test('Modal.destroy закрывает окно, освобождает содержимое и идемпотентен', () => {
	const { root, view, events } = makeModal();
	let closed = 0;
	events.on('modal:closed', () => closed++);
	view.render({ content: document.createElement('p') });
	view.open();
	view.destroy();
	view.destroy();
	view.close();
	equal(closed, 1);
	equal(root.querySelector('.modal__content').childElementCount, 0);
	throws(() => view.open());
	throws(() => view.render({ content: document.createElement('p') }));
	root.classList.add('modal_active');
	root.querySelector('.modal__close').click();
	assert(
		root.classList.contains('modal_active'),
		'Обработчик после destroy остался'
	);
});
test('Modal: новый экземпляр после destroy не дублирует close', () => {
	const { root, view, events } = makeModal();
	view.destroy();
	const next = own(new Modal(root, events));
	let closed = 0;
	events.on('modal:closed', () => closed++);
	next.open();
	root.querySelector('.modal__close').click();
	equal(closed, 1);
});
test('Modal: экземпляры не меняют чужой DOM', () => {
	const first = makeModal();
	const second = makeModal();
	first.view.open();
	second.view.open();
	first.view.close();
	assert(second.root.classList.contains('modal_active'));
});

test('CatalogCard отображает все поля и возвращает свой DOM', () => {
	const { root, view } = makeCard();
	const data = cardData();
	equal(view.render(data), root);
	equal(root.querySelector('.card__title').textContent, data.title);
	equal(root.querySelector('.card__category').textContent, data.category);
	equal(root.querySelector('.card__price').textContent, '750 синапсов');
	equal(root.querySelector('img').getAttribute('src'), image);
	equal(root.querySelector('img').alt, data.title);
});
test('CatalogCard: изображение действительно загружается в браузере', async () => {
	const { root, view } = makeCard();
	view.render(cardData());
	const img = root.querySelector('img');
	await img.decode();
	assert(img.naturalWidth > 0);
});
test('CatalogCard: null отображается как Бесценно, карточка доступна для просмотра', () => {
	const { root, view, events } = makeCard();
	view.render(cardData({ price: null }));
	equal(root.querySelector('.card__price').textContent, 'Бесценно');
	equal(root.disabled, false);
	let count = 0;
	events.on('product:open', () => count++);
	root.click();
	equal(count, 1);
});
test('CatalogCard: нулевая цена не считается отсутствующей', () => {
	const { root, view } = makeCard();
	view.render(cardData({ price: 0 }));
	equal(root.querySelector('.card__price').textContent, '0 синапсов');
});
test('CatalogCard: до первого render клик не публикует выдуманный ID', () => {
	const { root, events } = makeCard();
	let count = 0;
	events.on('product:open', () => count++);
	root.click();
	equal(count, 0);
});
test('CatalogCard: повторный render публикует только последний ID и один раз', () => {
	const { root, view, events } = makeCard();
	const clicks = [];
	events.on('product:open', (data) => clicks.push(data));
	for (let i = 0; i < 200; i++)
		view.render(cardData({ id: `updated-${i}`, title: `Товар ${i}` }));
	root.click();
	deepEqual(clicks, [{ id: 'updated-199' }]);
	equal(root.querySelector('.card__title').textContent, 'Товар 199');
});
test('CatalogCard меняет модификатор категории без накопления классов', () => {
	const { root, view } = makeCard();
	const category = root.querySelector('.card__category');
	category.classList.add('unrelated-class');
	for (const categoryModifier of [
		'soft',
		'hard',
		'other',
		'additional',
		'button',
	]) {
		view.render(cardData({ categoryModifier }));
		deepEqual(
			Array.from(category.classList).filter((name) =>
				name.startsWith('card__category_')
			),
			[`card__category_${categoryModifier}`]
		);
	}
	assert(category.classList.contains('card__category'));
	assert(category.classList.contains('unrelated-class'));
});
test('CatalogCard использует переданный модификатор, не классифицирует товары', () => {
	const { root, view } = makeCard();
	view.render(
		cardData({ category: 'Новая категория', categoryModifier: 'other' })
	);
	equal(root.querySelector('.card__category').textContent, 'Новая категория');
	assert(
		root
			.querySelector('.card__category')
			.classList.contains('card__category_other')
	);
});
test('CatalogCard вставляет название и категорию как текст', () => {
	const { root, view } = makeCard();
	view.render(
		cardData({
			title: '<img src=x onerror=alert(1)>',
			category: '<b>Категория</b>',
		})
	);
	equal(root.querySelector('.card__title').children.length, 0);
	equal(root.querySelector('.card__category').children.length, 0);
});
test('CatalogCard не отправляет внешнюю форму', () => {
	const { root, view } = makeCard();
	const form = mount(document.createElement('form'));
	form.append(root);
	view.render(cardData());
	let submitted = 0;
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		submitted++;
	});
	root.click();
	equal(root.type, 'button');
	equal(submitted, 0);
});
test('CatalogCard не меняет входные данные', () => {
	const { view } = makeCard();
	const data = cardData();
	const before = JSON.stringify(data);
	view.render(data);
	equal(JSON.stringify(data), before);
});
test('CatalogCard.destroy снимает click и запрещает последующий render', () => {
	const { root, view, events } = makeCard();
	view.render(cardData());
	let clicked = 0;
	events.on('product:open', () => clicked++);
	view.destroy();
	view.destroy();
	root.click();
	equal(clicked, 0);
	throws(() => view.render(cardData()));
});

test('Page отображает переданные узлы и переданный счётчик без бизнес-расчёта', () => {
	const { root, view } = makePage();
	const child = document.createElement('article');
	equal(view.render(pageData({ catalog: [child], counter: 7 })), root);
	equal(root.querySelector('.gallery').firstElementChild, child);
	equal(root.querySelector('.header__basket-counter').textContent, '7');
});
test('Page повторно заменяет список, а не дописывает копии', () => {
	const { root, view } = makePage();
	const child = document.createElement('article');
	for (let i = 0; i < 100; i++)
		view.render(pageData({ catalog: [child], counter: i }));
	equal(root.querySelector('.gallery').childElementCount, 1);
	equal(root.querySelector('.header__basket-counter').textContent, '99');
	view.render(pageData());
	equal(root.querySelector('.gallery').childElementCount, 0);
});
test('Page блокирует и разблокирует wrapper существующим CSS-классом', () => {
	const { root, view } = makePage();
	const wrapper = root.querySelector('.page__wrapper');
	view.render(pageData({ locked: true }));
	assert(wrapper.classList.contains('page__wrapper_locked'));
	equal(getComputedStyle(wrapper).position, 'fixed');
	view.render(pageData({ locked: false }));
	assert(!wrapper.classList.contains('page__wrapper_locked'));
});
test('Page показывает и скрывает statusMessage безопасным текстом', () => {
	const { root, view } = makePage();
	const status = root.querySelector('.page__status');
	view.render(pageData());
	assert(status.hidden);
	view.render(pageData({ statusMessage: '<b>Ошибка</b>' }));
	equal(status.textContent, '<b>Ошибка</b>');
	equal(status.children.length, 0);
	equal(status.hidden, false);
	equal(status.getAttribute('aria-live'), 'polite');
	view.render(pageData());
	assert(status.hidden);
});
test('Page после 100 render публикует basket:open один раз', () => {
	const { root, view, events } = makePage();
	const clicks = [];
	events.on('basket:open', (data) => clicks.push(data));
	for (let i = 0; i < 100; i++) view.render(pageData());
	root.querySelector('.header__basket').click();
	deepEqual(clicks, [{}]);
});
test('Page.destroy снимает click и освобождает блокировку', () => {
	const { root, view, events } = makePage();
	let clicks = 0;
	events.on('basket:open', () => clicks++);
	view.render(pageData({ locked: true }));
	view.destroy();
	view.destroy();
	root.querySelector('.header__basket').click();
	equal(clicks, 0);
	assert(
		!root
			.querySelector('.page__wrapper')
			.classList.contains('page__wrapper_locked')
	);
	throws(() => view.render(pageData()));
});
test('Page: создание нового экземпляра после destroy не дублирует обработчики', () => {
	const { root, view, events } = makePage();
	view.destroy();
	const next = own(new Page(root, events));
	let clicks = 0;
	events.on('basket:open', () => clicks++);
	next.render(pageData());
	root.querySelector('.header__basket').click();
	equal(clicks, 1);
});
test('Page работает в своём DOM-контексте', () => {
	const first = makePage();
	const second = makePage();
	first.view.render(pageData({ counter: 3 }));
	second.view.render(pageData({ counter: 5 }));
	equal(first.root.querySelector('.header__basket-counter').textContent, '3');
	equal(second.root.querySelector('.header__basket-counter').textContent, '5');
});
test('destroy View не очищает чужие подписки существующего EventEmitter', () => {
	const { view, events } = makeCard();
	let calls = 0;
	events.on('product:open', () => calls++);
	view.destroy();
	events.emit('product:open', { id: 'sentinel' });
	equal(calls, 1);
});
test('Некорректный DOM обнаруживается при инициализации через ensureElement', () => {
	const root = mount(document.createElement('div'));
	throws(() => new Modal(root, new EventEmitter()));
	throws(() => new Page(root, new EventEmitter()));
	throws(() => new CatalogCard(root, new EventEmitter()));
});

function showManualFixture() {
	const events = new EventEmitter();
	const page = new Page(document.body, events);
	const card = new CatalogCard(cloneTemplate('#card-catalog'), events);
	const modal = new Modal(document.querySelector('#modal-container'), events);
	let counter = 0;
	let statusMessage = '';
	const node = card.render(cardData({ title: 'Проверка CatalogCard' }));
	const renderPage = (locked = false) =>
		page.render({ catalog: [node], counter, locked, statusMessage });
	renderPage();
	const toolbar = document.createElement('aside');
	toolbar.style.cssText =
		'padding:16px;background:#172b43;color:white;font:16px sans-serif;';
	const heading = document.createElement('strong');
	heading.textContent =
		'Тестовый стенд этапа 4. Данные контролируемые, API не вызывается. ';
	toolbar.append(heading);
	const addButton = (text, action) => {
		const button = document.createElement('button');
		button.textContent = text;
		button.addEventListener('click', action);
		toolbar.append(button);
	};
	addButton('Открыть Modal', () => {
		const text = document.createElement('p');
		text.textContent =
			'Проверка Modal: крестик и внешний слой закрывают окно. Повторное открытие не добавляет обработчики.';
		modal.render({ content: text });
		modal.open();
	});
	addButton('Обновить карточку', () => {
		counter++;
		card.render(
			cardData({
				id: `manual-${counter}`,
				title: `Карточка после render №${counter}`,
				price: counter % 2 ? 0 : null,
			})
		);
		renderPage();
	});
	events.on('modal:opened', () => renderPage(true));
	events.on('modal:closed', () => renderPage(false));
	events.on('product:open', ({ id }) => {
		statusMessage = `Получено product:open: ${id}`;
		renderPage();
	});
	events.on('basket:open', () => {
		statusMessage = 'Получено basket:open. Корзина на этапе 4 не реализуется.';
		renderPage();
	});
	document.body.prepend(toolbar);
}

(async () => {
	const results = [];
	for (const { name, run } of tests) {
		cleanup = [];
		try {
			await run();
			results.push({ name, passed: true });
		} catch (error) {
			results.push({
				name,
				passed: false,
				error: String(error.stack || error),
			});
		} finally {
			for (const dispose of cleanup.reverse()) dispose();
		}
	}
	showManualFixture();
	const report = {
		passed: results.filter((x) => x.passed).length,
		failed: results.filter((x) => !x.passed).length,
		results,
	};
	const summary = document.createElement('p');
	summary.id = 'ui-test-summary';
	summary.textContent = `UI-проверки: ${report.passed}/${results.length}; ошибок: ${report.failed}.`;
	summary.style.cssText = 'padding:12px;font:18px sans-serif;';
	const details = document.createElement('details');
	const title = document.createElement('summary');
	title.textContent = 'Результаты браузерных проверок';
	const output = document.createElement('pre');
	output.id = 'ui-test-results';
	output.dataset.status = report.failed ? 'failed' : 'passed';
	output.textContent = JSON.stringify(report, null, 2);
	details.append(title, output);
	document.body.prepend(summary, details);
	window.__uiTestReport = report;
	if (location.protocol === 'http:' || location.protocol === 'https:')
		await fetch('/__ui_results', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(report),
		});
})().catch((error) => {
	document.body.dataset.uiFatalError = String(error);
	console.error(error);
});
