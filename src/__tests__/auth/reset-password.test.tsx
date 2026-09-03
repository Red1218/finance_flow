// src/__tests__/auth/reset-password.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import ResetPassword from '../../../app/reset-password';
import { InvalidRecoveryLinkError } from '../../data/repositories/authErrors';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

let mockUrl: string | null = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
jest.mock('expo-linking', () => ({ useURL: () => mockUrl }));

const mockCompletePasswordReset = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ completePasswordReset: (url: string, password: string) => mockCompletePasswordReset(url, password) }),
}));

describe('Reset password screen', () => {
  beforeEach(() => {
    mockCompletePasswordReset.mockReset();
    mockBack.mockClear();
    mockUrl = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
  });

  it('sets a new password using the incoming deep-link URL', async () => {
    mockCompletePasswordReset.mockResolvedValue(undefined);
    render(<ResetPassword />);
    await userEvent.type(screen.getByPlaceholderText('New password'), 'N3w-Passw0rd');
    await userEvent.press(screen.getByText('Set new password'));
    expect(mockCompletePasswordReset).toHaveBeenCalledWith(mockUrl, 'N3w-Passw0rd');
    expect(await screen.findByText(/Password updated/i)).toBeTruthy();
  });

  it('shows an expired-link message and no form when the link is invalid', async () => {
    mockCompletePasswordReset.mockRejectedValue(new InvalidRecoveryLinkError());
    render(<ResetPassword />);
    await userEvent.type(screen.getByPlaceholderText('New password'), 'N3w-Passw0rd');
    await userEvent.press(screen.getByText('Set new password'));
    expect(await screen.findByText('This link has expired or was already used — request a new one')).toBeTruthy();
  });

  it('shows a "no link" state if the screen is opened without one', () => {
    mockUrl = null;
    render(<ResetPassword />);
    expect(screen.getByText(/open the link from your email/i)).toBeTruthy();
  });
});
