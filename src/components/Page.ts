import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload, PageViewData } from '../types';
import { createElement, ensureElement } from '../utils/utils';

export class Page extends Component<PageViewData> {
	private readonly gallery: HTMLElement;
	private readonly counter: HTMLElement;
	private readonly wrapper: HTMLElement;
	private readonly status: HTMLElement;
	private readonly retry: HTMLButtonElement;

	/** container — корень страницы, содержащий .page__wrapper (например body). */
	constructor(container: HTMLElement, private readonly events: IEvents) {
		super(container);
		this.gallery = ensureElement<HTMLElement>('.gallery', container);
		this.counter = ensureElement<HTMLElement>(
			'.header__basket-counter',
			container
		);
		this.wrapper = ensureElement<HTMLElement>('.page__wrapper', container);
		this.status = ensureElement<HTMLElement>('.page__status', container);
		this.retry = createElement<HTMLButtonElement>('button', {
			className: 'button page__retry',
			textContent: 'Повторить загрузку',
			type: 'button',
			hidden: true,
		});
		this.status.after(this.retry);
		this.retry.style.display = 'none';
		this.listen(this.retry, 'click', () => {
			if (!this.retry.hidden && !this.retry.disabled) {
				this.events.emit<AppEventPayload<'catalog:retry'>>('catalog:retry', {});
			}
		});
		const basket = ensureElement<HTMLButtonElement>(
			'.header__basket',
			container
		);
		this.listen(basket, 'click', () => {
			this.events.emit<AppEventPayload<'basket:open'>>('basket:open', {});
		});
	}

	render(data: PageViewData): HTMLElement {
		this.assertActive();
		this.gallery.replaceChildren(...data.catalog);
		this.setText(this.counter, data.counter);
		this.toggleClass(this.wrapper, 'page__wrapper_locked', data.locked);
		this.setText(this.status, data.statusMessage);
		this.status.hidden = data.statusMessage.length === 0;
		return this.container;
	}

	setCatalogRetry(visible: boolean, disabled = false): void {
		this.assertActive();
		this.retry.hidden = !visible;
		this.retry.style.display = visible ? '' : 'none';
		this.retry.disabled = disabled;
	}

	destroy(): void {
		if (this.isDestroyed) return;
		this.toggleClass(this.wrapper, 'page__wrapper_locked', false);
		this.retry.remove();
		super.destroy();
	}
}
