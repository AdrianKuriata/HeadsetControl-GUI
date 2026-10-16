// Message catalogs, grouped by area (PROJECT.md §4: structured per feature, no
// hardcoded strings in components). `en` is the schema every other locale is
// checked against, so a missing key is a type error rather than a runtime miss.

export const en = {
  common: {
    checkAgain: "Check again",
    dismiss: "Dismiss",
  },
  toast: {
    // The capability identifier is a technical constant, so it interpolates
    // rather than being translated.
    writeFailed: "The headset refused the change to {capability}.",
  },
  // Shared by the missing-binary and bad-version screens: both end in the same
  // place, a signed package with a source build behind it (InstallInstructions.vue).
  install: {
    repositories: "Install from upstream's repository",
    packages: "Or download the signed package",
    verify: "Check the signature first",
    udev: "The package also installs the udev rules that let this app reach the headset.",
    source: "Or build it from source",
    dependencies: "Install the build dependencies",
    build: "Build and install headsetcontrol",
  },
  // One entry per capability component in `src/features/` (#12). The names are
  // the user's words for a capability, never the CAP_* identifier.
  features: {
    // Shown wherever the app has no value for a capability: the CLI cannot read
    // most of them back, so a row starts out unknown rather than lying "off".
    unknown: "—",
    sidetone: {
      name: "Sidetone",
      description: "Hearing your own voice",
      off: "off",
    },
    chatmix: {
      name: "Chatmix",
      description: "Game / chat balance",
      game: "Game",
      chat: "Chat",
    },
    noiseFilter: {
      name: "Noise filter",
      description: "Microphone noise reduction",
      off: "off",
      low: "low",
      high: "high",
    },
    voicePrompts: {
      name: "Voice prompts",
      on: "on",
      off: "off",
      active: "active",
    },
    lights: {
      name: "Lights",
      description: "Headset LEDs",
      on: "on",
      off: "off",
    },
    inactiveTime: {
      name: "Auto power-off",
      description: "After being idle",
      never: "never",
      minutes: "{count} min",
      shorter: "Shorter",
      longer: "Longer",
    },
    equalizer: {
      name: "Equalizer",
      description: "Built-in presets",
      preset: "Preset {number}",
    },
  },
  screens: {
    checking: {
      title: "Checking headsetcontrol",
      body: "Looking for the headsetcontrol binary and reading connected devices.",
    },
    missingBinary: {
      title: "headsetcontrol not found",
      // {tool} is filled with a <code> element via <i18n-t>.
      body: "This app is a graphical front-end for the {tool} command-line tool. Install it, then check again.",
    },
    badVersion: {
      title: "headsetcontrol is too old",
      body: "Found version {found}, this app needs {required} or newer.",
      // The binary answered with something this app cannot read at all — an
      // old release that does not know the json output, most likely.
      bodyUnnamed: "This headsetcontrol could not be read; this app needs {required} or newer.",
    },
    noPermissions: {
      title: "No permission to reach the headset",
      // {path} is filled with a <code> element via <i18n-t>.
      body: "The headset is connected but refuses to open. Let headsetcontrol write the udev rules to {path} and reload them:",
      reconnect: "Then reconnect the headset and check again.",
    },
    noDevice: {
      title: "No headset connected",
      body: "Connect a supported headset or its dongle; this screen updates by itself.",
    },
    ready: {
      capabilities: "Capabilities",
      battery: "Battery",
      charging: "Charging",
      batteryUnavailable: "Not reporting",
    },
    deviceLost: {
      body: "Connection lost — waiting for the headset to come back.",
    },
  },
} as const;

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]>;
};

/** Every locale must provide exactly the keys `en` defines (with any string). */
export type Messages = DeepStrings<typeof en>;

export const pl: Messages = {
  common: {
    checkAgain: "Sprawdź ponownie",
    dismiss: "Zamknij",
  },
  toast: {
    writeFailed: "Zestaw odrzucił zmianę {capability}.",
  },
  install: {
    repositories: "Zainstaluj z repozytorium upstreamu",
    packages: "Albo pobierz podpisany pakiet",
    verify: "Najpierw sprawdź podpis",
    udev: "Pakiet instaluje też reguły udev, dzięki którym aplikacja sięgnie do zestawu.",
    source: "Albo zbuduj ze źródeł",
    dependencies: "Zainstaluj zależności do budowania",
    build: "Zbuduj i zainstaluj headsetcontrol",
  },
  features: {
    unknown: "—",
    sidetone: {
      name: "Sidetone",
      description: "Odsłuch własnego głosu",
      off: "wył.",
    },
    chatmix: {
      name: "Chatmix",
      description: "Balans gra — czat",
      game: "Gra",
      chat: "Czat",
    },
    noiseFilter: {
      name: "Filtr szumów",
      description: "Redukcja szumów mikrofonu",
      off: "wył.",
      low: "niski",
      high: "wysoki",
    },
    voicePrompts: {
      name: "Komunikaty głosowe",
      on: "wł.",
      off: "wył.",
      active: "aktywne",
    },
    lights: {
      name: "Podświetlenie",
      description: "Diody zestawu",
      on: "wł.",
      off: "wył.",
    },
    inactiveTime: {
      name: "Auto-wyłączanie",
      description: "Po bezczynności",
      never: "nigdy",
      minutes: "{count} min",
      shorter: "Krócej",
      longer: "Dłużej",
    },
    equalizer: {
      name: "Korektor",
      description: "Presety fabryczne",
      preset: "Preset {number}",
    },
  },
  screens: {
    checking: {
      title: "Sprawdzanie headsetcontrol",
      body: "Szukanie binarki headsetcontrol i odczyt podłączonych urządzeń.",
    },
    missingBinary: {
      title: "Nie znaleziono headsetcontrol",
      body: "Ta aplikacja to graficzna nakładka na narzędzie wiersza poleceń {tool}. Zainstaluj je, a następnie sprawdź ponownie.",
    },
    badVersion: {
      title: "headsetcontrol jest zbyt stary",
      body: "Znaleziono wersję {found}, aplikacja wymaga {required} lub nowszej.",
      bodyUnnamed:
        "Nie udało się odczytać tego headsetcontrol; aplikacja wymaga {required} lub nowszej.",
    },
    noPermissions: {
      title: "Brak uprawnień do urządzenia",
      body: "Zestaw jest podłączony, ale nie daje się otworzyć. Pozwól headsetcontrol zapisać reguły udev do {path} i przeładuj je:",
      reconnect: "Następnie podłącz zestaw ponownie i sprawdź jeszcze raz.",
    },
    noDevice: {
      title: "Nie podłączono zestawu słuchawkowego",
      body: "Podłącz obsługiwany zestaw lub jego odbiornik; ten ekran zaktualizuje się sam.",
    },
    ready: {
      capabilities: "Funkcje",
      battery: "Bateria",
      charging: "Ładowanie",
      batteryUnavailable: "Brak odczytu",
    },
    deviceLost: {
      body: "Utracono połączenie — oczekiwanie na ponowne podłączenie zestawu.",
    },
  },
};
