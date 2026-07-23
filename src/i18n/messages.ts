// Message catalogs, grouped by area (PROJECT.md §4: structured per feature, no
// hardcoded strings in components). `en` is the schema every other locale is
// checked against, so a missing key is a type error rather than a runtime miss.

export const en = {
  common: {
    checkAgain: "Check again",
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
    },
    noPermissions: {
      title: "No permission to reach the headset",
      // {path} and {command} are filled with <code> elements via <i18n-t>.
      body: "Save this rule as {path}, reload the rules ({command}), then reconnect the headset.",
    },
    noDevice: {
      title: "No headset connected",
      body: "Connect a supported headset or its dongle; this screen updates by itself.",
    },
    ready: {
      capabilities: "Capabilities",
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
    },
    noPermissions: {
      title: "Brak uprawnień do urządzenia",
      body: "Zapisz tę regułę jako {path}, przeładuj reguły ({command}), a następnie podłącz zestaw ponownie.",
    },
    noDevice: {
      title: "Nie podłączono zestawu słuchawkowego",
      body: "Podłącz obsługiwany zestaw lub jego odbiornik; ten ekran zaktualizuje się sam.",
    },
    ready: {
      capabilities: "Funkcje",
    },
    deviceLost: {
      body: "Utracono połączenie — oczekiwanie na ponowne podłączenie zestawu.",
    },
  },
};
