import type { IOrder } from '../types';
import type { ServerOrderRequestDto, ServerOrderResultDto } from '../types/api';
import { ShopApiError } from './ShopApiError';

/** Преобразование подтверждено для online; полный enum оплаты неизвестен. */
export function createOrderRequestDto(
	order: Readonly<IOrder>
): ServerOrderRequestDto {
	if (order.payment === 'cash') {
		throw new ShopApiError(
			'contract-unavailable',
			'Серверный контракт оплаты при получении не подтверждён. Запрос не отправлен.'
		);
	}
	if (order.payment !== 'card') {
		throw new ShopApiError(
			'invalid-data',
			'Некорректный способ оплаты заказа.'
		);
	}
	if (
		[order.address, order.email, order.phone].some(
			(value) => typeof value !== 'string' || !value.trim()
		) ||
		!Array.isArray(order.items) ||
		order.items.length === 0 ||
		order.items.some((id: unknown) => typeof id !== 'string' || !id.trim()) ||
		new Set(order.items).size !== order.items.length ||
		typeof order.total !== 'number' ||
		!Number.isFinite(order.total) ||
		order.total < 0
	) {
		throw new ShopApiError(
			'invalid-data',
			'Некорректные данные заказа. Запрос не отправлен.'
		);
	}
	return {
		payment: 'online',
		address: order.address.trim(),
		email: order.email.trim(),
		phone: order.phone.trim(),
		total: order.total,
		items: [...order.items],
	};
}

export function parseOrderResultDto(
	value: unknown,
	expectedTotal: number
): ServerOrderResultDto {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new ShopApiError(
			'invalid-data',
			'Сервер не подтвердил структуру результата заказа.'
		);
	}
	if (
		!('id' in value) ||
		typeof value.id !== 'string' ||
		!value.id.trim() ||
		!('total' in value) ||
		typeof value.total !== 'number' ||
		!Number.isFinite(value.total) ||
		value.total < 0 ||
		value.total !== expectedTotal
	) {
		throw new ShopApiError(
			'invalid-data',
			'Сервер вернул некорректное подтверждение заказа.'
		);
	}
	return { id: value.id, total: value.total };
}
