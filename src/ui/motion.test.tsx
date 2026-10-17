import { act, renderHook } from '@testing-library/react-native';
import { usePullRefresh } from './motion';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('usePullRefresh', () => {
  it('ignores background refetches and shows only for a pull', () => {
    const refetch = jest.fn();
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => usePullRefresh(loading, refetch), {
      initialProps: { loading: false },
    });
    rerender({ loading: true }); // e.g. refetch on focus
    expect(result.current.refreshing).toBe(false);
    rerender({ loading: false });

    act(() => result.current.onRefresh());
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);

    rerender({ loading: true });
    rerender({ loading: false });
    // A fast reload still shows the tile for 700ms so the motion reads.
    expect(result.current.refreshing).toBe(true);
    act(() => jest.advanceTimersByTime(700));
    expect(result.current.refreshing).toBe(false);
  });

  it('gives up after 8s if the reload never finishes', () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => usePullRefresh(loading, jest.fn()), {
      initialProps: { loading: false },
    });
    act(() => result.current.onRefresh());
    rerender({ loading: true });
    act(() => jest.advanceTimersByTime(8000));
    expect(result.current.refreshing).toBe(false);
  });
});
