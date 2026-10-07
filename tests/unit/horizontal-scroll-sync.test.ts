import { describe, expect, it } from 'vitest';

import { getSynchronizedScrollLeft, synchronizeHorizontalScroll } from '../../lib/horizontal-scroll-sync';

describe('horizontal scroll synchronization', () => {
  it('keeps the same relative horizontal position when scrollports have different widths', () => {
    expect(getSynchronizedScrollLeft(400, 1200, 400, 700, 400)).toBe(150);
  });

  it('clamps the mirrored position to the target scroll range', () => {
    expect(getSynchronizedScrollLeft(900, 1200, 1000, 400, 200)).toBe(200);
  });

  it('returns the start position when either scrollport cannot scroll', () => {
    expect(getSynchronizedScrollLeft(300, 400, 500, 500, 500)).toBe(0);
  });

  it('moves the paired scrollport when the user drags either horizontal scrollbar', () => {
    const draggedAtTop = { scrollLeft: 240, scrollWidth: 1540, clientWidth: 740 };
    const board = { scrollLeft: 0, scrollWidth: 1540, clientWidth: 700 };

    synchronizeHorizontalScroll(draggedAtTop, board);

    expect(board.scrollLeft).toBe(252);
  });
});
