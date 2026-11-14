export type ShopApiErrorCode =
	| 'invalid-data'
	| 'request-failed'
	| 'configuration'
	| 'contract-unavailable';

/** Публичное сообщение не содержит сырого ответа сервера или сетевых деталей. */
export class ShopApiError extends Error {
	constructor(readonly code: ShopApiErrorCode, message: string) {
		super(message);
		this.name = 'ShopApiError';
	}
}
