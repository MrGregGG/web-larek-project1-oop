/* Проверки production main.js в iframe обычной страницы. Никаких реальных POST. */
const cases = [];
const test = (name, run) => cases.push({ name, run });
const assert = (value, message = 'Условие не выполнено') => {
	if (!value) throw new Error(message);
};
const q = (doc, selector) => {
	const node = doc.querySelector(selector);
	assert(node, `Нет ${selector}`);
	return node;
};
async function until(check) {
	const deadline = Date.now() + 8000;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((done) => setTimeout(done, 20));
	}
	throw new Error('Истекло ожидание состояния приложения');
}
const control = (data) =>
	fetch('/__test/control', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	});
const state = async () => (await fetch('/__test/state')).json();
function input(doc, name, value) {
	const field = q(doc, `#modal-container [name="${name}"]`);
	field.value = value;
	field.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
}
function checkout(doc, payment = 'card') {
	q(doc, '.gallery .card').click();
	q(doc, '#modal-container .card__button').click();
	q(doc, '.modal__close').click();
	q(doc, '.header__basket').click();
	q(doc, '.basket__button').click();
	q(doc, `[name="${payment}"]`).click();
	input(doc, 'address', 'Тестовый адрес');
	q(doc, '#modal-container [type="submit"]').click();
	input(doc, 'email', 'user@example.test');
	input(doc, 'phone', '123');
}
test('Обычный production entry запускает приложение и каталог', async (doc) => {
	assert(doc.querySelectorAll('.gallery .card').length === 3);
	assert(!doc.querySelector('#ui-test-summary'));
	assert((await state()).gets === 1);
});
test('Товар без цены нельзя добавить; товар не дублируется', async (doc) => {
	doc.querySelectorAll('.gallery .card')[2].click();
	assert(q(doc, '#modal-container .card__button').disabled);
	q(doc, '.modal__close').click();
	q(doc, '.gallery .card').click();
	q(doc, '#modal-container .card__button').click();
	assert(q(doc, '#modal-container .card__button').disabled);
	assert(q(doc, '.header__basket-counter').textContent === '1');
});
test('Полный сценарий: HTTP POST только тестовому серверу и очистка после подтверждения', async (doc) => {
	checkout(doc);
	q(doc, '#modal-container [type="submit"]').click();
	await until(() => doc.querySelector('.order-success'));
	const requests = (await state()).posts;
	assert(requests.length === 1 && requests[0].payment === 'online');
	assert(q(doc, '.header__basket-counter').textContent === '0');
});
test('HTTP 500 сохраняет данные; ручной повтор завершается успехом', async (doc) => {
	await control({ failNext: true });
	checkout(doc);
	q(doc, '#modal-container [type="submit"]').click();
	await until(() =>
		q(doc, '.form__errors').textContent.includes('Данные сохранены')
	);
	assert(q(doc, '[name="email"]').value === 'user@example.test');
	assert(q(doc, '.header__basket-counter').textContent === '1');
	q(doc, '#modal-container [type="submit"]').click();
	await until(() => doc.querySelector('.order-success'));
	assert((await state()).posts.length === 2);
});
test('cash отклоняется без HTTP и без ложного успеха', async (doc) => {
	checkout(doc, 'cash');
	q(doc, '#modal-container [type="submit"]').click();
	await until(() =>
		q(doc, '.form__errors').textContent.includes('не подтверждён')
	);
	assert((await state()).posts.length === 0);
	assert(q(doc, '.header__basket-counter').textContent === '1');
});
test('Повторный submit в ожидании не создаёт второй POST', async (doc) => {
	await control({ delay: 200 });
	checkout(doc);
	const form = q(doc, 'form[name="contacts"]');
	form.dispatchEvent(
		new doc.defaultView.Event('submit', { bubbles: true, cancelable: true })
	);
	form.dispatchEvent(
		new doc.defaultView.Event('submit', { bubbles: true, cancelable: true })
	);
	await until(() => doc.querySelector('.order-success'));
	assert((await state()).posts.length === 1);
});
test('Закрытие при ожидании не отменяет очистку и не переоткрывает Modal', async (doc) => {
	await control({ delay: 200 });
	checkout(doc);
	q(doc, '#modal-container [type="submit"]').click();
	q(doc, '.modal__close').click();
	await until(() => q(doc, '.header__basket-counter').textContent === '0');
	assert(!q(doc, '#modal-container').classList.contains('modal_active'));
});
test('Некорректное подтверждение не очищает данные', async (doc) => {
	await control({ malformedNext: true });
	checkout(doc);
	q(doc, '#modal-container [type="submit"]').click();
	await until(() =>
		q(doc, '.form__errors').textContent.includes('некорректное подтверждение')
	);
	assert(q(doc, '.header__basket-counter').textContent === '1');
	assert(!doc.querySelector('.order-success'));
});

(async () => {
	const results = [];
	for (const { name, run } of cases) {
		await control({ reset: true });
		const frame = document.createElement('iframe');
		frame.title = 'Production WEB-ларёк';
		frame.style.cssText = 'width:100%;height:700px;border:0';
		frame.src = '/__test/page';
		q(document, '#frames').replaceChildren(frame);
		let error;
		try {
			await until(
				() =>
					frame.contentDocument?.querySelectorAll('.gallery .card').length === 3
			);
			await run(frame.contentDocument);
		} catch (caught) {
			error = String(caught.stack || caught);
		}
		results.push({ name, passed: !error, ...(error ? { error } : {}) });
	}
	const report = {
		passed: results.filter((r) => r.passed).length,
		failed: results.filter((r) => !r.passed).length,
		results,
	};
	q(
		document,
		'#summary'
	).textContent = `Production: ${report.passed}/${results.length}, ошибок ${report.failed}. Реальных заказов нет.`;
	q(document, '#results').textContent = JSON.stringify(report, null, 2);
	window.__productionTestReport = report;
	await fetch('/__test/results', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(report),
	});
})().catch((error) => {
	q(document, '#summary').textContent = String(error);
});
