export function boostConstructionStatus(reason, copy) {
  return copy.boostStatus[reason] || copy.boostStatus.default;
}
