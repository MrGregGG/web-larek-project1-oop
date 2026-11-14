import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload, BasketItemData, ProductId } from '../types';
import { ensureElement } from '../utils/utils';

export class BasketItem extends Component<BasketItemData> {
	private readonly index: HTMLElement;
	private readonly title: HTMLElement;
	private readonly price: HTMLElement;
	private readonly remove: HTMLButtonElement;
	private productId: ProductId | null = null;

	constructor(container: HTMLElement, private readonly events: IEvents) {
		super(container);
		this.index = ensureElement<HTMLElement>('.basket__item-index', container);
		this.title = ensureElement<HTMLElement>('.card__title', container);
		this.price = ensureElement<HTMLElement>('.card__price', container);
		this.remove = ensureElement<HTMLButtonElement>(
			'.basket__item-delete',
			container
		);
		this.remove.type = 'button';
		this.remove.disabled = true;
		this.listen(this.remove, 'click', () => {
			if (this.productId !== null && !this.remove.disabled) {
				this.events.emit<AppEventPayload<'basket:remove'>>('basket:remove', {
					id: this.productId,
				});
			}
		});
	}

	render(data: BasketItemData): HTMLElement {
		this.assertActive();
		this.productId = data.id;
		this.setText(this.index, data.index);
		this.setText(this.title, data.title);
		this.setText(this.price, `${data.price} синапсов`);
		this.remove.disabled = data.disabled;
		return this.container;
	}
}
