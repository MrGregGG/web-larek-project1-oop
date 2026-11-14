import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload } from '../types';
import { ensureElement } from '../utils/utils';

export class Modal extends Component<{ content: HTMLElement }> {
	private readonly content: HTMLElement;

	constructor(container: HTMLElement, private readonly events: IEvents) {
		super(container);
		this.content = ensureElement<HTMLElement>('.modal__content', container);
		const close = ensureElement<HTMLButtonElement>('.modal__close', container);
		this.container.setAttribute('role', 'dialog');
		this.container.setAttribute('aria-modal', 'true');
		this.container.setAttribute('aria-hidden', String(!this.isOpen));
		this.listen(close, 'click', () => this.close());
		this.listen(container, 'click', (event) => {
			if (event.target === container) this.close();
		});
	}

	private get isOpen(): boolean {
		return this.container.classList.contains('modal_active');
	}

	render(data: { content: HTMLElement }): HTMLElement {
		this.assertActive();
		this.content.replaceChildren(data.content);
		return this.container;
	}

	open(): void {
		this.assertActive();
		if (this.isOpen) return;
		this.toggleClass(this.container, 'modal_active', true);
		this.container.setAttribute('aria-hidden', 'false');
		this.events.emit<AppEventPayload<'modal:opened'>>('modal:opened', {});
	}

	close(): void {
		if (this.isDestroyed || !this.isOpen) return;
		this.toggleClass(this.container, 'modal_active', false);
		this.container.setAttribute('aria-hidden', 'true');
		this.events.emit<AppEventPayload<'modal:closed'>>('modal:closed', {});
	}

	destroy(): void {
		if (this.isDestroyed) return;
		try {
			this.close();
		} finally {
			this.content.replaceChildren();
			super.destroy();
		}
	}
}
