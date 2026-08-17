export function boostConstructionStatus(reason) {
  return (
    {
      transaction_pending: "Die laufende Transaktion wird noch bestätigt.",
      construction_complete:
        "Der Bau ist fertig und kann jetzt abgeschlossen werden.",
      less_than_one_hour:
        "Für einen Boost muss mindestens 1 Stunde Bauzeit verbleiben.",
      construction_time_unavailable:
        "Die verbleibende Bauzeit konnte nicht zuverlässig gelesen werden.",
      no_boostable_construction: "Es gibt keinen boostbaren Bauauftrag.",
    }[reason] || "1 WLD reduziert die Bauzeit um genau 1 Stunde."
  );
}
