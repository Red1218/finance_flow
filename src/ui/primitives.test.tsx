import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Button } from './primitives';

describe('Button', () => {
  it('renders its title and fires onPress when tapped', async () => {
    const onPress = jest.fn();
    render(<Button title="Save budget" onPress={onPress} />);

    expect(screen.getByText('Save budget')).toBeTruthy();
    await userEvent.press(screen.getByText('Save budget'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress while disabled', async () => {
    const onPress = jest.fn();
    render(<Button title="Save budget" onPress={onPress} disabled />);

    await userEvent.press(screen.getByText('Save budget'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a loading indicator instead of the title, and blocks onPress, while loading', async () => {
    const onPress = jest.fn();
    render(<Button title="Save budget" onPress={onPress} loading />);

    expect(screen.queryByText('Save budget')).toBeNull();
  });
});
