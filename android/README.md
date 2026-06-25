# Сервис·Авто — Android APK

## Что делает приложение
- Открывает сайт в полноэкранном WebView (горизонтальная ориентация)
- Читает напряжение бортовой сети каждые 2 секунды с `/sys/class/power_supply/*/voltage_now`
- Передаёт напряжение в сайт через `window.onVoltageUpdate(voltage)`
- Считает GPS-пробег и передаёт через `window.onGpsKmUpdate(km)`
- Сохраняет все данные (моточасы, пробег, история) в SharedPreferences
- Запускается автоматически при включении магнитолы

---

## Сборка APK

### Требования
- Android Studio Hedgehog или новее
- JDK 17
- Android SDK 34

### Шаги

1. **Открыть проект**
   ```
   Файл → Open → выбрать папку /android
   ```

2. **Вставить URL вашего сайта** в `MainActivity.kt`:
   ```kotlin
   webView.loadUrl("https://ВАШ_ДОМЕН.poehali.dev")
   ```
   Домен смотрите в меню «Опубликовать» на poehali.dev

3. **Синхронизировать Gradle**
   ```
   File → Sync Project with Gradle Files
   ```

4. **Собрать APK**
   ```
   Build → Build Bundle(s) / APK(s) → Build APK(s)
   ```
   APK будет в: `android/app/build/outputs/apk/debug/app-debug.apk`

5. **Установить на магнитолу**
   - Подключить магнитолу по USB в режиме ADB
   - Или скопировать APK на флешку и установить через файловый менеджер

---

## Разрешения в магнитоле

После установки откройте **Настройки → Приложения → Сервис·Авто** и разрешите:
- **Геолокация** — для GPS-пробега
- **Запуск в фоне** — для постоянного мониторинга

---

## Чтение напряжения

Приложение последовательно проверяет пути:
```
/sys/class/power_supply/battery/voltage_now
/sys/class/power_supply/ac/voltage_now
/sys/class/power_supply/BAT/voltage_now
/sys/class/power_supply/main_battery/voltage_now
```

Если ни один не доступен — на конкретной магнитоле нужно найти правильный путь:
```bash
adb shell ls /sys/class/power_supply/
adb shell cat /sys/class/power_supply/НАЗВАНИЕ/voltage_now
```
И заменить путь в `VoltageService.kt` в функции `readVoltage()`.

---

## Архитектура

```
Магнитола
  └── VoltageService (фон, всегда работает)
        ├── читает /sys/class/power_supply/*/voltage_now каждые 2 сек
        ├── читает GPS каждые 3 сек / 5 м
        └── вызывает колбэки → MainActivity
  └── MainActivity
        ├── WebView → ваш сайт
        └── JS-мост AndroidBridge
              ├── window.onVoltageUpdate(v)  ← получает напряжение
              ├── window.onGpsKmUpdate(km)   ← получает пробег
              ├── AndroidBridge.saveData(json) ← сохраняет данные
              └── AndroidBridge.loadData()     ← загружает данные
```
