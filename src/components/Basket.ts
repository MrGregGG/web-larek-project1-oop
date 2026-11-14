import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload, BasketViewData } from '../types';
import { createElement, ensureElement } from '../utils/utils';

export class Basket extends Component<BasketViewData> {
	private readonly list: HTMLElement;
	private readonly title: HTMLElement;
	private readonly price: HTMLElement;
	private readonly checkout: HTMLButtonElement;
	private readonly empty: HTMLLIElement;

	constructor(container: HTMLElement, private readonly events: IEvents) {
		super(container);
		this.list = ensureElement<HTMLElement>('.basket__list', container);
		this.title = ensureElement<HTMLElement>('.modal__title', container);
		this.price = ensureElement<HTMLElement>('.basket__price', container);
		this.checkout = ensureElement<HTMLButtonElement>(
			'.basket__button',
			container
		);
		this.empty = createElement<HTMLLIElement>('li', {
			className: 'basket__item',
			textContent: 'Корзина пуста',
		});
		this.checkout.type = 'button';
		this.checkout.disabled = true;
		this.listen(this.checkout, 'click', () => {
			if (!this.checkout.disabled) {
				this.events.emit<AppEventPayload<'checkout:start'>>(
					'checkout:start',
					{}
				);
			}
		});
	}

	render(data: BasketViewData): HTMLElement {
		this.assertActive();
		this.list.replaceChildren(
			...(data.items.length ? data.items : [this.empty])
		);
		this.setText(this.title, `Корзина (${data.items.length})`);
		this.setText(this.price, `${data.total} синапсов`);
		this.checkout.disabled = data.checkoutDisabled || data.items.length === 0;
		return this.container;
	}
}
