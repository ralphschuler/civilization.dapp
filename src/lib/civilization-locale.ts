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
    reviewTitle: "Wallet-Aktion prüfen",
    reviewInvalidatedTitle: "Prüfung ungültig",
    reviewNotice:
      "Prüfe diese unveränderliche Aktion, bevor deine Wallet geöffnet wird.",
    reviewFinality:
      "Die Aktion wurde an die Wallet/Chain übergeben. Finalität wird geprüft.",
    reviewInvalidated:
      "Markteingaben haben sich geändert. Lade eine neue Quote und prüfe erneut.",
    reviewWorldStateInvalidated:
      "Der On-chain-Spielstand hat sich geändert. Prüfe den nächsten Bauschritt erneut.",
    reviewConfirm: "In Wallet bestätigen",
    reviewCancel: "Abbrechen",
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
    metadataDescription: "Civilization für World App",
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
    troopAssetUnavailable: (name: string) =>
      `${name}-Symbol nicht verfügbar. Die Armeesteuerung bleibt nutzbar.`,
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
    buildingDetails: {
      townhall: "Schaltet stärkere Ausbauten frei.",
      timber: "Erzeugt Holz.",
      claypit: "Erzeugt Lehm.",
      quarry: "Erzeugt Stein.",
      warehouse: "Erhöht Kapazität aller Rohstoffe.",
      workshop: "Voraussetzung für Gold und Einheiten.",
      goldmine: "Erzeugt Gold für Ausbildung.",
      barracks: "Bildet Truppen aus.",
    },
    buildDetail: "GEBÄUDEDETAIL",
    buildProgress: "BAU LÄUFT",
    complete: "Fertig",
    constructionRunning: "Bau läuft",
    completeUpgrade: "Ausbau abschließen",
    constructionNote: "Der Contract erhöht die Stufe erst nach Abschluss.",
    constructionSlotsOccupied: (occupied: number, capacity: number) =>
      `Bauplätze belegt: ${occupied}/${capacity}`,
    boostConstruction: "1 Stunde für 1 WLD boosten",
    maxLevel: "MAXIMALSTUFE ERREICHT",
    fullyUpgraded: (name: string) => `${name} ist vollständig ausgebaut.`,
    prestigeStart: (level: number) => `Prestige ${level} starten`,
    prestigeDetail:
      "Prestige setzt das Dorf zurück und erhöht Produktion dauerhaft um 10 %.",
    noFurtherUpgrade: "Für dieses Gebäude ist kein weiterer Ausbau möglich.",
    upgradeLocked: "AUSBAU GESPERRT",
    unlockUpgrade: "Erfülle diese Stufen, um den Ausbau freizuschalten.",
    meetRequirements: "Voraussetzungen erfüllen",
    buildDurationLoading: "On-chain-Bauzeit: wird aus dem Contract geladen …",
    buildDurationUnavailable: "On-chain-Bauzeit: derzeit nicht lesbar",
    buildDuration: (duration: string) => `On-chain-Bauzeit: ${duration}`,
    upgradeCost: (level: number) => `KOSTEN FÜR STUFE ${level}`,
    startWorldUpgrade: (level: number) => `Ausbau auf Stufe ${level} starten`,
    startDemoUpgrade: (level: number) => `Auf Stufe ${level} ausbauen`,
    nextProduction: (production: string) =>
      ` Nächste Produktion: ${production}.`,
    upgradeImpactTitle: "AUSBAU-AUSWIRKUNG",
    upgradeImpactProduction: (resource: string) => `${resource}-Produktion`,
    upgradeImpactCapacity: "Speicherkapazität je Rohstoff",
    upgradeImpactSlots: "Bauplätze",
    upgradeImpactDefense: "Verteidigung",
    upgradeImpactUnlocks: "Wird freigeschaltet",
    upgradeImpactNoDirectEffect:
      "Für diesen Ausbau ist keine direkte, lesbare Auswirkung im Contract hinterlegt.",
    upgradeImpactDemoUnavailable:
      "Contract-Vergleich im lokalen Demo-Modus nicht verfügbar.",
    upgradeImpactUnavailable:
      "Contract-gesteuerte Auswirkungen sind für diesen Spielstand derzeit nicht lesbar.",
    upgradeImpactMaxLevel:
      "Keine weitere Vergleichsprojektion: Die Contract-Maximalstufe ist erreicht.",
    upgradeImpactCapacityRule:
      "Contract-Regel: Start bei 500; je Speicherstufe ×1,7, jeweils abgerundet.",
    upgradeImpactSlotsRule:
      "Contract-Regel: 2 Plätze ab Werkstatt 11, 3 ab Werkstatt 21.",
    upgradeImpactDefenseRule:
      "Contract-Regel: Rathausstufen geben jeweils +20; Truppenwerte und Abrundung bleiben unverändert.",
    upgradeImpactContractGated:
      "Read-only Contract-Projektion. Voraussetzungen, Kontostand und Transaktions-Preflight bleiben maßgeblich.",
    dependencyPlanTitle: "AUSBAUPLAN",
    dependencyPlanTarget: (building: string, level: number) =>
      `Pfad zu ${building}, Stufe ${level}.`,
    dependencyPlanRunning: "LÄUFT",
    dependencyPlanNext: "NÄCHSTER SCHRITT",
    dependencyPlanLater: "DANACH",
    dependencyPlanSlot: (slot: number, duration: string) =>
      `Bauplatz ${slot} · ${duration}`,
    dependencyPlanCompletes: (time: string) => `Fertig in ${time}`,
    dependencyPlanDeficit: (cost: string) => `Fehlend: ${cost}.`,
    dependencyPlanMarket: "Markt öffnen",
    marketAcquire: (amount: string, resource: string) =>
      `${amount} ${resource} beschaffen`,
    marketMissingResources:
      "Fehlende Rohstoffe einzeln am Markt beschaffen. Der Ausbau startet danach nie automatisch.",
    marketGoldUnavailable:
      "Gold kann der Rohstoffmarkt nicht beschaffen. Verdiene oder erhalte zuerst den fehlenden Betrag.",
    marketOrigin: (source: string, amount: string, resource: string) =>
      `Für ${source}: exakt ${amount} ${resource} vorausgewählt. Kauf und Ursprung bleiben getrennt.`,
    dependencyPlanStart: (building: string, level: number) =>
      `${building} auf Stufe ${level} starten`,
    dependencyPlanBlocked: (reason: string) =>
      reason === "duration_unavailable"
        ? "Plan wartet auf eine verlässliche On-chain-Bauzeit."
        : "Plan blockiert: Voraussetzungen, Bauplätze oder Projektionen sind nicht verlässlich lesbar.",
    perDay: "Tag",
    perSecond: "s",
    barracksTitle: "KASERNE",
    trainArmy: "Armee ausbilden",
    unitsReady: (amount: string) => `${amount} Einheiten bereit`,
    attackAndReady: (attack: string, ready: string) =>
      `Angriff ${attack} · ${ready} bereit`,
    raidTitle: "ÜBERFALL",
    planMarch: "Marsch planen",
    marchEnRoute: "Marsch unterwegs",
    noFurtherMarch: "Kein weiterer Marsch, bis die Truppe zurück ist.",
    marchTo: (target: string) => `MARSCH NACH ${target}`,
    resolveWorldRaid:
      "Die Auflösung benötigt danach deine ausdrückliche Wallet-Bestätigung.",
    resolveDemoRaid: "Die Schlacht wird bei Ankunft ausgewertet.",
    resolveBattle: "Schlacht auswerten",
    lastReport: "LETZTER BERICHT",
    noTroopsSent: "Noch keine Truppen entsandt.",
    chooseRaidTarget: (target: string) =>
      `Wähle ${target} und deine Marschgruppe.`,
    worldRaidTarget: "einen World-Kontakt oder eine registrierte Wallet",
    demoRaidTarget: "ein Demo-Dorf",
    noLosses: "Keine Verluste",
    victory: "SIEG",
    retreat: "RÜCKZUG",
    noLoot: "Keine Beute",
    raidSummary: (loot: string, losses: string) =>
      `Feldlager-Beute: ${loot} · Verluste: ${losses}`,
    attackAgainst: (attack: string, defense: string) =>
      `Angriff ${attack} gegen ${defense}`,
    targetLocation: "Zielort",
    selectedContact: "GEWÄHLTER KONTAKT",
    worldRaidDescription: "On-chain-Dorf · nur Feldbestand raidbar",
    demoRaidDescription: "Lokale Demo-Gegner · nur Feldlager raidbar",
    chooseWorldContact: "World-Kontakt wählen",
    orWalletAddress: "Oder Wallet-Adresse",
    startMarch: "Marsch starten · 01:00",
    targetOption: (defense: string, stock: string) =>
      `Verteidigung ${defense} · Feldlager ${stock}`,
    noDemoVillages: "Keine Demo-Dörfer verfügbar",
    troopsReady: (amount: string) => `${amount} bereit`,
    marketTitle: "TAUSCHHALLE",
    worldMarketTitle: "CGOLD auf World Chain",
    worldMarketDescription: "Contract-Markt · keine P2P-Orders",
    goldTokenDetail: "ERC-20 · direkt im CivilizationGame",
    onChain: "ON-CHAIN",
    liquiditySpread: "CONTRACT-LIQUIDITÄT · 1,5 % SPREAD",
    marketExplanation:
      "Kaufe oder verkaufe Holz, Lehm und Stein direkt gegen CGOLD.",
    marketDetail:
      "Ressourcen sind ganze Dorf-Einheiten. Preis und Quote sind CGOLD-Wei pro Einheit; Gebühren bleiben als CGOLD-Reserve im Contract.",
    resource: "Rohstoff",
    amount: "Menge",
    loadQuote: "Live-Quote laden",
    quoteFor: (amount: string, resource: string) =>
      `Quote für ${amount} ${resource}`,
    quoteBuy: (amount: string, fee: string) =>
      `Kauf: ${amount} Wei CGOLD · Gebühr ${fee} Wei`,
    quoteSell: (amount: string, fee: string) =>
      `Verkauf: ${amount} Wei CGOLD · Gebühr ${fee} Wei`,
    quoteInventory: (inventory: string, reserve: string, deadline: string) =>
      `Inventar: ${inventory} · CGOLD-Reserve: ${reserve} · gültig bis Blockzeit ${deadline}`,
    buyQuote: "Kaufen (max. Quote)",
    sellQuote: "Verkaufen (min. Quote)",
    quoteRequired:
      "Vor der Wallet-Bestätigung muss eine Live-Quote geladen werden.",
    demoMarketTitle: "Rohstoffe handeln",
    demoMarketDescription: "Lokale Demo-Buchung",
    internalResource: "Interne Spielressource · kein Token",
    worldOnlyToken: "Nur in World-Modus als ERC-20",
    internal: "INTERN",
    fromResource: "Von",
    toResource: "Zu",
    swapDemo: "Im Demo-Spiel tauschen",
    civilizationGold: "CIVILIZATION GOLD",
    demoGoldOnly: "CGOLD existiert nur im World-Chain-Contract.",
    demoGoldDetail: "Diese Browserdemo simuliert weder Token noch WLD-Handel.",
    demoSettlementUnavailable: "Settlement nicht in Demo verfügbar",
    marketBadge: "Demo-Markt",
    demoFooter: (raids: string) =>
      `${raids} Demo-Überfälle · Kein Wallet verbunden`,
    worldFooter: (prestige: string) => `Prestige ${prestige} · World Chain`,
    mapHead: (prestige: string) => ` · Prestige ${prestige}`,
    boostStatus: {
      transaction_pending: "Die laufende Transaktion wird noch bestätigt.",
      construction_complete:
        "Der Bau ist fertig und kann jetzt abgeschlossen werden.",
      less_than_one_hour:
        "Für einen Boost muss mindestens 1 Stunde Bauzeit verbleiben.",
      construction_time_unavailable:
        "Die verbleibende Bauzeit konnte nicht zuverlässig gelesen werden.",
      no_boostable_construction: "Es gibt keinen boostbaren Bauauftrag.",
      default: "1 WLD reduziert die Bauzeit um genau 1 Stunde.",
    },
    worldAppBadge: "WORLD APP",
    worldAppConnected: "VERBUNDEN",
    goldTokenTitle: "Civilization Gold · CGOLD",
    worldTokenBadge: "WORLD",
    actionErrors: {
      user_rejected: "Transaktion abgebrochen.",
      contact_not_selected: "Kein World-Kontakt ausgewählt.",
      target_not_registered:
        "Dieses Wallet ist noch nicht für Civilization registriert.",
      self_raid: "Du kannst dein eigenes Dorf nicht angreifen.",
      world_app_wallet_required:
        "Diese Aktion muss direkt in World App bestätigt werden.",
      transaction_wallet_mismatch:
        "Wallet und angemeldete World-Adresse stimmen nicht überein.",
      world_market_unavailable:
        "Der aktuelle Contract bietet keinen Rohstoff-Swap.",
      receipt_timeout:
        "Transaktion eingereicht. Chain-Bestätigung steht noch aus.",
      claim_not_available:
        "Noch keine übertragbaren ganzen Ressourcen: Abklingzeit, Feldbestand und Speicher werden erneut geprüft.",
      transaction_pending:
        "Eine andere Transaktion wartet noch auf Chain-Bestätigung.",
      no_boostable_construction:
        "Es gibt keinen laufenden Bauauftrag zum Boosten.",
      construction_complete:
        "Der Bau ist bereits fertig und kann abgeschlossen werden.",
      less_than_one_hour:
        "Ein Boost ist erst ab mindestens 1 Stunde verbleibender Bauzeit möglich.",
      construction_time_unavailable:
        "Die verbleibende Bauzeit konnte nicht zuverlässig geprüft werden.",
      contract_missing_building_requirement:
        "Voraussetzung für dieses Gebäude fehlt.",
      contract_insufficient_resources:
        "Nicht genügend Rohstoffe für diesen Ausbau.",
      contract_construction_slots_full:
        "Alle Bauslots sind belegt. Schließe erst einen Bau ab.",
      contract_building_max_level:
        "Dieses Gebäude hat bereits die maximale Stufe.",
      contract_unregistered:
        "Dieses Wallet ist noch nicht für Civilization registriert.",
      transaction_preflight_failed:
        "Die Aktion konnte vor dem Versand nicht sicher geprüft werden.",
      contract_runtime_mismatched:
        "Die veröffentlichte Contract-Version passt nicht zu den Bauaufträgen. Keine Wallet-Aktion wurde geöffnet.",
      contract_runtime_failed:
        "Die Contract-Version konnte nicht sicher geprüft werden. Keine Wallet-Aktion wurde geöffnet.",
      contract_runtime_unavailable:
        "Die Contract-Prüfung ist derzeit nicht verfügbar. Keine Wallet-Aktion wurde geöffnet.",
      default: (reason: string) =>
        `World-Chain-Aktion fehlgeschlagen: ${reason}.`,
    },
    feedback: {
      buildingSelected: (name: string) => `${name} ausgewählt.`,
      panelArmy: "Bilde Truppen aus, sobald die Kaserne bereit ist.",
      panelWorldMarket:
        "Lade eine Live-Quote; der Contract erzwingt Preis, Liquidität, Slippage und Ablaufzeit.",
      panelDemoMarket: "Nur Holz, Lehm und Stein sind im Demo-Markt tauschbar.",
      panelRaid: "Stelle eine Marschgruppe zusammen.",
      worldClaim:
        "Feldressourcen im Contract gesichert. Nächste Sammlung nach 01:00.",
      demoClaim: (resources: string) =>
        `Im Speicher gesichert: ${resources}. Nächste Sammlung in 01:00.`,
      demoClaimEmpty:
        "Feldlager leer oder Speicher voll. Nächste Sammlung in 01:00.",
      collectorsEnRoute: "Sammler sind noch unterwegs.",
      worldUpgradeStarted: (name: string) => `${name}-Ausbau gestartet.`,
      demoUpgradeComplete: (name: string, level: number) =>
        `${name} auf Stufe ${level} ausgebaut.`,
      upgradeUnavailable: "Ausbau noch gesperrt oder Rohstoffe fehlen.",
      worldUpgradeComplete: "Ausbau on-chain abgeschlossen.",
      worldBoost:
        "Bauzeit um 1 Stunde reduziert; 1 WLD ging direkt an den Revenue Splitter.",
      worldPrestige:
        "Prestige abgeschlossen. Dorf zurückgesetzt, Produktionsbonus erhöht.",
      worldTrainingComplete: (name: string) => `${name} on-chain ausgebildet.`,
      demoTrainingComplete: (name: string) => `${name} ausgebildet.`,
      trainingUnavailable: "Ausbildung noch gesperrt oder Rohstoffe fehlen.",
      demoSwapComplete: (amount: string, resource: string) =>
        `${amount} ${resource} im Demo-Markt erhalten.`,
      demoSwapUnavailable:
        "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen.",
      marketAmountInvalid: "Bitte eine ganze Rohstoffmenge ab 1 eingeben.",
      marketQuoteLoading: "Live-Quote und Contract-Liquidität werden gelesen.",
      marketQuoteLoaded:
        "Live-Quote geladen. Prüfe Preis, Gebühr und Liquidität vor der Bestätigung.",
      marketPrefilled: (amount: string, resource: string) =>
        `${amount} ${resource} wurden als Markt-Intent vorausgewählt.`,
      marketQuoteRequired: "Lade zuerst eine aktuelle Live-Quote.",
      marketBuyComplete: "Rohstoffe atomar gegen CGOLD gekauft.",
      marketSellComplete: "Rohstoffe atomar gegen CGOLD verkauft.",
      opponentPickerOpening: "Öffne deine World-Kontakte.",
      opponentSelected: (name: string) => `${name} als Ziel gewählt.`,
      worldRaidStarted: "Marsch on-chain gestartet. Ankunft in 01:00.",
      demoRaidStarted: "Marsch gestartet. Ankunft in 01:00.",
      raidArmyRequired: "Wähle verfügbare Truppen für den Überfall.",
      worldRaidResolved: "Schlacht on-chain ausgewertet.",
      demoReset: "Demo-Dorf zurückgesetzt.",
      demoRaidResolved: (outcome: string) => `Marsch beendet: ${outcome}.`,
      demoRaidUnavailable: "Marsch konnte nicht ausgewertet werden.",
      worldTransactionConfirmation:
        "Bestätige die World-Chain-Transaktion in deiner Wallet.",
      worldTransactionPending:
        "Transaktion eingereicht. Der Chain-Status wird weiter aktualisiert.",
      pendingTransactionChecking:
        "Ausstehende Transaktion wird anhand ihres vorhandenen Hashes geprüft.",
      pendingTransactionStillPending:
        "Transaktion bleibt ausstehend. Der Chain-Status wird weiter aktualisiert.",
      pendingTransactionConfirmed: "Ausstehende Transaktion wurde bestätigt.",
      worldStateLoaded:
        "On-chain-Spielstand geladen. Aktionen werden direkt durch CivilizationGame geprüft.",
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
    reviewTitle: "Review wallet action",
    reviewInvalidatedTitle: "Review invalidated",
    reviewNotice: "Review this immutable action before your wallet is opened.",
    reviewFinality:
      "The action was handed to the wallet/chain. Finality is being checked.",
    reviewInvalidated:
      "Market inputs changed. Load a new quote and review again.",
    reviewWorldStateInvalidated:
      "The on-chain game state changed. Review the next construction step again.",
    reviewConfirm: "Confirm in wallet",
    reviewCancel: "Cancel",
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
    metadataDescription: "Civilization for World App",
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
    troopAssetUnavailable: (name: string) =>
      `${name} symbol unavailable. Army controls remain available.`,
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
    buildingDetails: {
      townhall: "Unlocks stronger upgrades.",
      timber: "Produces wood.",
      claypit: "Produces clay.",
      quarry: "Produces stone.",
      warehouse: "Increases the capacity of all resources.",
      workshop: "Required for gold and units.",
      goldmine: "Produces gold for training.",
      barracks: "Trains troops.",
    },
    buildDetail: "BUILDING DETAILS",
    buildProgress: "CONSTRUCTION IN PROGRESS",
    complete: "Complete",
    constructionRunning: "Construction in progress",
    completeUpgrade: "Complete upgrade",
    constructionNote: "The contract increases the level only after completion.",
    constructionSlotsOccupied: (occupied: number, capacity: number) =>
      `Construction slots occupied: ${occupied}/${capacity}`,
    boostConstruction: "Boost 1 hour for 1 WLD",
    maxLevel: "MAXIMUM LEVEL REACHED",
    fullyUpgraded: (name: string) => `${name} is fully upgraded.`,
    prestigeStart: (level: number) => `Start prestige ${level}`,
    prestigeDetail:
      "Prestige resets the village and permanently increases production by 10%.",
    noFurtherUpgrade: "No further upgrade is available for this building.",
    upgradeLocked: "UPGRADE LOCKED",
    unlockUpgrade: "Meet these levels to unlock the upgrade.",
    meetRequirements: "Meet requirements",
    buildDurationLoading:
      "On-chain construction time: loading from the contract …",
    buildDurationUnavailable:
      "On-chain construction time: currently unavailable",
    buildDuration: (duration: string) =>
      `On-chain construction time: ${duration}`,
    upgradeCost: (level: number) => `COST FOR LEVEL ${level}`,
    startWorldUpgrade: (level: number) => `Start upgrade to level ${level}`,
    startDemoUpgrade: (level: number) => `Upgrade to level ${level}`,
    nextProduction: (production: string) => ` Next production: ${production}.`,
    upgradeImpactTitle: "UPGRADE IMPACT",
    upgradeImpactProduction: (resource: string) => `${resource} production`,
    upgradeImpactCapacity: "Storage capacity per resource",
    upgradeImpactSlots: "Construction slots",
    upgradeImpactDefense: "Defense",
    upgradeImpactUnlocks: "Newly unlocked",
    upgradeImpactNoDirectEffect:
      "No direct readable contract effect is defined for this upgrade.",
    upgradeImpactDemoUnavailable:
      "Contract comparison is unavailable in local demo mode.",
    upgradeImpactUnavailable:
      "Contract-gated effects are currently unavailable for this game state.",
    upgradeImpactMaxLevel:
      "No further comparison is available: the contract maximum level has been reached.",
    upgradeImpactCapacityRule:
      "Contract rule: starts at 500; each warehouse level multiplies by 1.7 and rounds down.",
    upgradeImpactSlotsRule:
      "Contract rule: 2 slots from workshop level 11, 3 from level 21.",
    upgradeImpactDefenseRule:
      "Contract rule: each town hall level adds +20; troop values and rounding are unchanged.",
    upgradeImpactContractGated:
      "Read-only contract projection. Requirements, balances, and transaction preflight still apply.",
    dependencyPlanTitle: "BUILD PLAN",
    dependencyPlanTarget: (building: string, level: number) =>
      `Path to ${building}, level ${level}.`,
    dependencyPlanRunning: "RUNNING",
    dependencyPlanNext: "NEXT STEP",
    dependencyPlanLater: "THEN",
    dependencyPlanSlot: (slot: number, duration: string) =>
      `Slot ${slot} · ${duration}`,
    dependencyPlanCompletes: (time: string) => `Completes in ${time}`,
    dependencyPlanDeficit: (cost: string) => `Missing: ${cost}.`,
    dependencyPlanMarket: "Open market",
    marketAcquire: (amount: string, resource: string) =>
      `Get ${amount} ${resource}`,
    marketMissingResources:
      "Acquire missing resources one at a time at the market. The upgrade never starts automatically afterwards.",
    marketGoldUnavailable:
      "The resource market cannot acquire gold. Earn or receive the missing amount first.",
    marketOrigin: (source: string, amount: string, resource: string) =>
      `For ${source}: exactly ${amount} ${resource} is preselected. The purchase and origin remain separate.`,
    dependencyPlanStart: (building: string, level: number) =>
      `Start ${building} to level ${level}`,
    dependencyPlanBlocked: (reason: string) =>
      reason === "duration_unavailable"
        ? "Plan is waiting for a reliable on-chain construction time."
        : "Plan blocked: requirements, slots, or projections are not reliably available.",
    perDay: "day",
    perSecond: "s",
    barracksTitle: "BARRACKS",
    trainArmy: "Train army",
    unitsReady: (amount: string) => `${amount} units ready`,
    attackAndReady: (attack: string, ready: string) =>
      `Attack ${attack} · ${ready} ready`,
    raidTitle: "RAID",
    planMarch: "Plan march",
    marchEnRoute: "March underway",
    noFurtherMarch: "No further march until the troops return.",
    marchTo: (target: string) => `MARCH TO ${target}`,
    resolveWorldRaid:
      "Resolving it then requires your explicit wallet confirmation.",
    resolveDemoRaid: "The battle is evaluated on arrival.",
    resolveBattle: "Resolve battle",
    lastReport: "LAST REPORT",
    noTroopsSent: "No troops sent yet.",
    chooseRaidTarget: (target: string) =>
      `Choose ${target} and your marching party.`,
    worldRaidTarget: "a World contact or registered wallet",
    demoRaidTarget: "a demo village",
    noLosses: "No losses",
    victory: "VICTORY",
    retreat: "RETREAT",
    noLoot: "No loot",
    raidSummary: (loot: string, losses: string) =>
      `Field-camp loot: ${loot} · Losses: ${losses}`,
    attackAgainst: (attack: string, defense: string) =>
      `Attack ${attack} against ${defense}`,
    targetLocation: "Target location",
    selectedContact: "SELECTED CONTACT",
    worldRaidDescription: "On-chain village · only field stock can be raided",
    demoRaidDescription:
      "Local demo opponents · only field stock can be raided",
    chooseWorldContact: "Choose World contact",
    orWalletAddress: "Or wallet address",
    startMarch: "Start march · 01:00",
    targetOption: (defense: string, stock: string) =>
      `Defense ${defense} · Field camp ${stock}`,
    noDemoVillages: "No demo villages available",
    troopsReady: (amount: string) => `${amount} ready`,
    marketTitle: "TRADING HALL",
    worldMarketTitle: "CGOLD on World Chain",
    worldMarketDescription: "Contract market · no P2P orders",
    goldTokenDetail: "ERC-20 · directly in CivilizationGame",
    onChain: "ON-CHAIN",
    liquiditySpread: "CONTRACT LIQUIDITY · 1.5% SPREAD",
    marketExplanation: "Buy or sell wood, clay, and stone directly for CGOLD.",
    marketDetail:
      "Resources are whole village units. Price and quote are CGOLD Wei per unit; fees remain as a CGOLD reserve in the contract.",
    resource: "Resource",
    amount: "Amount",
    loadQuote: "Load live quote",
    quoteFor: (amount: string, resource: string) =>
      `Quote for ${amount} ${resource}`,
    quoteBuy: (amount: string, fee: string) =>
      `Buy: ${amount} Wei CGOLD · fee ${fee} Wei`,
    quoteSell: (amount: string, fee: string) =>
      `Sell: ${amount} Wei CGOLD · fee ${fee} Wei`,
    quoteInventory: (inventory: string, reserve: string, deadline: string) =>
      `Inventory: ${inventory} · CGOLD reserve: ${reserve} · valid until block time ${deadline}`,
    buyQuote: "Buy (max. quote)",
    sellQuote: "Sell (min. quote)",
    quoteRequired: "Load a live quote before confirming in your wallet.",
    demoMarketTitle: "Trade resources",
    demoMarketDescription: "Local demo entry",
    internalResource: "Internal game resource · not a token",
    worldOnlyToken: "ERC-20 only in World mode",
    internal: "INTERNAL",
    fromResource: "From",
    toResource: "To",
    swapDemo: "Swap in demo game",
    civilizationGold: "CIVILIZATION GOLD",
    demoGoldOnly: "CGOLD exists only in the World Chain contract.",
    demoGoldDetail:
      "This browser demo simulates neither tokens nor WLD trading.",
    demoSettlementUnavailable: "Settlement unavailable in demo",
    marketBadge: "Demo market",
    demoFooter: (raids: string) => `${raids} demo raids · no wallet connected`,
    worldFooter: (prestige: string) => `Prestige ${prestige} · World Chain`,
    mapHead: (prestige: string) => ` · Prestige ${prestige}`,
    boostStatus: {
      transaction_pending: "The pending transaction is still being confirmed.",
      construction_complete:
        "Construction is complete and can now be finished.",
      less_than_one_hour:
        "At least 1 hour of construction time must remain to boost.",
      construction_time_unavailable:
        "The remaining construction time could not be read reliably.",
      no_boostable_construction: "There is no boostable construction order.",
      default: "1 WLD reduces construction time by exactly 1 hour.",
    },
    worldAppBadge: "WORLD APP",
    worldAppConnected: "CONNECTED",
    goldTokenTitle: "Civilization Gold · CGOLD",
    worldTokenBadge: "WORLD",
    actionErrors: {
      user_rejected: "Transaction cancelled.",
      contact_not_selected: "No World contact selected.",
      target_not_registered:
        "This wallet is not yet registered for Civilization.",
      self_raid: "You cannot attack your own village.",
      world_app_wallet_required:
        "This action must be confirmed directly in World App.",
      transaction_wallet_mismatch:
        "The wallet and signed-in World address do not match.",
      world_market_unavailable:
        "The current contract does not offer a resource swap.",
      receipt_timeout:
        "Transaction submitted. Chain confirmation is still pending.",
      claim_not_available:
        "No transferable whole resources yet: cooldown, field stock, and storage are being checked again.",
      transaction_pending:
        "Another transaction is still awaiting chain confirmation.",
      no_boostable_construction: "There is no active construction to boost.",
      construction_complete:
        "Construction is already complete and can be finished.",
      less_than_one_hour:
        "At least 1 hour of construction time must remain to boost.",
      construction_time_unavailable:
        "The remaining construction time could not be checked reliably.",
      contract_missing_building_requirement:
        "A prerequisite for this building is missing.",
      contract_insufficient_resources:
        "There are not enough resources for this upgrade.",
      contract_construction_slots_full:
        "All construction slots are occupied. Finish a construction first.",
      contract_building_max_level:
        "This building is already at its maximum level.",
      contract_unregistered:
        "This wallet is not yet registered for Civilization.",
      transaction_preflight_failed:
        "The action could not be safely checked before it was sent.",
      contract_runtime_mismatched:
        "The published contract version does not match construction jobs. No wallet action was opened.",
      contract_runtime_failed:
        "The contract version could not be verified safely. No wallet action was opened.",
      contract_runtime_unavailable:
        "Contract verification is currently unavailable. No wallet action was opened.",
      default: (reason: string) => `World Chain action failed: ${reason}.`,
    },
    feedback: {
      buildingSelected: (name: string) => `${name} selected.`,
      panelArmy: "Train troops once the barracks is ready.",
      panelWorldMarket:
        "Load a live quote; the contract enforces price, liquidity, slippage, and expiry.",
      panelDemoMarket:
        "Only wood, clay, and stone can be swapped in the demo market.",
      panelRaid: "Assemble a marching party.",
      worldClaim:
        "Field resources secured in the contract. Next collection in 01:00.",
      demoClaim: (resources: string) =>
        `Secured in storage: ${resources}. Next collection in 01:00.`,
      demoClaimEmpty:
        "Field camp empty or storage full. Next collection in 01:00.",
      collectorsEnRoute: "Collectors are still en route.",
      worldUpgradeStarted: (name: string) => `${name} upgrade started.`,
      demoUpgradeComplete: (name: string, level: number) =>
        `${name} upgraded to level ${level}.`,
      upgradeUnavailable: "Upgrade still locked or resources are missing.",
      worldUpgradeComplete: "Upgrade completed on-chain.",
      worldBoost:
        "Construction time reduced by 1 hour; 1 WLD went directly to the Revenue Splitter.",
      worldPrestige:
        "Prestige complete. Village reset, production bonus increased.",
      worldTrainingComplete: (name: string) => `${name} trained on-chain.`,
      demoTrainingComplete: (name: string) => `${name} trained.`,
      trainingUnavailable: "Training still locked or resources are missing.",
      demoSwapComplete: (amount: string, resource: string) =>
        `Received ${amount} ${resource} in the demo market.`,
      demoSwapUnavailable:
        "Swap unavailable: check source, target, amount, or storage.",
      marketAmountInvalid: "Enter a whole resource amount of at least 1.",
      marketQuoteLoading: "Reading the live quote and contract liquidity.",
      marketQuoteLoaded:
        "Live quote loaded. Check price, fee, and liquidity before confirming.",
      marketPrefilled: (amount: string, resource: string) =>
        `${amount} ${resource} is preselected as the market intent.`,
      marketQuoteRequired: "Load a current live quote first.",
      marketBuyComplete: "Resources bought atomically for CGOLD.",
      marketSellComplete: "Resources sold atomically for CGOLD.",
      opponentPickerOpening: "Opening your World contacts.",
      opponentSelected: (name: string) => `${name} selected as target.`,
      worldRaidStarted: "March started on-chain. Arrival in 01:00.",
      demoRaidStarted: "March started. Arrival in 01:00.",
      raidArmyRequired: "Choose available troops for the raid.",
      worldRaidResolved: "Battle resolved on-chain.",
      demoReset: "Demo village reset.",
      demoRaidResolved: (outcome: string) => `March finished: ${outcome}.`,
      demoRaidUnavailable: "March could not be resolved.",
      worldTransactionConfirmation:
        "Confirm the World Chain transaction in your wallet.",
      worldTransactionPending:
        "Transaction submitted. The chain status will continue to update.",
      pendingTransactionChecking:
        "Checking the pending transaction using its existing hash.",
      pendingTransactionStillPending:
        "Transaction remains pending. The chain status will continue to update.",
      pendingTransactionConfirmed: "Pending transaction confirmed.",
      worldStateLoaded:
        "On-chain game state loaded. Actions are checked directly by CivilizationGame.",
    },
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
