import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useToday } from './useToday';

describe('useToday', () => {
  afterEach(() => jest.useRealTimers());

  it('rolls over to the new day at midnight', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 23, 59, 0) });
    const { result } = renderHook(() => useToday());
    expect(result.current.getDate()).toBe(12);

    act(() => jest.advanceTimersByTime(2 * 60 * 1000));
    expect(result.current.getDate()).toBe(13);
  });

  it('rolls over when the app returns to the foreground on a new day', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 22, 0, 0) });
    let onChange: (s: string) => void = () => {};
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
      onChange = cb as (s: string) => void;
      return { remove: jest.fn() } as never;
    });
    const { result } = renderHook(() => useToday());

    // The background pause kept the midnight timer from firing.
    jest.setSystemTime(new Date(2026, 9, 13, 8, 0, 0));
    act(() => onChange('active'));
    expect(result.current.getDate()).toBe(13);
    spy.mockRestore();
  });

  it('keeps the same Date object within the day', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0, 0) });
    let onChange: (s: string) => void = () => {};
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
      onChange = cb as (s: string) => void;
      return { remove: jest.fn() } as never;
    });
    const { result } = renderHook(() => useToday());
    const first = result.current;

    jest.setSystemTime(new Date(2026, 9, 12, 18, 0, 0));
    act(() => onChange('active'));
    expect(result.current).toBe(first);
    spy.mockRestore();
  });
});
