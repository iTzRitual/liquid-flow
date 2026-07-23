import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useResizableSidebar } from './useResizableSidebar';

// A React.PointerEvent stand-in with just the fields beginResize reads.
const pointerDownAt = (clientX: number) => ({ clientX, preventDefault() {} }) as unknown as React.PointerEvent;
const move = (clientX: number) => window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
const release = () => window.dispatchEvent(new MouseEvent('pointerup', {}));

describe('useResizableSidebar', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to 320 and clamps a drag to [240, 480]', () => {
    const { result } = renderHook(() => useResizableSidebar());
    expect(result.current.width).toBe(320);

    act(() => result.current.beginResize(pointerDownAt(500)));
    act(() => move(600)); // +100 → 420
    expect(result.current.width).toBe(420);
    act(() => move(900)); // +400 → clamps to 480
    expect(result.current.width).toBe(480);
    act(() => release());
    expect(result.current.resizing).toBe(false);
  });

  it('collapses on a click (press with no drag)', () => {
    const { result } = renderHook(() => useResizableSidebar());
    act(() => result.current.beginResize(pointerDownAt(500)));
    act(() => release()); // no pointermove → treated as a click
    expect(result.current.collapsed).toBe(true);
    expect(result.current.width).toBe(320); // width untouched
  });

  it('reopens a collapsed rail on a click', () => {
    const { result } = renderHook(() => useResizableSidebar({ defaultCollapsed: true }));
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.beginResize(pointerDownAt(8)));
    act(() => release()); // click with no drag → toggle open
    expect(result.current.collapsed).toBe(false);
  });

  it('drags a collapsed rail back open from zero width', () => {
    const { result } = renderHook(() => useResizableSidebar({ defaultCollapsed: true }));
    act(() => result.current.beginResize(pointerDownAt(8)));
    act(() => move(308)); // from collapsed: desired = 0 + (308-8) = 300 → expand to 300
    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(300);
    act(() => release());
  });

  it('toggles collapse with ⌘B / Ctrl+B', () => {
    const { result } = renderHook(() => useResizableSidebar());
    expect(result.current.collapsed).toBe(false);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true })));
    expect(result.current.collapsed).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })));
    expect(result.current.collapsed).toBe(false);
  });

  it('collapses when dragged narrower than the threshold', () => {
    const { result } = renderHook(() => useResizableSidebar());
    act(() => result.current.beginResize(pointerDownAt(500)));
    act(() => move(360)); // 320 + (360-500) = 180 < 200 → collapse
    expect(result.current.collapsed).toBe(true);
  });

  it('remembers the width in localStorage when a storageKey is given', () => {
    const { result } = renderHook(() => useResizableSidebar({ storageKey: 'test.sidebar' }));
    act(() => result.current.beginResize(pointerDownAt(500)));
    act(() => move(560)); // +60 → 380
    act(() => release());
    expect(window.localStorage.getItem('test.sidebar')).toBe('380');

    // a freshly mounted hook restores the remembered width
    const { result: restored } = renderHook(() => useResizableSidebar({ storageKey: 'test.sidebar' }));
    expect(restored.current.width).toBe(380);
  });

  it('does not touch localStorage without a storageKey', () => {
    const { result } = renderHook(() => useResizableSidebar());
    act(() => result.current.beginResize(pointerDownAt(500)));
    act(() => move(560));
    act(() => release());
    expect(window.localStorage.length).toBe(0);
  });
});
