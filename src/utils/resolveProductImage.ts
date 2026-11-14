import { ShopApiError } from '../services/ShopApiError';

function hasControlCharacters(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

/** Путь /5_Dots.svg относится к папке CDN, а не к корню origin. */
export function resolveProductImage(image: string, cdnUrl: string): string {
	let base: URL;
	try {
		base = new URL(cdnUrl);
	} catch {
		throw new ShopApiError('configuration', 'Некорректный адрес CDN.');
	}
	if (
		!['http:', 'https:'].includes(base.protocol) ||
		base.username ||
		base.password ||
		base.search ||
		base.hash
	) {
		throw new ShopApiError('configuration', 'Некорректный адрес CDN.');
	}
	if (
		!image.trim() ||
		hasControlCharacters(image) ||
		image.includes('\\') ||
		image !== image.trim()
	) {
		throw new ShopApiError('invalid-data', 'Некорректный путь изображения.');
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(image)) {
		let absolute: URL;
		try {
			absolute = new URL(image);
		} catch {
			throw new ShopApiError('invalid-data', 'Некорректный URL изображения.');
		}
		if (
			!/^https?:\/\//i.test(image) ||
			!['http:', 'https:'].includes(absolute.protocol) ||
			absolute.username ||
			absolute.password
		) {
			throw new ShopApiError('invalid-data', 'Недопустимый URL изображения.');
		}
		return image;
	}
	if (image.startsWith('//')) {
		throw new ShopApiError(
			'invalid-data',
			'Укажите явный протокол изображения.'
		);
	}
	const path = image.split(/[?#]/, 1)[0];
	const segments = path.split('/').filter(Boolean);
	if (segments.length === 0) {
		throw new ShopApiError('invalid-data', 'Отсутствует путь изображения.');
	}
	for (const segment of segments) {
		let decoded: string;
		try {
			decoded = decodeURIComponent(segment);
		} catch {
			throw new ShopApiError(
				'invalid-data',
				'Некорректная кодировка пути изображения.'
			);
		}
		if (
			decoded === '.' ||
			decoded === '..' ||
			decoded.includes('/') ||
			decoded.includes('\\') ||
			hasControlCharacters(decoded)
		) {
			throw new ShopApiError('invalid-data', 'Недопустимый путь изображения.');
		}
	}
	const basePath = base.pathname.split('/').filter(Boolean).join('/');
	const cleanPath = segments.join('/');
	const fullPath =
		basePath && !cleanPath.startsWith(`${basePath}/`)
			? `${basePath}/${cleanPath}`
			: cleanPath;
	return new URL(`/${fullPath}${image.slice(path.length)}`, base.origin).href;
}
