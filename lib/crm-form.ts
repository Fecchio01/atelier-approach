export function parseClosingValues(saleValueInput: string | undefined, mrrInput: string | undefined) {
  if (!saleValueInput?.trim() || !mrrInput?.trim()) {
    return null;
  }

  const saleValue = Number(saleValueInput);
  const mrr = Number(mrrInput);
  if (!Number.isFinite(saleValue) || !Number.isFinite(mrr) || saleValue < 0 || mrr < 0) {
    return null;
  }

  return { saleValue, mrr };
}
