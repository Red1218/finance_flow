import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SignInPrompt } from './SignInPrompt';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('SignInPrompt', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the given message', () => {
    render(<SignInPrompt message="Sign in to see your spending." />);
    expect(screen.getByText('Sign in to see your spending.')).toBeTruthy();
  });

  it('navigates to sign-in when pressed', async () => {
    render(<SignInPrompt message="Sign in to continue." />);
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });
});
