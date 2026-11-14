import type { IProduct, ProductList } from '../types';
import type { ServerProductDto, ServerProductListDto } from '../types/api';
import { resolveProductImage } from '../utils/resolveProductImage';
import { ShopApiError } from './ShopApiError';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, field: string, allowEmpty = false): string {
	if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
		throw new ShopApiError(
			'invalid-data',
			`Некорректное поле товара: ${field}.`
		);
	}
	return value;
}

function parsePrice(value: unknown): number | null {
	if (value === null) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new ShopApiError('invalid-data', 'Некорректное поле товара: price.');
	}
	return value;
}

function parseProductDto(value: unknown): ServerProductDto {
	if (!isRecord(value)) {
		throw new ShopApiError('invalid-data', 'Некорректная структура товара.');
	}
	return {
		id: readString(value.id, 'id'),
		title: readString(value.title, 'title'),
		description: readString(value.description, 'description', true),
		image: readString(value.image, 'image'),
		category: readString(value.category, 'category'),
		price: parsePrice(value.price),
	};
}

function parseProductListDto(value: unknown): ServerProductListDto {
	if (!isRecord(value) || !Array.isArray(value.items)) {
		throw new ShopApiError('invalid-data', 'Некорректная структура каталога.');
	}
	const total = value.total;
	if (
		typeof total !== 'number' ||
		!Number.isSafeInteger(total) ||
		total < 0 ||
		total !== value.items.length
	) {
		throw new ShopApiError(
			'invalid-data',
			'Каталог содержит несогласованное количество товаров.'
		);
	}
	const items = value.items.map((item: unknown) => parseProductDto(item));
	if (new Set(items.map((item) => item.id)).size !== items.length) {
		throw new ShopApiError(
			'invalid-data',
			'В каталоге повторяются идентификаторы товаров.'
		);
	}
	return { total, items };
}

/** Отделяет проверенный DTO от модели и отбрасывает посторонние поля JSON. */
export function normalizeProductList(
	value: unknown,
	cdnUrl: string
): ProductList {
	const dto = parseProductListDto(value);
	const items: IProduct[] = dto.items.map((product) => {
		// Проверяем разрешимость URL, сохраняя исходный путь по контракту модели.
		resolveProductImage(product.image, cdnUrl);
		return {
			id: product.id,
			title: product.title,
			description: product.description,
			image: product.image,
			category: product.category,
			price: product.price,
		};
	});
	return { total: dto.total, items };
}
