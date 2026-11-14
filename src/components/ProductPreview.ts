import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload, PreviewData, ProductId } from '../types';
import { ensureElement } from '../utils/utils';

export class ProductPreview extends Component<PreviewData> {
	private readonly title: HTMLElement;
	private readonly category: HTMLElement;
	private readonly image: HTMLImageElement;
	private readonly description: HTMLElement;
	private readonly price: HTMLElement;
	private readonly button: HTMLButtonElement;
	private productId: ProductId | null = null;

	constructor(container: HTMLElement, private readonly events: IEvents) {
		super(container);
		this.title = ensureElement<HTMLElement>('.card__title', container);
		this.category = ensureElement<HTMLElement>('.card__category', container);
		this.image = ensureElement<HTMLImageElement>('.card__image', container);
		this.description = ensureElement<HTMLElement>('.card__text', container);
		this.price = ensureElement<HTMLElement>('.card__price', container);
		this.button = ensureElement<HTMLButtonElement>('.card__button', container);
		this.button.type = 'button';
		this.button.disabled = true;
		this.listen(this.button, 'click', () => {
			if (this.productId !== null && !this.button.disabled) {
				this.events.emit<AppEventPayload<'basket:add'>>('basket:add', {
					id: this.productId,
				});
			}
		});
	}

	render(data: PreviewData): HTMLElement {
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
		this.setText(this.description, data.description);
		this.setText(
			this.price,
			data.price === null ? 'Бесценно' : `${data.price} синапсов`
		);
		this.setText(this.button, data.buttonText);
		this.button.disabled = data.buttonDisabled || data.price === null;
		return this.container;
	}
}
