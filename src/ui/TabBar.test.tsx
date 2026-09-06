import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { TabBar } from './TabBar';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

function makeProps(
  activeIndex: number,
  navigate = jest.fn(),
  emit = jest.fn(() => ({ defaultPrevented: false }))
): BottomTabBarProps {
  const routes = [
    { key: 'home', name: 'index', params: undefined },
    { key: 'ledger', name: 'transactions/index', params: undefined },
  ];
  const descriptors = {
    home: { options: { title: 'Home' } },
    ledger: { options: { title: 'Ledger' } },
  };
  return {
    state: { index: activeIndex, routes },
    descriptors,
    navigation: { navigate, emit },
    insets: { top: 0, bottom: 20, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
}

describe('TabBar', () => {
  it('renders a label per route', () => {
    render(<TabBar {...makeProps(0)} />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Ledger')).toBeTruthy();
  });

  it('navigates to a tab when pressed', async () => {
    const navigate = jest.fn();
    render(<TabBar {...makeProps(0, navigate)} />);
    await userEvent.press(screen.getByText('Ledger'));
    expect(navigate).toHaveBeenCalledWith('transactions/index', undefined);
  });

  it('does not navigate when pressing the already-active tab', async () => {
    const navigate = jest.fn();
    render(<TabBar {...makeProps(0, navigate)} />);
    await userEvent.press(screen.getByText('Home'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when the tabPress event is prevented', async () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: true }));
    render(<TabBar {...makeProps(0, navigate, emit)} />);
    await userEvent.press(screen.getByText('Ledger'));
    expect(navigate).not.toHaveBeenCalled();
  });
});
