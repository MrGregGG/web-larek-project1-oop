import { Form } from './base/Form';
import type { IEvents } from './base/events';
import type { AppEventPayload, ContactFields } from '../types';

export class ContactsForm extends Form<ContactFields> {
	constructor(container: HTMLFormElement, events: IEvents) {
		super(container, events, ['email', 'phone']);
	}

	protected onInput(field: keyof ContactFields, value: string): void {
		this.events.emit<AppEventPayload<'contacts:change'>>('contacts:change', {
			field,
			value,
		});
	}

	protected onSubmit(): void {
		this.events.emit<AppEventPayload<'order:submit'>>('order:submit', {});
	}
}
