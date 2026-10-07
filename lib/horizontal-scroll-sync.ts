export type HorizontalScrollPort = {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
};

export function getSynchronizedScrollLeft(
  sourceScrollLeft: number,
  sourceScrollWidth: number,
  sourceClientWidth: number,
  targetScrollWidth: number,
  targetClientWidth: number
) {
  const sourceRange = Math.max(0, sourceScrollWidth - sourceClientWidth);
  const targetRange = Math.max(0, targetScrollWidth - targetClientWidth);
  if (sourceRange === 0 || targetRange === 0) return 0;

  const progress = Math.min(1, Math.max(0, sourceScrollLeft / sourceRange));
  return progress * targetRange;
}

export function synchronizeHorizontalScroll(source: HorizontalScrollPort, target: HorizontalScrollPort | null) {
  if (!target) return;
  const nextScrollLeft = getSynchronizedScrollLeft(
    source.scrollLeft,
    source.scrollWidth,
    source.clientWidth,
    target.scrollWidth,
    target.clientWidth
  );
  if (Math.abs(target.scrollLeft - nextScrollLeft) > 1) target.scrollLeft = nextScrollLeft;
}
