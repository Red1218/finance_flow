import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { TabBar } from './TabBar';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// The offline line above the tabs has its own data wiring; not under test here.
jest.mock('./OfflineBar', () => ({ OfflineBar: () => null }));

function makeProps(
  activeIndex: number,
  navigate = jest.fn(),
  emit = jest.fn(() => ({ defaultPrevented: false })),
  dispatch = jest.fn()
): BottomTabBarProps {
  const routes = [
    { key: 'home', name: 'index', params: undefined },
    { key: 'ledger', name: 'transactions/index', params: undefined },
    // More after Home's "All bills" link: its stack is on Bills, and the link's params stay on the tab route.
    { key: 'more', name: 'more', params: { screen: 'bills' }, state: { key: 'more-stack', index: 1 } },
  ];
  const descriptors = {
    home: { options: { title: 'Home' } },
    ledger: { options: { title: 'Ledger' } },
    more: { options: { title: 'More' } },
  };
  return {
    state: { index: activeIndex, routes },
    descriptors,
    navigation: { navigate, emit, dispatch },
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
    expect(navigate).toHaveBeenCalledWith('transactions/index');
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

  it('opens the More list, not the screen a link from another tab left it on', async () => {
    const navigate = jest.fn();
    const dispatch = jest.fn();
    render(<TabBar {...makeProps(0, navigate, undefined, dispatch)} />);
    await userEvent.press(screen.getByText('More'));
    expect(navigate).toHaveBeenCalledWith('more');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP', target: 'more-stack' }));
  });

  it('goes back to the More list when More is tapped again', async () => {
    const dispatch = jest.fn();
    render(<TabBar {...makeProps(2, jest.fn(), undefined, dispatch)} />);
    await userEvent.press(screen.getByText('More'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP', target: 'more-stack' }));
  });
});
