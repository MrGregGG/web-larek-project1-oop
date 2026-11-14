import { Api } from './components/base/api';
import { EventEmitter } from './components/base/events';
import { Page } from './components/Page';
import { Modal } from './components/Modal';
import { CatalogCard } from './components/CatalogCard';
import { ProductPreview } from './components/ProductPreview';
import { Basket } from './components/Basket';
import { BasketItem } from './components/BasketItem';
import { OrderForm } from './components/OrderForm';
import { ContactsForm } from './components/ContactsForm';
import { Success } from './components/Success';
import { CatalogModel } from './models/CatalogModel';
import { BasketModel } from './models/BasketModel';
import { OrderModel } from './models/OrderModel';
import { ShopApi } from './services/ShopApi';
import { ShopApiError } from './services/ShopApiError';
import { loadCatalog } from './integration/loadCatalog';
import { API_URL, CDN_URL } from './utils/constants';
import { resolveProductImage } from './utils/resolveProductImage';
import { cloneTemplate, ensureElement } from './utils/utils';
import type {
	AppEventHandler,
	AppEventName,
	AppEventPayload,
	CatalogCardData,
	CategoryModifier,
	IOrder,
	IShopApi,
	ProductId,
	ProductSnapshot,
	ScreenState,
	SubmissionState,
} from './types';

export interface AppOptions {
	root?: HTMLElement;
	events?: EventEmitter;
	shopApi?: IShopApi;
	apiUrl?: string;
	cdnUrl?: string;
}

/** AppPresenter по роли; createApp — утверждённая форма координатора. */
export function createApp(options: AppOptions = {}) {
	const root = options.root ?? document.body;
	const events = options.events ?? new EventEmitter();
	// Пустой API_ORIGIN даёт относительные константы. По умолчанию используем
	// подтверждённый публичный сервер, а не несуществующий backend dev-server.
	const origin = 'https://larek-api.nomoreparties.co';
	const cdnUrl = new URL(options.cdnUrl ?? CDN_URL, origin).href;
	const shopApi =
		options.shopApi ??
		new ShopApi(
			new Api(new URL(options.apiUrl ?? API_URL, origin).href),
			cdnUrl
		);
	const catalog = new CatalogModel(events);
	const basket = new BasketModel(events);
	const order = new OrderModel(events);
	const template = <T extends HTMLElement>(selector: string): T =>
		cloneTemplate<T>(ensureElement<HTMLTemplateElement>(selector, root));
	const page = new Page(root, events);
	const modal = new Modal(ensureElement('#modal-container', root), events);
	const preview = new ProductPreview(template('#card-preview'), events);
	const basketView = new Basket(template('#basket'), events);
	const orderForm = new OrderForm(template<HTMLFormElement>('#order'), events);
	const contactsForm = new ContactsForm(
		template<HTMLFormElement>('#contacts'),
		events
	);
	const success = new Success(template('#success'), events);
	const cards = new Map<ProductId, CatalogCard>();
	const rows = new Map<ProductId, BasketItem>();
	const subscriptions: Array<() => void> = [];
	const categories = new Map<string, CategoryModifier>([
		['софт-скил', 'soft'],
		['хард-скил', 'hard'],
		['дополнительное', 'additional'],
		['кнопка', 'button'],
		['другое', 'other'],
	]);
	let screen: ScreenState = { screen: 'closed' };
	let submission: SubmissionState = { status: 'idle' };
	let gallery: HTMLElement[] = [];
	let content: HTMLElement | null = null;
	let locked = false;
	let destroyed = false;
	let settling = false;
	let catalogRequest: Promise<void> | null = null;
	let catalogMessage = '';
	let catalogFailed = false;
	const pending = () => submission.status === 'pending' || settling;

	function on<E extends AppEventName>(name: E, handler: AppEventHandler<E>) {
		events.on<AppEventPayload<E>>(name, handler);
		subscriptions.push(() => events.off(name, handler));
	}

	function cardData(product: ProductSnapshot): CatalogCardData {
		return {
			id: product.id,
			title: product.title,
			category: product.category,
			categoryModifier: categories.get(product.category) ?? 'other',
			image: resolveProductImage(product.image, cdnUrl),
			price: product.price,
		};
	}

	function renderPage(): void {
		let statusMessage = catalogMessage;
		if (submission.status === 'pending')
			statusMessage = 'Ожидаем подтверждение заказа…';
		if (submission.status === 'error' && screen.screen === 'closed') {
			statusMessage = submission.message;
		}
		page.render({
			catalog: gallery,
			counter: basket.getState().count,
			locked,
			statusMessage,
		});
		page.setCatalogRetry(catalogFailed, catalogRequest !== null || pending());
	}

	function render(): void {
		if (destroyed) return;
		const draft = order.draft;
		const validation = order.validate();
		const orderNode = orderForm.render({
			values: { payment: draft.payment, address: draft.address },
			validation: validation.order,
			disabled: pending(),
			serverError: '',
		});
		const contacts = contactsForm.render({
			values: { email: draft.email, phone: draft.phone },
			validation: validation.contacts,
			disabled: pending(),
			serverError: submission.status === 'error' ? submission.message : '',
		});
		const state = basket.getState();
		const ids = new Set(state.items.map((product) => product.id));
		for (const [id, row] of rows) {
			if (!ids.has(id)) {
				row.destroy();
				rows.delete(id);
			}
		}
		const items = state.items.map((product, index) => {
			let row = rows.get(product.id);
			if (!row) {
				row = new BasketItem(template('#card-basket'), events);
				rows.set(product.id, row);
			}
			return row.render({ ...product, index: index + 1, disabled: pending() });
		});
		const basketNode = basketView.render({
			items,
			total: state.total,
			checkoutDisabled: pending() || state.count === 0,
		});
		let next: HTMLElement | null = null;
		switch (screen.screen) {
			case 'product': {
				const product = catalog.getById(screen.productId);
				if (product) {
					const selected = basket.has(product.id);
					next = preview.render({
						...cardData(product),
						description: product.description,
						buttonDisabled: pending() || selected || product.price === null,
						buttonText:
							product.price === null
								? 'Недоступно'
								: selected
								? 'Уже в корзине'
								: 'В корзину',
					});
				}
				break;
			}
			case 'basket':
				next = basketNode;
				break;
			case 'order':
				next = orderNode;
				break;
			case 'contacts':
				next = contacts;
				break;
			case 'success':
				next = success.render(screen.result);
				break;
		}
		// Повторное replaceChildren того же form сбрасывает focus при вводе.
		if (next && next !== content) {
			modal.render({ content: next });
			content = next;
		}
		renderPage();
	}

	function show(next: ScreenState): void {
		screen = next;
		render();
		modal.open();
	}

	function publicError(error: unknown, fallback: string): string {
		return error instanceof ShopApiError ? error.message : fallback;
	}

	function reloadCatalog(): Promise<void> {
		if (destroyed || pending()) return Promise.resolve();
		if (catalogRequest) return catalogRequest;
		catalogMessage = 'Загрузка каталога…';
		catalogFailed = false;
		renderPage();
		catalogRequest = (async () => {
			try {
				await loadCatalog(
					{
						getProducts: async () => {
							const products = await shopApi.getProducts();
							if (destroyed) throw new Error('Приложение уничтожено.');
							return products;
						},
					},
					catalog
				);
				catalogMessage = catalog.items.length ? '' : 'Товаров пока нет.';
			} catch (error: unknown) {
				catalogFailed = true;
				catalogMessage = publicError(
					error,
					'Не удалось загрузить каталог. Повторите попытку.'
				);
			} finally {
				catalogRequest = null;
				if (!destroyed) renderPage();
			}
		})();
		return catalogRequest;
	}

	async function submit(): Promise<void> {
		if (destroyed || pending() || screen.screen !== 'contacts') return;
		let snapshot: IOrder;
		try {
			snapshot = order.createOrder(basket.getState());
		} catch {
			render();
			return;
		}
		submission = { status: 'pending', order: snapshot };
		render();
		try {
			const result = await shopApi.submitOrder(snapshot);
			if (destroyed) return;
			submission = { status: 'success', result };
			settling = true;
			try {
				basket.clear();
				order.clear();
			} finally {
				settling = false;
			}
			if (locked) show({ screen: 'success', result });
			else render();
		} catch (error: unknown) {
			if (destroyed) return;
			submission = {
				status: 'error',
				message: publicError(
					error,
					'Не удалось подтвердить заказ. Данные сохранены; повторите отправку вручную.'
				),
			};
			render();
		}
	}

	on('catalog:changed', () => {
		for (const card of cards.values()) card.destroy();
		cards.clear();
		gallery = catalog.items.map((product) => {
			const card = new CatalogCard(
				template<HTMLButtonElement>('#card-catalog'),
				events
			);
			cards.set(product.id, card);
			return card.render(cardData(product));
		});
		if (screen.screen === 'product' && !catalog.getById(screen.productId))
			modal.close();
		render();
	});
	on('catalog:retry', () => {
		void reloadCatalog();
	});
	on('product:open', ({ id }) => {
		if (!pending() && catalog.getById(id))
			show({ screen: 'product', productId: id });
	});
	on('basket:open', () => {
		if (!pending()) show({ screen: 'basket' });
	});
	on('basket:add', ({ id }) => {
		if (pending() || screen.screen !== 'product' || screen.productId !== id)
			return;
		const product = catalog.getById(id);
		if (product) basket.add(product);
	});
	on('basket:remove', ({ id }) => {
		if (!pending() && screen.screen === 'basket') basket.remove(id);
	});
	on('basket:changed', render);
	on('order:changed', render);
	on('checkout:start', () => {
		if (pending() || screen.screen !== 'basket' || !basket.getState().count)
			return;
		submission = { status: 'idle' };
		show({ screen: 'order' });
	});
	on('order:change', (change) => {
		if (pending() || screen.screen !== 'order') return;
		if (change.field === 'payment') order.setField('payment', change.value);
		else order.setField('address', change.value);
	});
	on('order:next', () => {
		if (!pending() && screen.screen === 'order' && order.validate().order.valid)
			show({ screen: 'contacts' });
	});
	on('contacts:change', ({ field, value }) => {
		if (pending() || screen.screen !== 'contacts') return;
		if (submission.status === 'error') submission = { status: 'idle' };
		order.setField(field, value);
	});
	on('order:submit', () => {
		void submit();
	});
	on('modal:opened', () => {
		locked = true;
		renderPage();
	});
	on('modal:closed', () => {
		locked = false;
		screen = { screen: 'closed' };
		renderPage();
	});
	on('success:close', () => {
		if (screen.screen === 'success') modal.close();
	});
	render();
	const ready = reloadCatalog();

	return {
		ready,
		reloadCatalog,
		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			for (const unsubscribe of subscriptions) unsubscribe();
			for (const view of [
				...cards.values(),
				...rows.values(),
				preview,
				basketView,
				orderForm,
				contactsForm,
				success,
				modal,
				page,
			])
				view.destroy();
			cards.clear();
			rows.clear();
		},
	};
}
