import { Component } from './base/Component';
import type { IEvents } from './base/events';
import type { AppEventPayload, IOrderResult } from '../types';
import { ensureElement } from '../utils/utils';

export class Success extends Component<IOrderResult> {
	private readonly description: HTMLElement;
	private readonly close: HTMLButtonElement;

	constructor(container: HTMLElement, private readonly events: IEvents) {
		super(container);
		this.description = ensureElement<HTMLElement>(
			'.order-success__description',
			container
		);
		this.close = ensureElement<HTMLButtonElement>(
			'.order-success__close',
			container
		);
		this.close.type = 'button';
		this.close.disabled = true;
		this.listen(this.close, 'click', () => {
			if (!this.close.disabled) {
				this.events.emit<AppEventPayload<'success:close'>>('success:close', {});
			}
		});
	}

	render(data: IOrderResult): HTMLElement {
		this.assertActive();
		this.setText(this.description, `Списано ${data.total} синапсов`);
		this.close.disabled = false;
		return this.container;
	}
}
