/* Только компиляция --strict: прежние вызовы типизированных on/off и утилит. */
import { EventEmitter, IEvents } from '../src/components/base/events';
import { getElementData, isEmpty, isSelector } from '../src/utils/utils';

export function checkPublicCalls(element: HTMLElement, input: unknown): void {
	const events = new EventEmitter();
	const broker: IEvents = events;
	const handler = (payload: { id: string }): void => {
		payload.id.toUpperCase();
	};
	broker.on('item', handler);
	events.off('item', handler);
	broker.on(/^item:/, handler);
	events.off(/^item:/, handler);
	events.onAll(({ eventName, data }) => {
		const name: string = eventName;
		const payload: unknown = data;
		void name;
		void payload;
	});
	const trigger: (payload: { id: string }) => void = broker.trigger('item');
	trigger({ id: 'one' });
	const data = getElementData<{ count: number; name: string }>(element, {
		count: Number,
		name: String,
	});
	data.count.toFixed();
	data.name.toUpperCase();
	if (isSelector(input)) input.toUpperCase();
	isEmpty(input);
}
