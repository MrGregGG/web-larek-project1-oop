import type { ApiListResponse } from '../components/base/api';
import type { IOrder, IOrderResult, IProduct } from './index';

/**
 * Наблюдённые поля GET /api/weblarek/product/ от 14.11.2026.
 * DTO и модель сейчас структурно совместимы, но преобразуются явно.
 * Входящие данные становятся DTO только после runtime-проверки.
 */
export type ServerProductDto = Pick<
	IProduct,
	'id' | 'title' | 'description' | 'image' | 'category' | 'price'
>;
export type ServerProductListDto = ApiListResponse<ServerProductDto>;

/** Подтверждённый пример POST /order из коллекции самого сервера. */
export type ServerOrderRequestDto = Omit<IOrder, 'payment'> & {
	payment: 'online';
};
export type ServerOrderResultDto = IOrderResult & { id: string };
