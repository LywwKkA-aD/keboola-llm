# Agent Studio: быстрый старт (Windows)

Agent Studio — локальное приложение: команда ИИ-агентов, которая работает с вашим проектом Keboola. Лид принимает
задачу, раздаёт её специалистам (поиск, объяснение трансформаций, ревью SQL, производительность, безопасность,
изменения на dev-ветке) и собирает ответ. Всё работает на вашем компьютере; в интернет уходят только запросы к модели
через OmniRoute и вызовы Keboola через kbagent.

**Права администратора не нужны:** всё ставится в профиль пользователя. Установка занимает 20-30 минут один раз.
Команды ниже выполняются в PowerShell.

**Как вставлять команды:** каждый блок можно вставлять целиком, одной вставкой; PowerShell выполнит строки по очереди.
Где в команде есть `<...>` (например, адрес стека), сначала подставьте своё значение. Команды входа
(`kbagent auth login`) и запуска (`npm start`) не завершаются сразу: первая ждёт подтверждения в браузере, вторая
работает, пока открыто окно.

## 1. Node.js

Проверьте, что Node.js уже есть и подходящей версии:

```powershell
node -v
```

Нужна версия 24 (подойдут и 22.22+ или 26, но проверена 24). Если Node.js нет или версия старше, поставьте его без
администратора из архива:

1. На https://nodejs.org/en/download выберите Windows, версию 24 (LTS) и «Standalone Binary (.zip)».
2. Распакуйте архив так, чтобы `node.exe` лежал прямо в папке `%LOCALAPPDATA%\Programs\node`.
3. Добавьте Node.js и папку глобальных npm-пакетов в свой PATH:

   ```powershell
   $node = "$env:LOCALAPPDATA\Programs\node"
   $path = [Environment]::GetEnvironmentVariable('Path', 'User')
   [Environment]::SetEnvironmentVariable('Path', "$node;$env:APPDATA\npm;$path", 'User')
   ```

4. Закройте и снова откройте PowerShell и проверьте `node -v`.
5. Снимите с файлов Node.js пометку «скачано из интернета», иначе PowerShell при каждом `npm` будет спрашивать
   «Security warning … Do you want to run npm.ps1?» (администратор не нужен):

   ```powershell
   Get-ChildItem (Split-Path (Get-Command node).Source) -Recurse | Unblock-File
   ```

## 2. OmniRoute (доступ к моделям)

Если OmniRoute ещё не стоит:

```powershell
npm install -g omniroute
```

Если уже стоит и работает, проверьте три вещи:

1. Файл `%USERPROFILE%\.omniroute\.env` содержит эти две строки, иначе к OmniRoute можно подключиться из локальной
   сети и тратить ваши запросы:

   ```
   OMNIROUTE_SERVER_HOST=127.0.0.1
   REQUIRE_API_KEY=true
   ```

2. В панели OmniRoute (обычно http://127.0.0.1:20128) подключён провайдер, через которого вы работаете с моделью
   (например, Sol).
3. В разделе Endpoints создан API-ключ. Он понадобится в шаге 5.

Запускайте `omniroute` и не закрывайте его окно, пока работаете с приложением.

## 3. Keboola CLI (kbagent)

kbagent — официальная командная строка Keboola (https://github.com/keboola/cli). Агенты работают с Keboola только
через неё; вход и токены хранит kbagent, приложение их не видит. Ставится без администратора, одним из двух способов.

### Способ A: через uv (рекомендуется, kbagent сам обновляется)

Вставьте блок целиком в одно окно PowerShell. Первая строка ставит uv в `%USERPROFILE%\.local\bin` (если uv уже
есть, она его просто обновит), остальные — kbagent по официальной инструкции Keboola. Python отдельно ставить не нужно:
uv скачает его сам.

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
$ver = (Invoke-RestMethod "https://pypi.org/pypi/keboola-cli/json").info.version
uv tool install --force "keboola-cli[server] @ https://github.com/keboola/cli/releases/download/v$ver/keboola_cli-$ver-py3-none-any.whl"
if ($LASTEXITCODE -ne 0 -and $ver) { uv tool install --force "keboola-cli[server]==$ver" }
if ($LASTEXITCODE -ne 0) { uv tool install --force "keboola-cli[server]" }
uv tool update-shell
```

В этом окне kbagent уже работает; новые окна PowerShell увидят его благодаря последней строке.

### Способ B: готовая сборка без Python и uv

1. На https://github.com/keboola/cli/releases откройте последний релиз и скачайте
   `keboola-cli2_<версия>_windows_amd64.zip`.
2. Распакуйте в `%LOCALAPPDATA%\Programs\kbagent` так, чтобы `kbagent.exe` лежал прямо в этой папке.
3. Добавьте папку в свой PATH и откройте PowerShell заново:

   ```powershell
   $kb = "$env:LOCALAPPDATA\Programs\kbagent"
   [Environment]::SetEnvironmentVariable('Path', "$kb;" + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')
   ```

Эта сборка сама не обновляется: для новой версии скачайте новый архив и замените папку.

### Проверка и вход

```powershell
kbagent --version
```

Войдите в Keboola. Адрес стека — начало адреса, который вы видите в Keboola в браузере, например
`https://connection.eu-central-1.keboola.com` или `https://connection.north-europe.azure.keboola.com`:

```powershell
kbagent auth login --stack https://connection.<ваш-стек>.keboola.com --register-projects
```

Откроется браузер: войдите и подтвердите доступ. Затем проверьте:

```powershell
kbagent auth status      # вход выполнен
kbagent project list     # ваши проекты и их короткие имена (alias): одно из них вы выберете в шаге 5
kbagent doctor           # общая проверка
```

**Если вход через браузер недоступен** (или компания выдаёт токены Storage API), подключите проект токеном. Токен
вводится скрыто, в истории команд он не останется:

```powershell
kbagent project add --project <короткое-имя> --url https://connection.<ваш-стек>.keboola.com --token-stdin
```

**Обновление:** при способе A kbagent обновляется сам при запуске; при способе B — новым архивом. Приложение знает
команды той версии kbagent, с которой его проверяли; незнакомые команды новой версии оно просто не даёт агентам
выполнять, так что обновлять kbagent безопасно.

## 4. Приложение

Нужен доступ к репозиторию на GitHub (приглашение придёт на почту). Скачайте его одним из способов.

**GitHub Desktop (проще всего, обновления одной кнопкой).** Скачайте с https://desktop.github.com и установите: он
ставится без администратора, Git уже внутри. Войдите в свой аккаунт GitHub, затем File → Clone repository →
`LywwKkA-aD/keboola-llm` → Clone. По умолчанию папка будет `Документы\GitHub\keboola-llm`.

**Git**, если он уже есть:

```powershell
cd $HOME
git clone https://github.com/LywwKkA-aD/keboola-llm.git
```

**Без Git:** на странице репозитория Code → Download ZIP, распакуйте в удобную папку. Обновляться так неудобнее
(см. «Обновление»).

Затем в PowerShell перейдите в папку приложения и запустите его:

```powershell
cd "$HOME\Documents\GitHub\keboola-llm"   # или папка, куда вы его скачали
npm install
npm start
```

Откройте http://127.0.0.1:4800. Окно PowerShell с `npm start` не закрывайте, пока работаете; остановка — Ctrl+C.

## 5. Настройка в приложении

На главной слева появится карточка «Завершите настройку». Пройдите шаги сверху вниз:

1. **OmniRoute запущен** — должно быть зелёным, если окно с `omniroute` открыто.
2. **Ключ OmniRoute** — вставьте ключ из шага 2 и нажмите «Сохранить ключ».
3. **Модель** — выберите модель (например, Sol). В списке только модели подключённого провайдера.
4. **kbagent установлен** и **Проект Keboola подключён** — зелёные после шага 3.
5. **Проект для команды** — выберите проект, с которым работаете.
6. **Что команде можно в Keboola** — приложение само читает вашу роль и возможности проекта и решает, как изменения
   попадают в прод.

Когда всё зелёное, карточка исчезнет. Те же шаги есть в «Настройках».

## 6. Первое знакомство с проектом

На главной нажмите «Инициализация проекта» (или напишите в чате `/init`). Команда только читает: составит карту
проекта (слои, трансформации, флоу, расписания) и документацию по продовым трансформациям в базе знаний. Это может
занять время; потом команда отвечает на вопросы о проекте быстрее и точнее.

## Как работать

- Пишите задачу в чат на главной или на странице «Чаты» обычным языком.
- `/` в начале сообщения открывает команды: `/skill` (выполнить по навыку), `/agent` (отдать конкретному агенту),
  `/plan` (сначала согласовать план), `/init`, `/sql on|off`, `/new`, `/help`.
- **Без вашего «Подтвердить» ничего не меняется.** Каждая запись (в Keboola, в файлы агентов) ждёт подтверждения;
  ждущие подтверждения видны на главной и на странице «Подтверждения».
- Изменения в Keboola агенты делают только на dev-ветке. В прод изменение переносится отдельным шагом: вы видите
  «сейчас в проде → будет» и подтверждаете.
- Сцена на главной показывает, кто чем занят; клик по агенту открывает его последние действия (дифф, SQL, команды).
- Сверху видно расход токенов за сегодня и долю из кеша; клик открывает подробности.

## Где хранятся данные

Всё, что знает команда, лежит в папке `data` внутри папки приложения и **никогда не попадает в git**: чаты, база
знаний, общая память и профиль проекта, история версий агентов, расход, настройки. Ключ OmniRoute — в файле `.env`
там же, тоже не в git.

Данные компании уходят только в выбранную модель через OmniRoute. Не выбирайте бесплатные модели без ключа (они
видны по «Показать все модели OmniRoute» в настройках): туда данные компании отправлять нельзя.

**Резервная копия:** остановите приложение (Ctrl+C) и скопируйте папку `data` целиком.

## Обновление

Остановите приложение (Ctrl+C), затем:

- **GitHub Desktop:** Fetch origin → Pull origin.
- **Git:** `git pull` в папке приложения.
- **ZIP:** скачайте новый архив, распакуйте в новую папку и перенесите в неё папку `data` и файл `.env` из старой.

После этого в папке приложения:

```powershell
npm install
npm start
```

Агентов, навыки и рутины, которые создаёт или меняет agent-builder, приложение сохраняет в папках `agents`, `skills`
и `routines`. Если при обновлении мешают локальные изменения, GitHub Desktop предложит их отложить (Stash changes and
continue); в Git: `git stash`, `git pull`, `git stash pop`.

## Если что-то не так

- `npm run doctor` — те же проверки, что в карточке настройки, в терминале.
- PowerShell при каждом `npm` спрашивает «Security warning … Do you want to run …npm.ps1?»: один раз выполните
  `Get-ChildItem (Split-Path (Get-Command node).Source) -Recurse | Unblock-File` (и то же для
  `$env:APPDATA\npm`, если спрашивает про `omniroute.ps1`).
- PowerShell пишет «running scripts is disabled on this system»: выполните
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (администратор не нужен) и откройте PowerShell заново.
- `npm install` падает на `better-sqlite3`: нужен доступ к GitHub (оттуда скачивается готовая сборка) и Node.js 24.
- Порт 4800 занят: `$env:PORT=4801; npm start` и откройте http://127.0.0.1:4801.
- **Приложение не видит проекты, а `kbagent project list` в терминале их показывает.** В карточке настройки, в шаге
  «Проект Keboola подключён», будет строка, откуда kbagent в приложении читает настройки. Запустите в терминале
  `kbagent doctor` и сравните её со строкой «Config source». Если пути разные (например, у вас настройки kbagent в
  папке проекта `.kbagent`), укажите эту папку приложению и перезапустите его в новом окне PowerShell:

  ```powershell
  [Environment]::SetEnvironmentVariable('KBAGENT_CONFIG_DIR', 'C:\путь\к\папке\с\config.json', 'User')
  ```

- `kbagent` не находится после установки: откройте новое окно PowerShell (PATH меняется только для новых окон).
- `kbagent` ставится с ошибкой `does not satisfy Python>=3.12`: uv не смог скачать Python; используйте способ B
  (готовая сборка без Python).
- Модель не отвечает: проверьте, что окно `omniroute` открыто и провайдер подключён в его панели.
