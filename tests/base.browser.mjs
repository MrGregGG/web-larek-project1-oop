/* Адресные проверки существующего брокера и DOM-утилит; запросов магазина нет. */
import { EventEmitter } from '../src/components/base/events.js';
import {
	bem,
	cloneTemplate,
	createElement,
	ensureAllElements,
	ensureElement,
	getElementData,
	getObjectProperties,
	isEmpty,
	isSelector,
	pascalToKebab,
	setElementData,
} from '../src/utils/utils.js';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const assert = (condition, message = 'Условие не выполнено') => {
	if (!condition) throw new Error(message);
};
const equal = (actual, expected) =>
	assert(
		Object.is(actual, expected),
		`${String(actual)} !== ${String(expected)}`
	);
const deepEqual = (actual, expected) =>
	equal(JSON.stringify(actual), JSON.stringify(expected));
function throws(run, message) {
	let caught = false;
	try {
		run();
	} catch (error) {
		caught = true;
		if (message !== undefined) equal(error.message, message);
		return error;
	} finally {
		assert(caught, 'Ожидалось исключение');
	}
}
function template(html = '') {
	const element = document.createElement('template');
	element.innerHTML = html;
	return element;
}

test('Events: обычный подписчик получает исходный объект без копирования', () => {
	const events = new EventEmitter();
	const payload = { id: 'one' };
	let received;
	events.on('item', (value) => (received = value));
	events.emit('item', payload);
	equal(received, payload);
});
test('Events: неизвестное событие не вызывает обработчики', () => {
	const events = new EventEmitter();
	let count = 0;
	events.on('item', () => count++);
	events.emit('other');
	equal(count, 0);
});
test('Events: emit без payload передаёт undefined', () => {
	const events = new EventEmitter();
	let received = 'unset';
	events.on('item', (value) => (received = value));
	events.emit('item');
	equal(received, undefined);
});
test('Events: порядок нескольких обработчиков и защита Set от дубля', () => {
	const events = new EventEmitter();
	const calls = [];
	const first = () => calls.push('first');
	events.on('item', first);
	events.on('item', () => calls.push('second'));
	events.on('item', first);
	events.emit('item');
	deepEqual(calls, ['first', 'second']);
});
test('Events: off снимает только указанный callback', () => {
	const events = new EventEmitter();
	const calls = [];
	const own = () => calls.push('own');
	events.on('item', own);
	events.on('item', () => calls.push('external'));
	events.off('item', own);
	events.emit('item');
	deepEqual(calls, ['external']);
});
test('Events: повторный off и неизвестный callback безопасны', () => {
	const events = new EventEmitter();
	const handler = () => undefined;
	events.off('missing', handler);
	events.on('item', handler);
	events.off('item', () => undefined);
	equal(events._events.get('item').size, 1);
	events.off('item', handler);
	events.off('item', handler);
	equal(events._events.size, 0);
});
test('Events: отписка не снимает тот же callback с другого события', () => {
	const events = new EventEmitter();
	let count = 0;
	const handler = () => count++;
	events.on('one', handler);
	events.on('two', handler);
	events.off('one', handler);
	events.emit('one');
	events.emit('two');
	equal(count, 1);
});
test('Events: onAll получает envelope с eventName и исходным data', () => {
	const events = new EventEmitter();
	const payload = { value: 1 };
	let received;
	events.onAll((value) => (received = value));
	events.emit('item', payload);
	equal(received.eventName, 'item');
	equal(received.data, payload);
});
test('Events: порядок wildcard/обычных определяется порядком подписки', () => {
	const events = new EventEmitter();
	const calls = [];
	events.onAll(() => calls.push('all'));
	events.on('item', () => calls.push('item'));
	events.onAll(() => calls.push('all-second'));
	events.emit('item');
	deepEqual(calls, ['all', 'all-second', 'item']);
});
test('Events: off wildcard оставляет чужие wildcard и обычные подписки', () => {
	const events = new EventEmitter();
	const calls = [];
	const own = () => calls.push('own');
	events.onAll(own);
	events.onAll(() => calls.push('external'));
	events.on('item', () => calls.push('item'));
	events.off('*', own);
	events.emit('item');
	deepEqual(calls, ['external', 'item']);
});
test('Events: RegExp подписка и отписка используют исходный экземпляр', () => {
	const events = new EventEmitter();
	const pattern = /^item:/;
	const calls = [];
	const handler = (value) => calls.push(value.id);
	events.on(pattern, handler);
	events.emit('other', { id: 'skip' });
	events.emit('item:one', { id: 'one' });
	events.off(/^item:/, handler);
	events.emit('item:two', { id: 'two' });
	events.off(pattern, handler);
	events.emit('item:three', { id: 'skip' });
	deepEqual(calls, ['one', 'two']);
});
test('Events: состояние RegExp с флагом g сохранено', () => {
	const events = new EventEmitter();
	const pattern = /^item:/g;
	let count = 0;
	events.on(pattern, () => count++);
	events.emit('item:one');
	equal(pattern.lastIndex, 5);
	events.emit('item:two');
	equal(pattern.lastIndex, 0);
	events.emit('item:three');
	equal(count, 2);
});
test('Events: offAll очищает обычные, wildcard и RegExp подписки', () => {
	const events = new EventEmitter();
	let count = 0;
	const handler = () => count++;
	events.on('item', handler);
	events.onAll(handler);
	events.on(/item/, handler);
	events.offAll();
	events.emit('item');
	equal(count, 0);
	equal(events._events.size, 0);
	events.on('item', handler);
	events.emit('item');
	equal(count, 1);
});
test('Events: trigger объединяет данные с приоритетом context без мутации', () => {
	const events = new EventEmitter();
	const input = { value: 'input', extra: 1 };
	const context = { value: 'context' };
	const received = [];
	events.on('item', (value) => received.push(value));
	const trigger = events.trigger('item', context);
	trigger(input);
	trigger();
	deepEqual(received, [{ value: 'context', extra: 1 }, { value: 'context' }]);
	equal(input.value, 'input');
	deepEqual(context, { value: 'context' });
});
test('Events: исключение подписчика передаётся и прерывает emit как прежде', () => {
	const events = new EventEmitter();
	const failure = new Error('external');
	const calls = [];
	events.on('item', () => {
		calls.push('first');
		throw failure;
	});
	events.on('item', () => calls.push('second'));
	events.onAll(() => calls.push('all'));
	equal(
		throws(() => events.emit('item')),
		failure
	);
	deepEqual(calls, ['first']);
});
test('Events: добавленный во время emit callback вызывается в этом emit', () => {
	const events = new EventEmitter();
	const calls = [];
	const late = () => calls.push('late');
	events.on('item', () => {
		calls.push('first');
		events.on('item', late);
	});
	events.emit('item');
	deepEqual(calls, ['first', 'late']);
});
test('Events: удалённый во время emit следующий callback не вызывается', () => {
	const events = new EventEmitter();
	const calls = [];
	const next = () => calls.push('next');
	events.on('item', () => {
		calls.push('first');
		events.off('item', next);
	});
	events.on('item', next);
	events.emit('item');
	deepEqual(calls, ['first']);
});
test('Events: буквальное имя * сохраняет два прежних вызова подписчика', () => {
	const events = new EventEmitter();
	const payload = { value: 1 };
	const calls = [];
	events.on('*', (value) => calls.push(value));
	events.emit('*', payload);
	deepEqual(calls, [{ eventName: '*', data: payload }, payload]);
});
test('Utils: isSelector/isEmpty принимают неизвестные значения без смены правил', () => {
	equal(isSelector('.item'), true);
	for (const value of ['', 'x', null, undefined, 0, {}, []])
		equal(isSelector(value), false);
	for (const value of [null, undefined]) equal(isEmpty(value), true);
	for (const value of [false, 0, '', [], {}]) equal(isEmpty(value), false);
});
test('Utils: ensureElement сохраняет последний матч и предупреждение', () => {
	const root = document.createElement('div');
	root.innerHTML = '<span class="match"></span><span class="match"></span>';
	const original = console.warn;
	const warnings = [];
	console.warn = (value) => warnings.push(value);
	try {
		equal(ensureElement('.match', root), root.lastElementChild);
		equal(warnings.length, 1);
		equal(ensureElement(root), root);
	} finally {
		console.warn = original;
	}
});
test('Utils: отсутствующий DOM-элемент даёт прежнюю явную ошибку', () => {
	throws(
		() => ensureElement('.missing', document.createElement('div')),
		'selector .missing return nothing'
	);
});
test('Utils: ensureAllElements сохраняет selector, NodeList и исходный массив', () => {
	const root = document.createElement('div');
	root.innerHTML = '<span class="match"></span><span class="match"></span>';
	const nodes = root.querySelectorAll('.match');
	const array = Array.from(nodes);
	equal(ensureAllElements('.match', root).length, 2);
	equal(ensureAllElements(nodes)[0], nodes[0]);
	equal(ensureAllElements(array), array);
	equal(ensureAllElements('.missing', root).length, 0);
});
test('Utils: cloneTemplate глубоко копирует первый элемент без изменения шаблона', () => {
	const source = template(' text <div><span>one</span></div><p>two</p>');
	const clone = cloneTemplate(source);
	assert(clone !== source.content.firstElementChild);
	equal(clone.tagName, 'DIV');
	clone.querySelector('span').textContent = 'changed';
	equal(source.content.querySelector('span').textContent, 'one');
	equal(source.content.children.length, 2);
});
test('Utils: cloneTemplate принимает selector существующего template', () => {
	const source = template('<button>one</button>');
	source.id = 'base-utils-template';
	document.body.append(source);
	try {
		equal(cloneTemplate('#base-utils-template').tagName, 'BUTTON');
	} finally {
		source.remove();
	}
});
for (const [name, html] of [
	['пустой', ''],
	['только текст/комментарий', ' \n <!-- empty --> text'],
]) {
	test(`Utils: ${name} template обрабатывается до обращения к cloneNode`, () => {
		const error = throws(
			() => cloneTemplate(template(html)),
			'Template does not contain an element'
		);
		assert(!(error instanceof TypeError));
	});
}
test('Utils: отсутствующий template сохраняет ошибку ensureElement', () => {
	throws(
		() => cloneTemplate('#base-missing-template'),
		'selector #base-missing-template return nothing'
	);
});
test('Utils: getObjectProperties сохраняет фильтр и исключение constructor', () => {
	class Example {
		first() {
			return 'first';
		}
		second() {
			return 'second';
		}
	}
	const value = new Example();
	deepEqual(getObjectProperties(value), ['first', 'second']);
	deepEqual(
		getObjectProperties(value, (name, descriptor) => {
			assert('value' in descriptor);
			return name === 'second';
		}),
		['second']
	);
});
test('Utils: dataset конвертируется исходными функциями без изменения DOM', () => {
	const element = document.createElement('div');
	setElementData(element, { count: 12, enabled: false, name: 'one' });
	deepEqual(
		getElementData(element, { count: Number, enabled: Boolean, name: String }),
		{ count: 12, enabled: true, name: 'one' }
	);
	equal(element.dataset.enabled, 'false');
});
test('Utils: фабрика DOM и строковые утилиты сохраняют результат', () => {
	const child = document.createElement('span');
	const element = createElement(
		'button',
		{ disabled: true, dataset: { id: 'one' } },
		child
	);
	equal(element.disabled, true);
	equal(element.dataset.id, 'one');
	equal(element.firstElementChild, child);
	equal(pascalToKebab('CatalogCard'), 'catalog-card');
	deepEqual(bem('card', 'title', 'active'), {
		name: 'card__title_active',
		class: '.card__title_active',
	});
});

(async () => {
	const results = [];
	for (const { name, run } of tests) {
		try {
			await run();
			results.push({ name, passed: true });
		} catch (error) {
			results.push({
				name,
				passed: false,
				error: String(error.stack || error),
			});
		}
	}
	const report = {
		passed: results.filter((value) => value.passed).length,
		failed: results.filter((value) => !value.passed).length,
		results,
	};
	window.__uiTestReport = report;
	const summary = document.createElement('p');
	summary.id = 'ui-test-summary';
	summary.textContent = `Base: ${report.passed}/${results.length}; ошибок: ${report.failed}.`;
	const output = document.createElement('pre');
	output.id = 'ui-test-results';
	output.textContent = JSON.stringify(report, null, 2);
	document.body.prepend(summary, output);
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
