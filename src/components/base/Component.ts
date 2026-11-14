/** Общие DOM-операции и освобождение собственных обработчиков View. */
export abstract class Component<T> {
	private disposers: Array<() => void> = [];
	private destroyed = false;

	protected constructor(protected readonly container: HTMLElement) {}

	abstract render(data: T): HTMLElement;

	protected get isDestroyed(): boolean {
		return this.destroyed;
	}

	protected assertActive(): void {
		if (this.destroyed) throw new Error('Компонент уже уничтожен.');
	}

	protected listen<K extends keyof HTMLElementEventMap>(
		element: HTMLElement,
		type: K,
		handler: (event: HTMLElementEventMap[K]) => void
	): void {
		this.assertActive();
		element.addEventListener(type, handler);
		this.disposers.push(() => element.removeEventListener(type, handler));
	}

	protected setText(element: HTMLElement, value: string | number): void {
		element.textContent = String(value);
	}

	protected setImage(
		element: HTMLImageElement,
		source: string,
		alt: string
	): void {
		element.src = source;
		element.alt = alt;
	}

	protected toggleClass(
		element: HTMLElement,
		name: string,
		enabled: boolean
	): void {
		element.classList.toggle(name, enabled);
	}

	destroy(): void {
		if (this.destroyed) return;
		for (const dispose of this.disposers) dispose();
		this.disposers = [];
		this.destroyed = true;
	}
}
