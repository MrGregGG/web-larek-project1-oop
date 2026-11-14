import type { Api } from '../components/base/api';
import type { IOrder, IOrderResult, IShopApi, ProductList } from '../types';
import { createOrderRequestDto, parseOrderResultDto } from './orderData';
import { normalizeProductList } from './productData';
import { ShopApiError } from './ShopApiError';

/** Предметный адаптер; все HTTP-запросы выполняет переданный существующий Api. */
export class ShopApi implements IShopApi {
	constructor(private readonly api: Api, private readonly cdnUrl: string) {}

	async getProducts(): Promise<ProductList> {
		const response = await this.request(
			() => this.api.get(this.uri('product/')),
			'Не удалось загрузить каталог. Повторите позже.'
		);
		return normalizeProductList(response, this.cdnUrl);
	}

	async submitOrder(order: Readonly<IOrder>): Promise<IOrderResult> {
		const dto = createOrderRequestDto(order);
		const response = await this.request(
			() => this.api.post(this.uri('order'), dto, 'POST'),
			'Не удалось получить подтверждение заказа. Данные сохранены; автоматический повтор не выполняется.'
		);
		const result = parseOrderResultDto(response, dto.total);
		return { total: result.total };
	}

	private uri(resource: string): string {
		return `${this.api.baseUrl.endsWith('/') ? '' : '/'}${resource}`;
	}

	private async request(
		operation: () => Promise<object>,
		message: string
	): Promise<unknown> {
		try {
			return await operation();
		} catch (error: unknown) {
			if (error instanceof SyntaxError) {
				throw new ShopApiError(
					'invalid-data',
					'Сервер вернул некорректный JSON.'
				);
			}
			throw new ShopApiError('request-failed', message);
		}
	}
}
