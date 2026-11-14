import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload, CatalogCardData, ProductId } from '../types';
import { ensureElement } from '../utils/utils';

export class CatalogCard extends Component<CatalogCardData> {
	private readonly title: HTMLElement;
	private readonly category: HTMLElement;
	private readonly image: HTMLImageElement;
	private readonly price: HTMLElement;
	private productId: ProductId | null = null;

	constructor(container: HTMLButtonElement, private readonly events: IEvents) {
		super(container);
		this.title = ensureElement<HTMLElement>('.card__title', container);
		this.category = ensureElement<HTMLElement>('.card__category', container);
		this.image = ensureElement<HTMLImageElement>('.card__image', container);
		this.price = ensureElement<HTMLElement>('.card__price', container);
		container.type = 'button';
		this.listen(container, 'click', () => {
			if (this.productId !== null) {
				this.events.emit<AppEventPayload<'product:open'>>('product:open', {
					id: this.productId,
				});
			}
		});
	}

	render(data: CatalogCardData): HTMLElement {
		this.assertActive();
		this.productId = data.id;
		this.setText(this.title, data.title);
		this.setText(this.category, data.category);
		for (const name of Array.from(this.category.classList)) {
			if (name.startsWith('card__category_'))
				this.category.classList.remove(name);
		}
		this.category.classList.add(`card__category_${data.categoryModifier}`);
		this.setImage(this.image, data.image, data.title);
		this.setText(
			this.price,
			data.price === null ? 'Бесценно' : `${data.price} синапсов`
		);
		return this.container;
	}
}
