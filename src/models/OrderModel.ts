import type { IEvents } from '../components/base/events';
import type {
	AppEventPayload,
	BasketState,
	CheckoutField,
	CheckoutValidation,
	ContactFields,
	IOrder,
	IOrderModel,
	OrderDraft,
	OrderFields,
	ProductId,
	ValidationErrors,
} from '../types';

export class OrderModel implements IOrderModel {
	private data: OrderDraft = {
		payment: null,
		address: '',
		email: '',
		phone: '',
	};

	constructor(private readonly events: IEvents) {}

	get draft(): Readonly<OrderDraft> {
		return { ...this.data };
	}

	setField<K extends CheckoutField>(field: K, value: OrderDraft[K]): void {
		if (field === 'payment') {
			if (value !== null && value !== 'card' && value !== 'cash') {
				throw new Error('Неизвестный способ оплаты.');
			}
		} else if (typeof value !== 'string') {
			throw new Error('Поле заказа должно содержать строку.');
		}
		if (this.data[field] === value) return;
		this.data[field] = value;
		this.emitChange();
	}

	validate(): CheckoutValidation {
		const order: ValidationErrors<OrderFields> = {};
		const contacts: ValidationErrors<ContactFields> = {};
		if (this.data.payment !== 'card' && this.data.payment !== 'cash') {
			order.payment = 'Выберите способ оплаты.';
		}
		if (!this.data.address.trim()) order.address = 'Укажите адрес доставки.';
		if (!this.data.email.trim()) contacts.email = 'Укажите email.';
		if (!this.data.phone.trim()) contacts.phone = 'Укажите телефон.';
		return {
			order: { valid: Object.keys(order).length === 0, errors: order },
			contacts: {
				valid: Object.keys(contacts).length === 0,
				errors: contacts,
			},
		};
	}

	createOrder(basket: BasketState): IOrder {
		const validation = this.validate();
		const payment = this.data.payment;
		if (
			!validation.order.valid ||
			!validation.contacts.valid ||
			payment === null
		) {
			throw new Error('Заполните обязательные поля заказа.');
		}
		if (basket.items.length === 0) throw new Error('Корзина пуста.');

		const ids = new Set<ProductId>();
		let total = 0;
		for (const product of basket.items) {
			if (
				ids.has(product.id) ||
				typeof product.price !== 'number' ||
				!Number.isFinite(product.price) ||
				product.price < 0
			) {
				throw new Error('В корзине есть некорректные товары.');
			}
			ids.add(product.id);
			total += product.price;
		}
		if (
			!Number.isFinite(total) ||
			basket.count !== ids.size ||
			basket.total !== total
		) {
			throw new Error('Сумма или количество товаров в корзине некорректны.');
		}
		return {
			payment,
			address: this.data.address.trim(),
			email: this.data.email.trim(),
			phone: this.data.phone.trim(),
			items: Array.from(ids),
			total,
		};
	}

	clear(): void {
		if (
			Object.values(this.data).every((value) => value === null || value === '')
		) {
			return;
		}
		this.data = { payment: null, address: '', email: '', phone: '' };
		this.emitChange();
	}

	private emitChange(): void {
		this.events.emit<AppEventPayload<'order:changed'>>('order:changed', {
			draft: this.draft,
			validation: this.validate(),
		});
	}
}
