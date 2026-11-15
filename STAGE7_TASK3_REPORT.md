# WEB-ларёк — этап 7, задача №3: ESLint, типизация и null-safety

Дата: 15.11.2026. Проект №1, Яндекс Практикум, спринт 10 «Использование ООП».

**Результат для HEAD:** точечные исправления подготовлены; полный ESLint — 0 ошибок и 0 предупреждений, обычный и строгий TypeScript — PASS, адресные проверки — 30/30, прежние наборы 42/85/40/98/8 сохранены. Среда — Linux; DOM-наборы выполнены в jsdom. Новая приёмка Windows и решение HEAD ожидаются. Этап 7 целиком завершённым не объявляется.

## 1. Исходный Git и границы задачи

Перед изменениями проверены:

- HEAD: `7b1e18eb20f63e2b35a50f465a587b1530e2fdb6`;
- ветка: `integration/project1-stage6-app`;
- git status --porcelain: пуст, дерево чистое.

Состояние совпало с заданием, поэтому переключение веток или восстановление старой версии не потребовалось. Тот же SHA остаётся текущим HEAD после работы. Изменения находятся в рабочем дереве; индекс не заполнялся, **commit и push не выполнялись**.

src/app.ts и exception-safe destroy задачи №1 побайтно сохранены. Модели, View, ShopApi, Api/DTO, PaymentMethod, защита CASH, package.json, lock-файлы, Webpack, Babel и tsconfig не менялись. Исследование CASH не повторялось, реальных POST/заказов не было. Зависимости не устанавливались и не обновлялись. Другие задачи этапа 7 не начинались.

Windows-проверки базы взяты из сообщения пользователя: TypeScript PASS, 42 модели, 85 ShopApi, 40 AppPresenter, 98 UI, 8 production и build PASS. Они не выдаются за проверку нового рабочего дерева.

## 2. Воспроизведённые проблемы и причины

| Место в базе | Проблема | Причина |
| --- | --- | --- |
| events.ts:4 | Ошибка ESLint ban-types для Function | Тип не описывает вызываемую сигнатуру обработчика |
| events.ts:43 | Предупреждение non-null assertion | has проверял Map, а get принудительно объявлялся ненулевым через ! |
| utils.ts:5, 9 | Два предупреждения no-explicit-any | Предикат/проверка пустоты принимают произвольное значение, но им не нужен any |
| utils.ts:69 | Предупреждение no-unused-vars | В map извлекался неиспользуемый PropertyDescriptor |
| utils.ts:84 | Ошибка ESLint ban-types для Function | Не описаны вход и результат dataset-конвертера |
| utils.ts:49 | TypeScript TS18047 при --strict | firstElementChild может быть null, но cloneNode вызывается без проверки |

До исправлений npm run lint завершился exit 1: **2 ошибки, 4 предупреждения**. Команда `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck` завершилась exit 2 с единственной ошибкой TS18047.

Новый адресный DOM-набор сначала запущен на прежней реализации: **28/30**, две ошибки у пустого template и template только с текстом/комментарием. Вместо предусмотренной явной ошибки происходил TypeError при обращении к cloneNode у null. Остальные 28 сценариев, включая события, уже проходили и зафиксировали исходное поведение. До окончательного прогона форматирование нового тестового файла и тела двух вспомогательных методов приведены к ESLint; сценарии не менялись, SHA первоначального и итогового тестового файла различается.

## 3. Конкретные исправления

### EventEmitter

Function заменён существующим алиасом Subscriber с конкретной вызываемой сигнатурой:

```ts
type Subscriber = { handle(data: unknown): void }['handle'];
```

Сигнатура взята из метода, чтобы сохранить совместимость callback с конкретным типом payload при strictFunctionTypes. Простой тип `(data: unknown) => void` при строгой проверке отвергал бы существующие callback вида `(data: { id: string }) => void`. Новый тип не создаёт метод, объект или обёртку в runtime и не меняет идентичность callback. Он описывает уже имеющееся хранение разнотипных подписчиков в общей шине; соответствие имени события и payload не перепроектируется.

В off вместо `get(...)!.delete(...)` используется `get(...)?.delete(...)`. Остальные действия, удаление пустого Set и вызовы обработчиков не менялись. IEvents, on/emit/trigger, имена методов, onAll/offAll, порядок обхода Map/Set и передача исключений сохранены. Нет отключений ESLint, новых EventEmitter или механизмов подписки.

### Utils

- isSelector/isEmpty принимают unknown; проверки typeof/null/undefined остались прежними.
- В getObjectProperties map извлекает только используемое имя; фильтр и порядок результата сохранены.
- В getElementData Function заменён сигнатурой `(value: string | undefined) => T[keyof T]`: это вход dataset и результат одного из полей T. Сохраняются функция, generic T, два аргумента, объект схемы, обход dataset и возвращаемое T. String/Number-конвертеры проверены строгой компиляцией, runtime-преобразование не менялось.
- cloneTemplate сохраняет firstElementChild в переменную и проверяет её до cloneNode. Пустой шаблон вызывает `Error('Template does not contain an element')`; валидный первый элемент по-прежнему глубоко клонируется. Отсутствующий selector по-прежнему вызывает исходную ошибку ensureElement. Пустые DOM-узлы для маскировки ошибки не создаются, non-null assertion не добавляется.

## 4. Адресные регрессии

Добавлен отдельный tests/base.browser.mjs: **30 сценариев**. Существующие tests/app.browser.mjs, tests/checkout-ui.browser.mjs, tests/ui.browser.mjs и tests/production.browser.mjs не менялись.

Проверены обычные события, отсутствие payload, несколько обработчиков и порядок, Set-дедупликация, точный/повторный off, сохранение чужих подписчиков, onAll и envelope, wildcard, RegExp и его идентичность, offAll и повторная подписка, trigger и приоритет context, проброс исключений, добавление/снятие callback во время emit. Отдельно зафиксированы прежние особенности: RegExp с g сохраняет lastIndex, буквальное событие `*` вызывает подписчика дважды. Эти особенности не «исправлялись» вне объёма задачи.

Utils проверены на неизвестных значениях, пустом selector-результате, нескольких совпадениях и прежнем предупреждении, NodeList/массивах, глубоком клонировании, selector шаблона, пустом шаблоне и тексте/комментарии без элемента, descriptor-фильтре, dataset и фабрике DOM. Нет запросов к серверу магазина.

tests/base.types.ts отдельно компилируется в --strict: проверяет типизированные on/off, RegExp, интерфейс IEvents, wildcard-данные, trigger, предикат unknown и getElementData с Number/String. В tsconfig строгий режим не включался.

scripts/check-ui.mjs получил только ветку выбора `--base`. Все прежние режимы и способ сборки сохранены; новый набор использует существующий стенд и исходные зависимости.

## 5. Проверки после исправления

Среда: **Linux, Node.js v24.22.1, npm 11.9.0**. DOM-прогоны — существующий jsdom 26.1.0 вне зависимостей проекта. Это DOM-эмуляция, а не настоящий браузер или Windows. Тестовый fixture собран существующим check-ui; production-набор запускал настоящий пересобранный main.js через HTTP с контролируемым локальным API.

| Проверка | Результат |
| --- | --- |
| npm run lint | PASS, exit 0: 0 ошибок, 0 предупреждений ESLint |
| ESLint всего src с --max-warnings=0 | PASS, exit 0 |
| ESLint tests/base.browser.mjs, tests/base.types.ts, scripts/check-ui.mjs с --max-warnings=0 | PASS, exit 0 |
| node node_modules/typescript/bin/tsc --noEmit | PASS, exit 0 |
| node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck | PASS, exit 0; tsconfig не изменён |
| Строгая компиляция tests/base.types.ts | PASS, exit 0 |
| node scripts/check-models.mjs | 42/42, ошибок 0 |
| node scripts/check-shop-api.mjs | 85/85, ошибок 0; контролируемые ответы |
| Новые базовые проверки, --base | 30/30, ошибок 0, runtime-ошибок 0 |
| AppPresenter, --stage6 | 40/40, ошибок 0, runtime-ошибок 0 |
| UI этапа 5, --stage5 | 98/98, ошибок 0, runtime-ошибок 0 |
| Production main.js / контролируемый HTTP API | 8/8, ошибок 0; внешних POST 0 |
| npm run build | PASS, exit 0, прежние 5 предупреждений Webpack |
| node scripts/check-app.mjs --check-only | PASS, main.js 95 705 байт; HTML подключает приложение |
| git diff --check | PASS |

Пять предупреждений сборки относятся к прежним Sass API/lighten, размеру шрифтов и рекомендациям производительности. npm сообщает предупреждение настройки окружения http-proxy; это не предупреждение ESLint. Конфигурация и зависимости ради этих сообщений не менялись.

SHA-256 production main.js: `1f0160758bd208eb0dac087a54f612bb12415330795505e4950e7629fca02f11`.

Сохранены docs/testing/stage7-task3-base-before.json, stage7-task3-base-after.json, stage7-task3-app-dom.json, stage7-task3-ui-regression.json, stage7-task3-production-dom.json и stage7-task3-checks.json. Последний файл содержит результаты до/после, среду и контрольные суммы защищённых файлов. Базовый набор 38 сценариев в этой задаче заново не запускался; его исходник сохранён, прежнее Windows-подтверждение остаётся историческим.

Для HEAD на Windows:

```powershell
npm run lint
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2017 --module commonjs --moduleResolution node tests/base.types.ts
node scripts/check-models.mjs
node scripts/check-shop-api.mjs
node scripts/check-ui.mjs --base --serve
```

Открыть UI_FIXTURE_URL, ожидание **30/30**, затем остановить сервер Ctrl+C. Аналогично последовательно выполнить `--stage6 --serve` и `--stage5 --serve`: ожидание **40/40** и **98/98**. Выполнить npm run build, node scripts/check-app.mjs --check-only, затем node scripts/check-app.mjs и открыть **CONTROLLED_CHECK_URL**, ожидание **8/8**. Реальные заказы не отправлять. Выполнить git diff --check. Эти команды — инструкция повторной проверки, а не заявление о выполненном новом Windows-прогоне.

## 6. Изменённые файлы

Изменены пять существующих файлов:

- src/components/base/events.ts — только тип Subscriber и безопасный get в off;
- src/utils/utils.ts — две замены any, вызываемая сигнатура конвертера, удаление неиспользуемой переменной, проверка пустого template;
- scripts/check-ui.mjs — только выбор --base;
- PROJECT_ARCHITECTURE.md — фактический статус и описание доводки, без изменения архитектуры;
- STAGE7_AUDIT_PLAN.md — отмечены исправленные lint/null-проблемы и пределы новых проверок.

Созданы tests/base.browser.mjs, tests/base.types.ts, этот STAGE7_TASK3_REPORT.md и шесть JSON результатов. Итого **14 файлов рабочего дерева**. Игнорируемый dist пересобран и соответствует текущим исходникам; его файлы не добавлялись в индекс.

Контрольные суммы остальных 193 исходно отслеживаемых файлов сравнены с базой и совпадают. В частности, src/app.ts, модели, Api/ShopApi, DTO, прикладные типы, все View, HTML/SCSS, принятые тесты и конфигурации сохранены. Старые файлы и история не удалялись.

## 7. Git diff

Ниже читаемая копия diff production-исходников и единственного изменения тестового runner: в Markdown табуляции заменены пробелами, пробельные строки очищены. Точный patch сохраняется отдельно. Новые тесты и доказательства находятся в перечисленных файлах; они не подменяют production entry. Полный diff рабочего дерева, включая новые файлы, передаётся отдельно как STAGE7_TASK3_REVIEW.diff в архиве для HEAD.

```diff
diff --git a/scripts/check-ui.mjs b/scripts/check-ui.mjs
index 84b6cfe..57d6c73 100644
--- a/scripts/check-ui.mjs
+++ b/scripts/check-ui.mjs
@@ -20,7 +20,9 @@ const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
 const temporary = mkdtempSync(join(tmpdir(), 'web-larek-ui-'));
 const site = join(temporary, 'site');
 const keepServing = process.argv.includes('--serve');
-const suite = process.argv.includes('--stage6')
+const suite = process.argv.includes('--base')
+   ? 'base.browser.mjs'
+   : process.argv.includes('--stage6')
    ? 'app.browser.mjs'
    : process.argv.includes('--stage5')
    ? 'checkout-ui.browser.mjs'
diff --git a/src/components/base/events.ts b/src/components/base/events.ts
index 35fec29..50eb9b7 100644
--- a/src/components/base/events.ts
+++ b/src/components/base/events.ts
@@ -1,7 +1,8 @@
 // Хорошая практика даже простые типы выносить в алиасы
 // Зато когда захотите поменять это достаточно сделать в одном месте
 type EventName = string | RegExp;
-type Subscriber = Function;
+// Общая шина хранит разные payload; метод сохраняет совместимость typed on/off.
+type Subscriber = { handle(data: unknown): void }['handle'];
 type EmitterEvent = {
     eventName: string,
     data: unknown
@@ -40,7 +41,7 @@ export class EventEmitter implements IEvents {
      */
     off(eventName: EventName, callback: Subscriber) {
         if (this._events.has(eventName)) {
-            this._events.get(eventName)!.delete(callback);
+            this._events.get(eventName)?.delete(callback);
             if (this._events.get(eventName)?.size === 0) {
                 this._events.delete(eventName);
             }
diff --git a/src/utils/utils.ts b/src/utils/utils.ts
index 814a655..a8b38af 100644
--- a/src/utils/utils.ts
+++ b/src/utils/utils.ts
@@ -2,11 +2,11 @@ export function pascalToKebab(value: string): string {
     return value.replace(/([a-z0–9])([A-Z])/g, "$1-$2").toLowerCase();
 }

-export function isSelector(x: any): x is string {
+export function isSelector(x: unknown): x is string {
     return (typeof x === "string") && x.length > 1;
 }

-export function isEmpty(value: any): boolean {
+export function isEmpty(value: unknown): boolean {
     return value === null || value === undefined;
 }

@@ -46,7 +46,9 @@ export function ensureElement<T extends HTMLElement>(selectorElement: SelectorEl

 export function cloneTemplate<T extends HTMLElement>(query: string | HTMLTemplateElement): T {
     const template = ensureElement(query) as HTMLTemplateElement;
-    return template.content.firstElementChild.cloneNode(true) as T;
+    const element = template.content.firstElementChild;
+    if (!element) throw new Error('Template does not contain an element');
+    return element.cloneNode(true) as T;
 }

 export function bem(block: string, element?: string, modifier?: string): { name: string, class: string } {
@@ -66,7 +68,7 @@ export function getObjectProperties(obj: object, filter?: (name: string, prop: P
         )
     )
         .filter(([name, prop]: [string, PropertyDescriptor]) => filter ? filter(name, prop) : (name !== 'constructor'))
-        .map(([name, prop]) => name);
+        .map(([name]) => name);
 }

 /**
@@ -81,7 +83,7 @@ export function setElementData<T extends Record<string, unknown> | object>(el: H
 /**
  * Получает типизированные данные из dataset атрибутов элемента
  */
-export function getElementData<T extends Record<string, unknown>>(el: HTMLElement, scheme: Record<string, Function>): T {
+export function getElementData<T extends Record<string, unknown>>(el: HTMLElement, scheme: Record<string, (value: string | undefined) => T[keyof T]>): T {
     const data: Partial<T> = {};
     for (const key in el.dataset) {
         data[key as keyof T] = scheme[key](el.dataset[key]);
@@ -132,4 +134,4 @@ export function createElement<
         }
     }
     return element;
-}
\ No newline at end of file
+}
```

Git status после работы ожидаемо содержит только перечисленные 14 разрешённых изменений; индекс пуст, HEAD остаётся `7b1e18eb20f63e2b35a50f465a587b1530e2fdb6`. Номер нового коммита отсутствует, потому что коммит без согласования HEAD запрещён. ZIP WEB_LAREK_STAGE7_TASK3_REVIEW.zip содержит полный рабочий проект, новые проверки/отчёт, соответствующий dist и review-diff, без внешней папки, node_modules, .git и реальных env-файлов. Архив включает именно рабочие изменения поверх указанной базы, а не только содержимое старого HEAD.

## 8. Оставшиеся пункты и передача HEAD

Доказанные 2 lint-ошибки, 4 предупреждения и TS18047 устранены; все обязательные доступные проверки прошли. Новый Windows-прогон и принятие текущих правок остаются за HEAD. Защита CASH сохранена, поскольку серверный контракт не подтверждён. Прежние предупреждения production-сборки не относятся к исправленным lint/null-дефектам. Сдачная документация, публикация и остальные задачи этапа 7 не выполнялись.

**Результат передаётся HEAD на проверку. Commit и push требуют отдельного разрешения.**
