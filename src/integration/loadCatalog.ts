import type { ICatalogModel, IShopApi, ProductList } from '../types';

/** Узкий координирующий шаг загрузки; без UI и без создания инфраструктуры. */
export async function loadCatalog(
	shopApi: Pick<IShopApi, 'getProducts'>,
	catalog: ICatalogModel
): Promise<ProductList> {
	const products = await shopApi.getProducts();
	// Модель меняется только после проверки всего ответа адаптером.
	catalog.setItems(products.items);
	return products;
}
