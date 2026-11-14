import { Form } from './base/Form';
import type { IEvents } from './base/events';
import type {
	AppEventPayload,
	OrderDraft,
	OrderFormData,
	PaymentMethod,
} from '../types';
import { ensureElement } from '../utils/utils';

export class OrderForm extends Form<Pick<OrderDraft, 'payment' | 'address'>> {
	private readonly payments: Record<PaymentMethod, HTMLButtonElement>;

	constructor(container: HTMLFormElement, events: IEvents) {
		super(container, events, ['address']);
		this.payments = {
			card: ensureElement<HTMLButtonElement>('button[name="card"]', container),
			cash: ensureElement<HTMLButtonElement>('button[name="cash"]', container),
		};
		for (const payment of ['card', 'cash'] as const) {
			const button = this.payments[payment];
			button.type = 'button';
			button.disabled = true;
			this.listen(button, 'click', () => {
				if (this.isEditingDisabled || button.disabled) return;
				this.events.emit<AppEventPayload<'order:change'>>('order:change', {
					field: 'payment',
					value: payment,
				});
			});
		}
	}

	protected onInput(field: 'payment' | 'address', value: string): void {
		if (field === 'address') {
			this.events.emit<AppEventPayload<'order:change'>>('order:change', {
				field,
				value,
			});
		}
	}

	protected onSubmit(): void {
		this.events.emit<AppEventPayload<'order:next'>>('order:next', {});
	}

	render(data: OrderFormData): HTMLElement {
		const element = super.render(data);
		for (const payment of ['card', 'cash'] as const) {
			const button = this.payments[payment];
			const selected = payment === data.values.payment;
			this.toggleClass(button, 'button_alt-active', selected);
			button.setAttribute('aria-pressed', String(selected));
			button.setAttribute(
				'aria-invalid',
				String(Boolean(data.validation.errors.payment))
			);
			button.disabled = data.disabled;
		}
		return element;
	}
}
