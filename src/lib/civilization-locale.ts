/**
 * The single localisation boundary shared by the React entry points and the
 * imperative game UI. Keep new player-facing copy here; callers never guess a
 * missing key or fall back to another language at runtime.
 */
export const CIVILIZATION_LOCALES = ["de-DE", "en-US"] as const;
export type CivilizationLocale = (typeof CIVILIZATION_LOCALES)[number];
export const DEFAULT_CIVILIZATION_LOCALE: CivilizationLocale = "en-US";
export const CIVILIZATION_LOCALE_STORAGE_KEY = "civilization-locale";

const copy = {
  "de-DE": {
    language: "Sprache",
    german: "Deutsch",
    english: "English",
    settings: "Einstellungen",
    settingsTitle: "Einstellungen",
    settingsClose: "Schließen",
    account: "Konto",
    connectedWallet: "Verbundene Wallet",
    copyAddress: "Adresse kopieren",
    addressCopied: "Wallet-Adresse kopiert.",
    addressCopyFailed:
      "Adresse konnte nicht kopiert werden. Bitte erneut versuchen.",
    session: "Sitzung",
    logout: "Abmelden",
    logoutPending: "Abmeldung läuft …",
    logoutFailed: "Abmeldung fehlgeschlagen. Bitte erneut versuchen.",
    motion: "Bewegung reduzieren",
    motionDescription: "Animationen in Civilization reduzieren.",
    loginTitle: "Baue dein Reich. Zug um Zug.",
    loginIntro:
      "Civilization bringt deine Strategie direkt in die World App – bereit, wenn du es bist.",
    walletAccess: "Wallet-Zugang",
    walletExplanation:
      "Bestätige deine World Wallet, damit diese Oberfläche deine Adresse zuordnen kann.",
    walletSafetyContract:
      "Diese Bestätigung autorisiert keinen Smart Contract. Jede On-chain-Aktion wird separat von deiner World Wallet signiert.",
    walletSafetySecret:
      "Civilization fragt niemals nach deiner Seed Phrase oder deinem privaten Schlüssel.",
    unavailable: "Civilization ist vorübergehend nicht verfügbar.",
    unavailableDetail:
      "Die sichere World-Chain-Konfiguration fehlt oder ist ungültig.",
    registrationPublic:
      "Die Registrierung ist öffentlich: Der Contract registriert nur die World Wallet, die diese Transaktion signiert. WalletAuth autorisiert den Contract nicht.",
    accessRequired: "Anmeldung erforderlich",
    accessDetail: "Der Zugang wird von der World-App-Vorschaltseite bestätigt.",
    loadingWorld: "World Chain wird geladen",
    worldUnavailable: "On-chain-Spielstand nicht verfügbar",
    retry: "Erneut prüfen",
    production: "Produktion",
    storage: "SPEICHER",
    storageAccessible: "Speicher",
    from: "von",
    wallet: "WALLET",
    walletBalance: "Wallet-Guthaben",
    fieldResources: "Feldressourcen",
    collect: "sammeln",
    level: "Stufe",
    villageActions: "Dorfaktionen",
    quickAccess: "Schnellzugriff",
    build: "Bauplan",
    buildShort: "Bau",
    army: "Kaserne",
    armyShort: "Armee",
    market: "Markt",
    raid: "Überfall",
    villageOf: "DORF VON MINTIA",
    yourVillage: "Dein Dorf.",
    interactiveMap:
      "Interaktive Stadtkarte von Mintia. Wähle ein Gebäude, um seinen Ausbau zu planen.",
    openMarket: "Tauschhalle öffnen",
    demoReset: "Demo zurücksetzen",
    demoLocal: "DEMO · LOKAL",
    connected: "VERBUNDEN",
    gameAuthority: "CivilizationGame ist alleinige Spielautorität",
    demoStorage: "Demo-Speicher · nur lokal",
    notTransferable: "Noch nichts übertragbar",
    contractCheck: "CONTRACT-PRÜFUNG · FELD, SPEICHER ODER ABKLINGZEIT",
    collectingIn: (time: string) => `Sammeln in ${time}`,
    collectorsReturn: (time: string) => `SAMMLER KEHREN IN ${time} ZURÜCK`,
    fieldRaidable: "FELDLAGER · RAIDBAR",
    accessDenied:
      "Eine bestätigte World Wallet ist für den Spielzugang erforderlich.",
    loadingState: "On-chain-Spielstand wird geladen.",
    chooseBuilding: "Wähle ein Gebäude auf dem Dorfplan.",
    assetsLoading:
      "Karte, Gebäude und Ressourcen werden geladen. Die Dorfsteuerung bleibt nutzbar.",
    mapAssetUnavailable:
      "Kartenbild nicht verfügbar. Die Dorfsteuerung bleibt nutzbar.",
    buildingAssetUnavailable: (name: string) =>
      `${name}-Symbol nicht verfügbar. Die Gebäudesteuerung bleibt nutzbar.`,
    resourceAssetUnavailable: (name: string) =>
      `${name}-Symbol nicht verfügbar.`,
    resourceNames: { wood: "Holz", clay: "Lehm", stone: "Stein", gold: "Gold" },
    buildingNames: {
      townhall: "Rathaus",
      timber: "Holzfäller",
      claypit: "Lehmgrube",
      quarry: "Steinbruch",
      warehouse: "Speicher",
      workshop: "Werkstatt",
      goldmine: "Goldschacht",
      barracks: "Kaserne",
      market: "Tauschhalle",
    },
    troopNames: {
      spear: "Speerträger",
      archer: "Bogenschütze",
      rider: "Reiter",
    },
  },
  "en-US": {
    language: "Language",
    german: "Deutsch",
    english: "English",
    settings: "Settings",
    settingsTitle: "Settings",
    settingsClose: "Close",
    account: "Account",
    connectedWallet: "Connected wallet",
    copyAddress: "Copy address",
    addressCopied: "Wallet address copied.",
    addressCopyFailed: "The address could not be copied. Please try again.",
    session: "Session",
    logout: "Log out",
    logoutPending: "Logging out …",
    logoutFailed: "Logout failed. Please try again.",
    motion: "Reduce motion",
    motionDescription: "Reduce animations in Civilization.",
    loginTitle: "Build your realm. Turn by turn.",
    loginIntro:
      "Civilization brings your strategy straight to World App — ready when you are.",
    walletAccess: "Wallet access",
    walletExplanation:
      "Confirm your World Wallet so this interface can associate your address.",
    walletSafetyContract:
      "This confirmation does not authorize a smart contract. Every on-chain action is signed separately in your World Wallet.",
    walletSafetySecret:
      "Civilization never asks for your seed phrase or private key.",
    unavailable: "Civilization is temporarily unavailable.",
    unavailableDetail:
      "The secure World Chain configuration is missing or invalid.",
    registrationPublic:
      "Registration is public: the contract only registers the World Wallet that signs this transaction. WalletAuth does not authorize the contract.",
    accessRequired: "Sign-in required",
    accessDetail: "Access is confirmed by the World App entry screen.",
    loadingWorld: "Loading World Chain",
    worldUnavailable: "On-chain game state unavailable",
    retry: "Try again",
    production: "Production",
    storage: "STORAGE",
    storageAccessible: "storage",
    from: "of",
    wallet: "WALLET",
    walletBalance: "Wallet balance",
    fieldResources: "Field resources",
    collect: "collect",
    level: "Level",
    villageActions: "Village actions",
    quickAccess: "Quick access",
    build: "Build",
    buildShort: "Build",
    army: "Barracks",
    armyShort: "Army",
    market: "Market",
    raid: "Raid",
    villageOf: "MINTIA'S VILLAGE",
    yourVillage: "Your village.",
    interactiveMap:
      "Interactive map of Mintia. Choose a building to plan its upgrade.",
    openMarket: "Open trading hall",
    demoReset: "Reset demo",
    demoLocal: "DEMO · LOCAL",
    connected: "CONNECTED",
    gameAuthority: "CivilizationGame is the sole game authority",
    demoStorage: "Demo storage · local only",
    notTransferable: "Nothing transferable yet",
    contractCheck: "CONTRACT CHECK · FIELD, STORAGE OR COOLDOWN",
    collectingIn: (time: string) => `Collect in ${time}`,
    collectorsReturn: (time: string) => `COLLECTORS RETURN IN ${time}`,
    fieldRaidable: "FIELD CAMP · RAIDABLE",
    accessDenied: "A confirmed World Wallet is required to access the game.",
    loadingState: "Loading on-chain game state.",
    chooseBuilding: "Choose a building on the village map.",
    assetsLoading:
      "Map, buildings, and resources are loading. Village controls remain available.",
    mapAssetUnavailable:
      "Map image unavailable. Village controls remain available.",
    buildingAssetUnavailable: (name: string) =>
      `${name} symbol unavailable. Building controls remain available.`,
    resourceAssetUnavailable: (name: string) => `${name} symbol unavailable.`,
    resourceNames: { wood: "Wood", clay: "Clay", stone: "Stone", gold: "Gold" },
    buildingNames: {
      townhall: "Town hall",
      timber: "Lumber camp",
      claypit: "Clay pit",
      quarry: "Quarry",
      warehouse: "Warehouse",
      workshop: "Workshop",
      goldmine: "Gold mine",
      barracks: "Barracks",
      market: "Trading hall",
    },
    troopNames: { spear: "Spearman", archer: "Archer", rider: "Rider" },
  },
} as const;

export type CivilizationMessages = (typeof copy)[CivilizationLocale];
export function civilizationMessages(
  locale: CivilizationLocale = DEFAULT_CIVILIZATION_LOCALE,
): CivilizationMessages {
  return copy[locale];
}

export function resolveCivilizationLocale(
  value: string | null | undefined,
): CivilizationLocale {
  return value === "en" || value === "en-US"
    ? "en-US"
    : DEFAULT_CIVILIZATION_LOCALE;
}

export function localeLanguageTag(locale: CivilizationLocale) {
  return locale === "en-US" ? "en" : "de";
}

export function formatCivilizationNumber(
  value: number,
  locale: CivilizationLocale,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCivilizationDateTime(
  value: Date | number,
  locale: CivilizationLocale,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
