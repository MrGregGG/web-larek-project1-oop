import { Component } from './Component';
import type { IEvents } from './events';
import type { FormViewState } from '../../types';
import { ensureElement } from '../../utils/utils';

/** Отображает готовую валидацию. Правила полей остаются в OrderModel. */
export abstract class Form<T extends object> extends Component<
	FormViewState<T>
> {
	private readonly inputs = new Map<
		Extract<keyof T, string>,
		HTMLInputElement
	>();
	private readonly submit: HTMLButtonElement;
	private readonly errors: HTMLElement;
	private disabled = true;

	protected constructor(
		container: HTMLFormElement,
		protected readonly events: IEvents,
		fields: readonly Extract<keyof T, string>[]
	) {
		super(container);
		this.submit = ensureElement<HTMLButtonElement>(
			'button[type="submit"]',
			container
		);
		this.errors = ensureElement<HTMLElement>('.form__errors', container);
		this.errors.setAttribute('role', 'alert');
		this.submit.disabled = true;
		for (const field of fields) {
			const input = ensureElement<HTMLInputElement>(
				`input[name="${field}"]`,
				container
			);
			input.disabled = true;
			this.inputs.set(field, input);
		}
		this.listen(container, 'input', (event) => {
			if (this.isEditingDisabled) return;
			for (const [field, input] of this.inputs) {
				if (event.target === input && !input.disabled) {
					this.onInput(field, input.value);
					return;
				}
			}
		});
		this.listen(container, 'submit', (event) => {
			event.preventDefault();
			if (!this.isEditingDisabled && !this.submit.disabled) this.onSubmit();
		});
	}

	protected get isEditingDisabled(): boolean {
		return this.disabled || this.isDestroyed;
	}

	protected abstract onInput(
		field: Extract<keyof T, string>,
		value: string
	): void;
	protected abstract onSubmit(): void;

	render(data: FormViewState<T>): HTMLElement {
		this.assertActive();
		this.disabled = data.disabled;
		this.submit.disabled = data.disabled || !data.validation.valid;
		for (const [field, input] of this.inputs) {
			const value = String(data.values[field] ?? '');
			// Не сбрасывать курсор при обратном render того же черновика.
			if (input.value !== value) input.value = value;
			input.disabled = data.disabled;
			input.setAttribute(
				'aria-invalid',
				String(Boolean(data.validation.errors[field]))
			);
		}
		const errors = Object.values(data.validation.errors).filter(
			(message): message is string =>
				typeof message === 'string' && message.length > 0
		);
		if (data.serverError) errors.push(data.serverError);
		this.setText(this.errors, errors.join(' '));
		return this.container;
	}
}
