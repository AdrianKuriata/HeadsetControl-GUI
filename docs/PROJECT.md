# Headset Deck — uniwersalne GUI dla headsetcontrol (Linux)

> Nowoczesna, minimalistyczna aplikacja desktopowa (Tauri 2 + Vue 3 + Rust) do konfiguracji
> headsetów bezprzewodowych wspieranych przez [HeadsetControl](https://github.com/Sapd/HeadsetControl).
> Pierwszym urządzeniem referencyjnym jest **Audeze Maxwell 2** (warianty PS/PC oraz Xbox).
> Projekt open source.

---

## 1. Wizja i zakres

- **Uniwersalność**: aplikacja renderuje UI wyłącznie na podstawie *capabilities* zgłaszanych
  przez `headsetcontrol --output json`. Działa z każdym wspieranym headsetem (~50 modeli).
- **Profile urządzeń**: opcjonalne nakładki per model (nazwy presetów EQ, częstotliwości pasm,
  akcent kolorystyczny platformy). Bez profilu urządzenie dostaje w pełni funkcjonalny widok generyczny.
- **Zero ryzyka dla sprzętu**: wyłącznie parametry runtime (EQ, sidetone, chatmix, filtr szumów itd.).
  **Aplikacja nigdy nie dotyka firmware.**

### MVP
1. Wykrywanie urządzeń + auto-odświeżanie (hotplug), wybór urządzenia gdy >1.
2. Bateria, sidetone, chatmix, presety EQ, filtr szumów, komunikaty głosowe,
   auto-wyłączanie, status mute — zależnie od capabilities.
3. Profil Audeze Maxwell 2 (PS/PC + Xbox) z pełnym korektorem graficznym.
4. **Ikona w tray** (szczegóły niżej, sekcja 2.1).
5. Pakiet `.deb` + AppImage, powiadomienia o aktualizacji z GitHub Releases.

### Poza zakresem (na teraz)
- Aktualizacje firmware (świadomie nigdy).
- Windows/macOS (architektura tego nie blokuje, ale nie testujemy).
- Natywny backend HID (przewidziany interfejsem `HeadsetBackend`, implementacja później).

---

## 2. Design system — „Mono"

Referencja wizualna: `maxwell-control-mono.html` (mock, Vue 3 w jednym pliku).

### Zasady
- Czerń `#0a0a0a`, biel `#f5f5f3`, szarości `#8a8a86 / #55554f`, linie włoskowate 1 px `#1f1f1d`.
- **Jeden kolor akcentowy, zależny od platformy urządzenia.** Wykrywanie platformy to
  **mechanizm rdzenia, wspólny dla wszystkich urządzeń**: interfejs `DeviceProfile` zawiera
  opcjonalną mapę `variants: { [pid]: 'xbox' | 'ps' | 'nintendo' | 'pc' }`, a rdzeń na jej
  podstawie ustawia motyw. Dotyczy każdego headsetu z wariantami platformowymi
  (np. Audeze Maxwell 2, SteelSeries Arctis 7X/7P, Nova 7X/7P). Profil bez mapy
  lub PID spoza mapy = neutralna biel, zero specjalnych przypadków w UI:

  | Platforma    | Akcent    | Zastosowanie                                            |
  |--------------|-----------|---------------------------------------------------------|
  | Xbox         | `#43b34a` | subtelnie: podkreślenie aktywnego presetu/opcji, uchwyt |
  | PlayStation  | `#3a86d4` | suwaka (hover/drag/focus), punkty edycji EQ, dioda LED, |
  | Nintendo     | `#e4404b` | badge platformy, wartość dB przy przeciąganiu           |
  | nieznana     | biel      | (fallback bez akcentu)                                  |

- Typografia: **Inter Tight** (UI) + **IBM Plex Mono** (etykiety micro-caps, wartości,
  cyfry tabelaryczne). Desktop-only, min. szerokość 900 px, bez breakpointów mobilnych.
- Korektor: cienka biała krzywa, siatka włoskowata, subtelne animowane widmo w tle
  (linia, ~13% bieli, wyłączane przy `prefers-reduced-motion`).
  Presety fabryczne — tylko odczyt; presety własne — punkty przeciągalne,
  **podczas przeciągania nad punktem wyświetla się wartość w dB** (np. `+2.5 dB`, akcent, mono).
- Kontrolki: suwak = linia 1 px + kropka; opcje = tekst z podkreśleniem; stepper = − / +.
- Dostępność: pełna obsługa klawiatury, role ARIA, `:focus-visible` w akcencie,
  `prefers-reduced-motion`.

### 2.1 Ikona w tray

Tray to podstawowy tryb pracy aplikacji (okno konfiguratora otwiera się rzadko,
bateria interesuje zawsze).

- **Dynamiczna ikona baterii** generowana w locie po stronie Rust (Tauri `TrayIcon`,
  podmiana obrazu przy każdej zmianie stanu): monochromatyczna, spójna z designem Mono,
  czytelna na jasnym i ciemnym panelu. Stany: poziom baterii, ładowanie,
  brak urządzenia (wyszarzona), mute (znacznik).
- **Menu**: bateria %, szybka zmiana presetu EQ, filtr szumów, „Otwórz", „Zakończ".
- **Zamknięcie okna = zwinięcie do tray** (opcja w ustawieniach, domyślnie wł.)
  + opcjonalny autostart z systemem (`tauri-plugin-autostart`) — start zwinięty.
- Aktualizacja ikony podpięta pod ten sam hotplug/polling co UI.
- **Realia Linuksa**: protokół StatusNotifier/AppIndicator. Ubuntu — działa domyślnie
  (rozszerzenie AppIndicator preinstalowane); czysty GNOME (np. Fedora) wymaga
  rozszerzenia AppIndicator. Zależność pakietu `.deb`: `libayatana-appindicator3-1`.
  Brak wsparcia tray w środowisku = graceful degradation: apka działa normalnie oknem,
  bez crasha, z informacją w ustawieniach.

---

### 2.2 Wizualizacja audio na żywo (korektor)

Widmo w tle korektora docelowo pokazuje **rzeczywisty dźwięk grający w słuchawkach**,
nie animację:

- **Źródło**: monitor source domyślnego sinka PipeWire/PulseAudio (standard na Linuksie,
  bez dodatkowych uprawnień) — przechwytywanie po stronie Rust (`cpal`/`pipewire-rs`).
- **Analiza**: `rustfft`, okno ~2048 próbek, mapowanie na oś logarytmiczną 31 Hz–16 kHz
  (spójną z pasmami EQ), wygładzanie attack/release.
- **Transport**: event Tauri ~30 fps z tablicą amplitud → istniejący canvas.
- **Prywatność**: analiza wyłącznie w pamięci; audio nigdy nie jest zapisywane
  ani transmitowane.
- **Fallback**: cisza / brak monitora / wyłączona opcja / `prefers-reduced-motion`
  → statyczna siatka lub delikatna animacja proceduralna (jak w mocku).
  Przełącznik w ustawieniach.
- Wizualizacja pokazuje sygnał źródłowy (nie post-DSP słuchawek — do tego nie mamy
  dostępu); krzywa EQ może opcjonalnie ważyć wyświetlane amplitudy (kosmetyka).

## 3. Architektura

### 3.1 Backend (Rust, `src-tauri/`)

```
src-tauri/src/
├── main.rs               # bootstrap
├── commands.rs           # cienkie komendy IPC (typy generowane do TS)
└── backend/
    ├── mod.rs            # trait HeadsetBackend  ← DIP
    ├── headsetcontrol.rs # adapter: exec binarki + parsowanie
    └── hotplug.rs        # udev monitor → eventy do frontendu
```

- `trait HeadsetBackend { fn list_devices(); fn get_state(id); fn set_param(id, param, value); }`
- **Warstwa antykorupcyjna**: output binarki jest walidowany i mapowany na wewnętrzne
  typy domenowe. UI nigdy nie widzi surowego JSON-a headsetcontrol.
  Wykrywanie wersji binarki przy starcie; niekompatybilność = czytelny ekran błędu.
- **Hotplug**: monitor udev (crate `udev`) filtrowany po VID znanych producentów →
  event `devices-changed` do frontendu. Fallback: polling. Bateria: odświeżanie co ~5 s
  gdy okno aktywne. **Efekt: włączenie/wyłączenie słuchawek aktualizuje UI samo, bez restartu.**
- Rust **nie zna modeli słuchawek** — zna tylko capabilities i wartości.

### 3.2 Frontend (Vue 3, `src/`)

```
src/
├── core/
│   ├── types.gen.ts       # typy WYGENEROWANE z Rust (tauri-specta) — 1 źródło prawdy
│   ├── backend.ts         # jedyne miejsce z invoke()/listen()
│   └── stores/
│       ├── devices.ts     # Pinia: lista, wybór, hotplug
│       └── device.ts      # Pinia: stan parametrów, optimistic update + rollback
├── profiles/
│   ├── types.ts           # interfejs DeviceProfile (ISP: tylko to, co nadpisujesz)
│   ├── registry.ts        # (vid, pid) → profil; fallback GenericProfile
│   ├── generic.ts
│   └── audeze-maxwell2.ts # presety, pasma EQ, warianty PID→platforma
├── controls/              # generyczne: HSlider, HOptions, HStepper, HReadout
├── features/              # 1 capability = 1 komponent (SRP)
│   ├── SidetoneRow.vue
│   ├── ChatmixRow.vue
│   ├── EqualizerSection.vue
│   ├── NoiseFilterRow.vue
│   ├── VoicePromptsRow.vue
│   ├── InactiveTimeRow.vue
│   ├── LightsRow.vue
│   └── registry.ts        # mapa capability → komponent (OCP)
└── App.vue                # maszyna stanów + render features wg capabilities
```

### 3.3 Maszyna stanów aplikacji (jawna, każdy stan ma ekran)

`checking-binary → missing-binary | bad-version | no-permissions(udev) | no-device | ready(device) | device-lost`

- `missing-binary`: instrukcja instalacji headsetcontrol.
- `no-permissions`: gotowa reguła udev do skopiowania + przycisk „sprawdź ponownie".
- `device-lost`: wartości wygaszone, automatyczny powrót do `ready` po hotplug.
- Błąd zapisu parametru → rollback optimistic update + dyskretny toast.
- Nieznane capability: logowane, ignorowane (forward compatibility — nie crash).

### 3.4 Rozszerzalność w praktyce (SOLID)
- **Nowa funkcja w headsetcontrol** → nowy plik w `features/` + 1 wpis w `features/registry.ts`.
  Zero modyfikacji istniejących plików (OCP).
- **Funkcja znika z urządzenia/biblioteki** → capability nie przychodzi → wiersz się nie renderuje.
- **Nowy model słuchawek z niuansami** → nowy plik w `profiles/` + wpis w `profiles/registry.ts`.
- **Nowe źródło danych** (np. natywny HID) → nowa implementacja `HeadsetBackend`; frontend bez zmian (DIP/LSP).

---

## 4. Standardy kodowania

- **SOLID** — jak wyżej; świadomie **bez** nadmiarowych abstrakcji (brak DDD — domena zbyt płytka,
  brak pluginów/event busów na zapas).
- **TDD** — test przed implementacją. Piramida testów:
  1. **Jednostkowe/integracyjne** (fundament, tu mieszka coverage):
     - Rust: parser/adapter/maszyna stanów + **testy kontraktowe** na nagranych fixture'ach
       outputu headsetcontrol (wykrywają zmianę formatu przy aktualizacji binarki).
     - TS (Vitest): store'y, registry profili, mapowanie capabilities, warianty platform.
     - Komponenty (Vue Test Utils): zachowania, interakcje, ARIA — nie piksele.
  2. **E2E Playwright na MockBackendzie** (build Vite): pełne przepływy — hotplug,
     device-lost, rollback po błędzie zapisu, wybór urządzenia, motywy platform.
     Deterministyczne, na każdym PR.
  3. **Smoke E2E na realnej apce**: `tauri-driver` (WebDriver) + xvfb w CI; zamiast
     prawdziwego headsetcontrol w PATH podstawiana **fake-binarka** zwracająca fixture'y
     JSON (w tym scenariusze błędów: brak binarki, zły format, timeout). Testuje realny IPC.
  4. **Checklista sprzętowa przed release** (`RELEASE_CHECKLIST.md`): prawdziwy headset,
     fizyczny hotplug, mute na muszli — jedyne, czego CI nie pokryje.

- **Polityka coverage (egzekwowana w CI, build czerwony poniżej progu):**
  - **100%** (lines/branches/functions): `core/`, `stores/`, `profiles/`,
    `features/registry.ts` (Vitest v8) oraz parser/adapter/maszyna stanów w Rust
    (`cargo-llvm-cov`).
  - **90%**: komponenty UI (`features/*.vue`, `controls/`).
  - Jawnie wyłączone z pomiaru: kod generowany (`*.gen.ts`), bootstrap
    (`main.ts`, `main.rs`), pliki konfiguracyjne.
  - E2E nie wlicza się do coverage — mierzy przepływy, nie linie.
- Lint/format: ESLint 9 (flat config) + `vue-tsc` + Prettier; `clippy` + `rustfmt`. CI blokuje merge.
- Commity: Conventional Commits; wersjonowanie SemVer.
- i18n od startu: `vue-i18n` (pl, en).
- Bezpieczeństwo Tauri v2: ACL/capabilities zawężone — shell **wyłącznie** do binarki
  headsetcontrol; brak dostępu do sieci poza updaterem.

## 5. Stack (zawsze najnowsze stabilne)

| Warstwa | Narzędzie | Uwagi |
|---|---|---|
| Runtime | Tauri 2.x | + plugins: store, log, updater, notification |
| UI | Vue 3.5+, Pinia 3, Vite 7 | `<script setup>`, TypeScript strict |
| Backend | Rust stable (edition 2024) | serde, thiserror, udev, specta |
| Testy | Vitest, Playwright, cargo test | fixtures kontraktowe |
| CI/CD | GitHub Actions | lint → test → build → release |

Wersje przypięte w lockfile'ach; Renovate/Dependabot do automatycznych bumpów (PR + testy).

## 6. Dystrybucja i aktualizacje

- **Artefakty release**: `.deb` (Ubuntu/Debian) + **AppImage jako format uniwersalny**
  (Fedora, Arch, openSUSE, Mint…), budowane przez `tauri build` w GitHub Actions,
  podpisane sumy kontrolne. Od M3 dodatkowo **`.rpm`** (ten sam bundler Tauri, wpis w CI).
- **Wsparcie dystrybucji poza Ubuntu**:
  - Rdzeń jest dystro-agnostyczny: udev/hidraw/StatusNotifier to standardy;
    zależność `webkit2gtk` dostępna wszędzie; X11 i Wayland wspierane.
  - **AUR (Arch)**: oficjalny `PKGBUILD` w repo projektu; utrzymanie wraz ze społecznością.
  - **Flatpak (M4+)**: świadomie później — sandbox komplikuje exec zewnętrznej binarki
    (opcje: `flatpak-spawn --host` lub — preferowane — bundlowanie headsetcontrol
    wewnątrz paczki + uprawnienia HID). Wykonalne, ale to osobne zadanie.
  - **Dostępność headsetcontrol** różni się między dystrybucjami (i wymagamy wersji
    z obsługą Maxwell 2) → ekran `missing-binary`/`bad-version` pokazuje instrukcję
    instalacji per dystrybucja; w M4 ocenimy bundlowanie headsetcontrol z aplikacją,
    co eliminuje problem u źródła.
- **Updater**:
  - AppImage: wbudowany `tauri-plugin-updater` (podpisane manifesty) — pełny auto-update.
  - `.deb`: plugin updatera nie wspiera pakietów systemowych, więc: cichy check wersji na
    GitHub Releases API przy starcie (max 1×/24 h) → nieinwazyjna belka „dostępna wersja X"
    → pobranie `.deb` i otwarcie instalatora. Docelowo: własne repo APT (`deb [signed-by=…]`),
    wtedy aktualizacje przejmuje system.
- Licencja: **GPL-3.0** (spójnie z ekosystemem HeadsetControl).

## 7. Portowalność (Windows / macOS / mobile)

Cel: nie płacić dziś za porty, których może nie być — ale nie zamurować drogi do nich.

### Desktop (Windows, macOS) — niski koszt
- Tauri 2 buduje natywnie na win/mac/linux; headsetcontrol działa na wszystkich trzech OS.
- Kod specyficzny dla OS wolno umieszczać **wyłącznie** w wyznaczonych modułach:
  - `backend/hotplug.rs` — Linux: udev; Windows/macOS: natywne API lub fallback polling
    (za wspólnym interfejsem `DeviceWatcher`),
  - ekrany maszyny stanów zależne od OS (np. `no-permissions`/udev istnieje tylko na Linuksie),
  - lokalizacja/instalacja binarki headsetcontrol.
- Rdzeń (adapter, store'y, profile, features, UI) ma **zakaz założeń linuksowych**
  (ścieżki, separator, obecność udev). Pilnowane w code review.
- Port = implementacja `DeviceWatcher` + ekrany OS + 2 joby w CI. Skala: dni.

### Mobile (Android, iOS) — osobny projekt, nie konwersja
- Model „exec zewnętrznej binarki" nie istnieje na mobile (iOS: brak subprocess i USB HID
  dla tej klasy urządzeń; Android: CLI nie zadziała, USB Host API wymaga natywnej obsługi).
- Warunkiem wejścia na mobile jest **`NativeHidBackend`** — własna implementacja protokołu
  (HID/BLE) za istniejącym traitem `HeadsetBackend`. Frontendowa logika (store'y, profile,
  features) przenosi się bez zmian; UI wymaga osobnego projektu (obecny design jest
  świadomie desktop-only).
- Decyzja: nie blokujemy, nie budujemy na zapas. Trait `HeadsetBackend` jest naszym
  ubezpieczeniem — wpięcie natywnego backendu nie dotyka warstw wyżej.

## 8. Roadmap

1. **M0** — repo, CI, szkielet Tauri+Vue, MockBackend, przeniesienie designu Mono na komponenty.
2. **M1** — adapter headsetcontrol + maszyna stanów + hotplug. Generic device działa E2E.
3. **M2** — uniwersalny mechanizm wariantów platformowych (PID→platforma→motyw) w rdzeniu
   + profil referencyjny Audeze Maxwell 2 (PS/PC + **Xbox**) z pełnym korektorem graficznym.
4. **M3** — ikona tray (dynamiczna bateria, menu, zwijanie, autostart)
   + pakowanie deb/rpm/AppImage, updater, PKGBUILD (AUR), pierwsza publiczna wersja.
5. **M4+** — repo APT, Flatpak (z bundlowanym headsetcontrol), ocena bundlowania
   binarki także w deb/rpm, kolejne profile urządzeń od społeczności.

## 9. Wsparcie Maxwell 2 Xbox (upstream)

Wariant Xbox ma inny PID niż PS/PC. **PID potwierdzony na sprzęcie (Ubuntu, lsusb):**

```
Bus 001 Device 009: ID 3329:4b28 Audeze LLC Audeze Maxwell XBOX Dongle
```

Wzorzec Audeze jest spójny: Maxwell 1 → PS `0x4b19` / Xbox `0x4b18`;
Maxwell 2 → PS/PC `0x4b29` / **Xbox `0x4b28`**.

### Status
- [x] Odczyt PID z dongla Xbox (`lsusb -d 3329:`) → `0x4b28`
- [x] Patch przygotowany: `maxwell2-xbox-support.patch` — dopisuje `0x4b28`
      do `SUPPORTED_PRODUCT_IDS` w `lib/devices/audeze_maxwell2.hpp` (3 linie;
      PID w kodzie występuje tylko w tym miejscu, reguły udev generują się
      automatycznie z listy przez `headsetcontrol -u`)
- [ ] Build lokalny + testy na sprzęcie (poniżej)
- [ ] PR do `Sapd/HeadsetControl` (po pozytywnych testach)
- [ ] Wpis `0x4b28 → 'xbox'` w `profiles/audeze-maxwell2.ts`

### Procedura testowa (Ubuntu)

```bash
sudo apt install build-essential cmake libhidapi-dev git
git clone https://github.com/Sapd/HeadsetControl.git && cd HeadsetControl
git apply ~/Pobrane/maxwell2-xbox-support.patch
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc)
./build/headsetcontrol -u | sudo tee /etc/udev/rules.d/70-headsets.rules
sudo udevadm control --reload-rules && sudo udevadm trigger

./build/headsetcontrol -?                    # wykrywanie urządzenia
./build/headsetcontrol -b                    # bateria
./build/headsetcontrol -s 15                 # sidetone (test słuchowy)
./build/headsetcontrol --output json         # pełny stan + capabilities
```

Prognoza: w Maxwellu 1 wariant Xbox używał identycznego protokołu (różnica = tylko PID),
więc oczekujemy pełnej zgodności. Jeśli któraś funkcja nie odpowie — diagnoza protokołu
przed wysłaniem PR.

## 10. Dziennik decyzji

| Data | Decyzja |
|---|---|
| 2026-07 | Backend: adapter na `headsetcontrol` (CLI), za traitem `HeadsetBackend`; natywny HID możliwy później bez zmian frontendu |
| 2026-07 | Design: kierunek „Mono" (czerń/biel, hairlines, akcent platformy) — zatwierdzony po 4 iteracjach; referencja: `maxwell-control-mono.html` |
| 2026-07 | Akcenty platform (Xbox/PS/Nintendo) jako mechanizm rdzenia (`variants` w `DeviceProfile`), nie feature pojedynczego profilu |
| 2026-07 | Coverage: 100% na warstwach logiki (core/stores/profiles + parser Rust), 90% komponenty UI, wyłączenia dla kodu generowanego i bootstrapu; e2e poza pomiarem — **zatwierdzone** |
| 2026-07 | SOLID + TDD; świadomie bez DDD i bez abstrakcji na zapas |
| 2026-07 | Dystrybucja: `.deb` + AppImage; auto-update AppImage przez tauri-plugin-updater, dla `.deb` check GitHub Releases → docelowo repo APT |
| 2026-07 | Licencja GPL-3.0; projekt open source |
| 2026-07 | Maxwell 2 Xbox: PID `0x4b28` potwierdzony na sprzęcie; patch upstream przygotowany |
| — | Nazwa aplikacji: **do ustalenia** („Headset Deck" = robocza) |

## 11. Zasada nadrzędna

> Aplikacja steruje wyłącznie ustawieniami runtime. Nigdy nie implementujemy aktualizacji
> firmware ani nie wysyłamy niezweryfikowanych komend zapisu — bezpieczeństwo sprzętu
> użytkownika jest ważniejsze niż każda funkcja.
