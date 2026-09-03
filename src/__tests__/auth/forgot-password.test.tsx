// src/__tests__/auth/forgot-password.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import ForgotPassword from '../../../app/account/forgot-password';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockRequestPasswordReset = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ requestPasswordReset: (email: string) => mockRequestPasswordReset(email) }),
}));

describe('Forgot password screen', () => {
  beforeEach(() => mockRequestPasswordReset.mockReset());

  it('requests a reset email and shows a confirmation', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    render(<ForgotPassword />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Send reset link'));
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('a@b.com');
    expect(await screen.findByText(/Check your email/i)).toBeTruthy();
  });
});
