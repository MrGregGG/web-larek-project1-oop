import type { IEvents } from '../components/base/events';
import type {
	AppEventPayload,
	BasketProduct,
	BasketState,
	IBasketModel,
	ProductId,
	ProductSnapshot,
} from '../types';

export class BasketModel implements IBasketModel {
	private readonly products = new Map<ProductId, BasketProduct>();

	constructor(private readonly events: IEvents) {}

	getState(): BasketState {
		const items = Array.from(this.products.values(), (product) => ({
			...product,
		}));
		return {
			items,
			count: items.length,
			total: items.reduce((total, product) => total + product.price, 0),
		};
	}

	has(id: ProductId): boolean {
		return this.products.has(id);
	}

	add(product: ProductSnapshot): boolean {
		const price = product.price;
		if (
			this.has(product.id) ||
			typeof price !== 'number' ||
			!Number.isFinite(price) ||
			price < 0 ||
			!Number.isFinite(this.getState().total + price)
		) {
			return false;
		}
		this.products.set(product.id, { ...product, price });
		this.emitChange();
		return true;
	}

	remove(id: ProductId): boolean {
		if (!this.products.delete(id)) return false;
		this.emitChange();
		return true;
	}

	clear(): void {
		if (this.products.size === 0) return;
		this.products.clear();
		this.emitChange();
	}

	private emitChange(): void {
		this.events.emit<AppEventPayload<'basket:changed'>>(
			'basket:changed',
			this.getState()
		);
	}
}
