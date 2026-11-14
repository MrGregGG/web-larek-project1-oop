import type { IEvents } from '../components/base/events';
import type {
	AppEventPayload,
	ICatalogModel,
	IProduct,
	ProductId,
	ProductSnapshot,
} from '../types';

export class CatalogModel implements ICatalogModel {
	private products: ProductSnapshot[] = [];

	constructor(private readonly events: IEvents) {}

	get items(): readonly ProductSnapshot[] {
		return this.products.map((product) => ({ ...product }));
	}

	setItems(items: readonly IProduct[]): void {
		const ids = new Set(items.map((product) => product.id));
		if (ids.size !== items.length) {
			throw new Error('В каталоге повторяются идентификаторы товаров.');
		}
		this.products = items.map((product) => ({ ...product }));
		this.events.emit<AppEventPayload<'catalog:changed'>>('catalog:changed', {
			items: this.items,
		});
	}

	getById(id: ProductId): ProductSnapshot | undefined {
		const product = this.products.find((item) => item.id === id);
		return product ? { ...product } : undefined;
	}
}
