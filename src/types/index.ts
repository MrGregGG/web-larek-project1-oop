import type { ApiListResponse } from '../components/base/api';

/**
 * Восстановленные контракты приложения, этап 1.
 * Это новая реконструкция, а не копия потерянных типов прошлого спринта.
 * Формат JSON магазина не подтверждён: эти интерфейсы не являются wire DTO.
 * До проверки сервера его ответы остаются unknown. См. PROJECT_ARCHITECTURE.md.
 */
export type ProductId = string;

/** Полный перечень категорий сервера неизвестен; новые строки допустимы. */
export type ProductCategory = string;

/** Только подписи, действительно присутствующие в HTML шаблона. */
export type KnownProductCategory = 'софт-скил' | 'другое';
export type CategoryModifier =
	| 'soft'
	| 'hard'
	| 'other'
	| 'additional'
	| 'button';

/** Внутренняя модель товара; image — путь, ещё не склеенный с CDN_URL. */
export interface IProduct {
	id: ProductId;
	title: string;
	description: string;
	image: string;
	category: ProductCategory;
	price: number | null;
}

/** Нужна проверка значения price во время выполнения, а не приведение типа. */
export type PurchasableProduct = Omit<IProduct, 'price'> & { price: number };
export type ProductSnapshot = Readonly<IProduct>;
export type BasketProduct = Readonly<PurchasableProduct>;

/** Имена кнопок в #order; соответствие значениям сервера ещё не проверено. */
export type PaymentMethod = 'card' | 'cash';

/** Валидные данные приложения, подготовленные к передаче в будущий адаптер. */
export interface IOrder {
	payment: PaymentMethod;
	address: string;
	email: string;
	phone: string;
	items: ProductId[];
	total: number;
}

export type OrderFields = Pick<IOrder, 'payment' | 'address'>;
export type ContactFields = Pick<IOrder, 'email' | 'phone'>;
export type OrderDraft = Omit<OrderFields, 'payment'> &
	ContactFields & { payment: PaymentMethod | null };
export type CheckoutField = keyof OrderDraft;
export type FormStep = 'order' | 'contacts';

export type FieldChange<T extends object> = {
	[K in keyof T]: { field: K; value: T[K] };
}[keyof T];

export type ValidationErrors<T extends object> = Partial<
	Record<keyof T, string>
>;
export interface ValidationResult<T extends object> {
	valid: boolean;
	errors: ValidationErrors<T>;
}
export interface CheckoutValidation {
	order: ValidationResult<OrderFields>;
	contacts: ValidationResult<ContactFields>;
}

export interface BasketState {
	items: readonly BasketProduct[];
	count: number;
	total: number;
}

/** Нормализованный список приложения; переиспользует существующий generic. */
export type ProductList = ApiListResponse<IProduct>;

/** Никаких предположений о полях необследованного ответа API. */
export type ApiResponse = unknown;

/**
 * Результат для UI, создаваемый адаптером только после подтверждения сервера.
 * total берётся из проверенного ответа либо снимка подтверждённого запроса.
 * Поле id не объявлено: наличие идентификатора в ответе не подтверждено.
 */
export interface IOrderResult {
	total: number;
}

/** Прикладной порт: будущий адаптер использует один существующий экземпляр Api. */
export interface IShopApi {
	getProducts(): Promise<ProductList>;
	submitOrder(order: Readonly<IOrder>): Promise<IOrderResult>;
}

export interface ICatalogModel {
	readonly items: readonly ProductSnapshot[];
	setItems(items: readonly IProduct[]): void;
	getById(id: ProductId): ProductSnapshot | undefined;
}

export interface IBasketModel {
	getState(): BasketState;
	has(id: ProductId): boolean;
	/** false при повторе либо непокупаемом товаре; состояние не меняется. */
	add(product: ProductSnapshot): boolean;
	remove(id: ProductId): boolean;
	clear(): void;
}

export interface IOrderModel {
	readonly draft: Readonly<OrderDraft>;
	setField<K extends CheckoutField>(field: K, value: OrderDraft[K]): void;
	validate(): CheckoutValidation;
	/** Исключение при невалидном черновике или пустой/некорректной корзине. */
	createOrder(basket: BasketState): IOrder;
	clear(): void;
}

/** Состояние запроса независимо от видимости модального окна. */
export type SubmissionState =
	| { status: 'idle' }
	| { status: 'pending'; order: Readonly<IOrder> }
	| { status: 'error'; message: string }
	| { status: 'success'; result: Readonly<IOrderResult> };

export type ScreenState =
	| { screen: 'closed' }
	| { screen: 'product'; productId: ProductId }
	| { screen: 'basket' }
	| { screen: 'order' }
	| { screen: 'contacts' }
	| { screen: 'success'; result: Readonly<IOrderResult> };

/** Данные View: их вычисляет координатор; ссылок на модели здесь нет. */
export type CatalogCardData = Readonly<
	Pick<IProduct, 'id' | 'title' | 'category' | 'image' | 'price'>
> & { categoryModifier: CategoryModifier };
export type PreviewData = CatalogCardData &
	Pick<IProduct, 'description'> & {
		buttonText: string;
		buttonDisabled: boolean;
	};
export type BasketItemData = Readonly<
	Pick<PurchasableProduct, 'id' | 'title' | 'price'>
> & { index: number; disabled: boolean };
export interface BasketViewData {
	items: readonly HTMLElement[];
	total: number;
	checkoutDisabled: boolean;
}
export interface FormViewState<T extends object> {
	values: Readonly<T>;
	validation: ValidationResult<T>;
	disabled: boolean;
	serverError: string;
}
export type OrderFormData = FormViewState<
	Pick<OrderDraft, 'payment' | 'address'>
>;
export type ContactsFormData = FormViewState<ContactFields>;
export interface PageViewData {
	catalog: readonly HTMLElement[];
	counter: number;
	locked: boolean;
	statusMessage: string;
}

/**
 * Карта проектируемых событий. Каждый payload — объект для IEvents.
 * Существующий EventEmitter не проверяет связь имени с payload автоматически.
 */
export interface AppEventMap {
	'product:open': { id: ProductId };
	'basket:open': Record<string, never>;
	'basket:add': { id: ProductId };
	'basket:remove': { id: ProductId };
	'checkout:start': Record<string, never>;
	'order:change': FieldChange<Pick<OrderDraft, 'payment' | 'address'>>;
	'order:next': Record<string, never>;
	'contacts:change': FieldChange<ContactFields>;
	'order:submit': Record<string, never>;
	'catalog:retry': Record<string, never>;
	'catalog:changed': { items: readonly ProductSnapshot[] };
	'basket:changed': BasketState;
	'order:changed': {
		draft: Readonly<OrderDraft>;
		validation: CheckoutValidation;
	};
	'modal:opened': Record<string, never>;
	'modal:closed': Record<string, never>;
	'success:close': Record<string, never>;
}

export type AppEventName = keyof AppEventMap;
export type AppEventPayload<E extends AppEventName> = AppEventMap[E];
export type AppEventHandler<E extends AppEventName> = (
	data: AppEventPayload<E>
) => void;
