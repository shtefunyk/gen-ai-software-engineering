# Homework 4 — Конвеєр із 4 агентів (Design Spec)

**Дата:** 2026-05-20
**Завдання:** `homework-4/TASKS.md` — 4-Agent Pipeline
**Автор спеки:** узгоджено в режимі brainstorming

---

## 1. Мета

Побудувати конвеєр із 4 агентів (Bug Research Verifier, Bug Fixer, Security
Vulnerabilities Verifier, Unit Test Generator), який:

- запускається **однією командою**, стартує агентів у правильному порядку й
  автоматично підвантажує повʼязані скіли;
- має **явний вибір моделі** під кожен агент із обґрунтуванням;
- працює на **самодостатньому міні-застосунку** з навмисними багами та
  security-проблемою, демонструючи стан before → after.

---

## 2. Рішення, ухвалені під час brainstorming

| Питання | Рішення |
|---|---|
| Стек міні-застосунку | **Node.js + Express REST API** |
| Тестовий фреймворк | **vitest + supertest** |
| Механізм «однієї команди» | **Гібрид:** slash-команда `/run-pipeline` як оркестратор + тонка обгортка `run-pipeline.sh` (`claude -p "/run-pipeline"`) |
| Обсяг пайплайну | **4 обовʼязкові агенти**; виходи Researcher/Planner подаються як пресіджені вхідні артефакти |
| Розподіл моделей | Research Verifier → **opus 4.7**; Bug Fixer → **sonnet 4.6**; Security Verifier → **opus 4.7**; Unit Test Generator → **haiku 4.5** |

### Обґрунтування моделей (для README)

- **Research Verifier — opus 4.7:** ретельний фактчек кожного `file:line`,
  співставлення снапшотів коду — потребує найсильнішого reasoning, ціна
  виправдана точністю.
- **Bug Fixer — sonnet 4.6:** застосування вже готового плану — рутинні,
  детерміновані правки; баланс якість/швидкість.
- **Security Verifier — opus 4.7:** глибокий security-reasoning (виявлення
  injection / path traversal / insecure comparisons) — ціна помилки висока.
- **Unit Test Generator — haiku 4.5:** скафолдинг тестів за чітким шаблоном і
  FIRST-скілом — швидко й дешево, обсяг роботи добре окреслений.

---

## 3. Міні-застосунок (Task 5) — «Notes API»

Крихітний Express REST-сервіс з in-memory сховищем нотаток + читання файлу
бекапу нотатки з диска.

### Ендпоінти

- `POST /notes` — створити нотатку (`id`, `title`, `body`, `tag`, `createdAt`)
- `GET /notes/:id` — отримати за id
- `GET /notes?tag=&limit=&offset=` — список із фільтром і пагінацією
- `DELETE /notes/:id` — видалити
- `GET /notes/:id/backup?file=` — прочитати файл бекапу з `data/`

### Навмисні дефекти (before-стан)

- **Bug 1 (логіка):** фільтр за `tag` використовує loose-порівняння /
  неправильне поле → повертає всі нотатки замість відфільтрованих.
- **Bug 2 (логіка):** пагінація — `parseInt(limit)` без guard на `NaN` /
  відʼємні значення → off-by-one зріз і падіння на некоректному вводі.
- **Security (CRITICAL): path traversal** у `GET /notes/:id/backup?file=` —
  `fs.readFile(path.join(dataDir, req.query.file))` без санітизації →
  `?file=../../etc/passwd`.

### Команди

- `npm start` — підняти сервер
- `npm test` — прогнати тести (vitest + supertest)

### Демо-цикл before/after

`npm test` **до** пайплайну падає (баги) → пайплайн застосовує фікси →
`npm test` **після** зелений + додані згенеровані тести.

---

## 4. Структура каталогів

```
homework-4/
├── README.md                 # overview, how-to-run, обґрунтування моделей, author info
├── HOWTORUN.md
├── package.json              # scripts: start, test, pipeline
├── run-pipeline.sh           # тонка обгортка: claude -p "/run-pipeline"
├── .claude/
│   ├── commands/
│   │   └── run-pipeline.md            # оркестратор (slash-команда)
│   ├── agents/                        # рантайм-копії (для Task tool диспатчу)
│   │   ├── research-verifier.md
│   │   ├── bug-fixer.md
│   │   ├── security-verifier.md
│   │   └── unit-test-generator.md
│   └── skills/                        # рантайм-копії скілів
│       ├── research-quality-measurement.md
│       └── unit-tests-FIRST.md
├── agents/                            # КАНОНІЧНІ деліверабли (за TASKS.md)
│   ├── research-verifier.agent.md     # model: opus 4.7
│   ├── bug-fixer.agent.md             # model: sonnet 4.6
│   ├── security-verifier.agent.md     # model: opus 4.7
│   └── unit-test-generator.agent.md   # model: haiku 4.5
├── skills/                            # КАНОНІЧНІ деліверабли
│   ├── research-quality-measurement.md
│   └── unit-tests-FIRST.md
├── context/bugs/001-notes-api/
│   ├── bug-context.md
│   ├── research/
│   │   ├── codebase-research.md       # пресід (з 1 навмисною розбіжністю)
│   │   └── verified-research.md       # ← вихід агента 1
│   ├── implementation-plan.md         # пресід
│   ├── fix-summary.md                 # ← вихід агента 2
│   ├── security-report.md             # ← вихід агента 3
│   └── test-report.md                 # ← вихід агента 4
├── src/                               # код Express-застосунку
├── tests/                             # згенеровані тести
└── docs/screenshots/
```

**Звʼязок `agents/` ↔ `.claude/agents/`:** канонічні визначення — у
`agents/*.agent.md` (деліверабл за завданням). Рантайм-копії з ідентичним
вмістом — у `.claude/agents/*.md`, щоб Task tool міг диспатчити їх за іменем із
потрібною моделлю. Обидва набори комітимо; звʼязок пояснено в README. Скіли —
аналогічно (`skills/` ↔ `.claude/skills/`).

---

## 5. Оркестрація

### `/run-pipeline` (`.claude/commands/run-pipeline.md`)

Оркестратор. При виклику послідовно диспатчить 4 subagents через Task tool,
кожен зі своєю моделлю (з frontmatter) і автопідвантаженням свого скіла:

1. `research-verifier` (opus 4.7) → читає `codebase-research.md`, застосовує
   скіл `research-quality-measurement`, пише `verified-research.md`.
2. `bug-fixer` (sonnet 4.6) → читає `implementation-plan.md`, править `src/`,
   ганяє `npm test`, пише `fix-summary.md`.
3. `security-verifier` (opus 4.7) → читає `fix-summary.md` + змінені файли,
   пише `security-report.md` (без правок коду).
4. `unit-test-generator` (haiku 4.5) → читає `fix-summary.md`, застосовує скіл
   `unit-tests-FIRST`, генерує тести в `tests/`, ганяє їх, пише
   `test-report.md`.

Команда перевіряє наявність артефактів-входів, зупиняється на помилці кроку й
виводить підсумок.

### `run-pipeline.sh`

Тонка обгортка: перевіряє наявність `claude` CLI, потім `claude -p
"/run-pipeline"`. `npm run pipeline` → той самий скрипт. Так виконано і «як
команду», і буквальну вимогу TASKS.md «runnable via one command».

---

## 6. Скіли

### `skills/research-quality-measurement.md` (Task 1.2)

Визначає рівні якості дослідження:

- `VERIFIED` — 100% `file:line` підтверджено, снапшоти збігаються.
- `MOSTLY-VERIFIED` — ≥80% підтверджено, дрібні неточності.
- `PARTIALLY-VERIFIED` — 50–80%, є суттєві розбіжності.
- `UNRELIABLE` — <50% підтверджено.

Критерії: % підтверджених посилань, відповідність снапшотів коду джерелу.
Research Verifier зобовʼязаний проставляти рівень у `verified-research.md`.

**Required-секції `verified-research.md`:** Verification Summary (pass/fail,
Research Quality per skill), Verified Claims, Discrepancies Found, Research
Quality Assessment (level + reasoning), References.

### `skills/unit-tests-FIRST.md` (Task 4.2)

Визначає **FIRST**: **F**ast, **I**ndependent, **R**epeatable,
**S**elf-validating, **T**imely + чекліст. Unit Test Generator застосовує цей
скіл і посилається на нього в `test-report.md`.

---

## 7. Обробка помилок і тестування

- `run-pipeline.sh`: `set -e`, перевірка наявності `claude` CLI, явні
  повідомлення про кожен крок.
- Slash-команда: перевірка наявності вхідних артефактів перед кожним кроком,
  зупинка на помилці, фінальний підсумок статусів.
- Демо-цикл before/after як у розділі 3.

---

## 8. Скриншоти — що і коли захоплювати

Усі файли → `homework-4/docs/screenshots/`.

| # | Файл | Коли робити | Що показати |
|---|---|---|---|
| 1 | `02-tests-before.png` | **Етап 0 — ДО пайплайну** | `npm test` падає (навмисні баги). *Єдиний нерепродукований кадр — обовʼязково спершу.* |
| 2 | `01-pipeline-run.png` | Етап 1 — запуск | `./run-pipeline.sh` / `/run-pipeline`: старт усіх 4 агентів + підсумок |
| 3 | `07-verified-research.png` | після Research Verifier | `verified-research.md`: рівень якості за скілом + знайдена розбіжність |
| 4 | `04-fix-summary.png` | після Bug Fixer | `fix-summary.md`: before/after правки |
| 5 | `03-tests-after.png` | після Bug Fixer | `npm test` зелений |
| 6 | `05-security-report.png` | після Security Verifier | path traversal: CRITICAL + file:line + remediation |
| 7 | `06-test-report.png` | після Unit Test Generator | `test-report.md` + новий тест у `tests/`, зелений прогон |
| 8 | `08-agent-models.png` | наприкінці (бонус) | frontmatter `.agent.md` / лог: opus / sonnet / haiku |

Скриншоти 1–7 покривають буквальну вимогу TASKS.md (pipeline run, fixes,
security scan, unit tests); №8 підсилює (демонструє per-agent вибір моделі).

**Правила:** видно повну команду + результат в одному кадрі; читабельний текст;
вбудувати в README та PR із підписами; показати наскрізну before/after історію.

---

## 9. Deliverables (за TASKS.md)

- 4 агенти в `agents/` + 2 скіли в `skills/`.
- Міні-застосунок у `src/` з пресідженими багами/вразливістю.
- Робочий застосунок із застосованими фіксами.
- Виходи агентів: `verified-research.md`, `fix-summary.md`,
  `security-report.md`, `test-report.md` (+ пресіджені research / plan).
- Скриншоти в `docs/screenshots/` (розділ 8).
- README (overview, запуск пайплайну й застосунку, обґрунтування моделей,
  author/student info) + HOWTORUN.
- PR із summary та вбудованими скриншотами; коміт агентної папки в репозиторій.

---

## 10. Поза обсягом (YAGNI)

- Окремі агенти Bug Researcher / Bug Planner (їхні виходи пресіджено).
- Анотації, що не потрібні для демонстрації пайплайну.
- Будь-який рефакторинг попередніх homework.
