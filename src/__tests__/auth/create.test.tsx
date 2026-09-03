// src/__tests__/auth/create.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import CreateAccount from '../../../app/account/create';
import { EmailAlreadyRegisteredError, InvalidOtpError, WeakPasswordError } from '../../data/repositories/authErrors';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockStartEmailUpgrade = jest.fn();
const mockVerifyUpgradeOtp = jest.fn();
const mockCompleteUpgrade = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({
    startEmailUpgrade: (email: string) => mockStartEmailUpgrade(email),
    verifyUpgradeOtp: (email: string, token: string) => mockVerifyUpgradeOtp(email, token),
    completeUpgrade: (password: string) => mockCompleteUpgrade(password),
  }),
}));

describe('Create account screen', () => {
  beforeEach(() => {
    mockStartEmailUpgrade.mockReset();
    mockVerifyUpgradeOtp.mockReset();
    mockCompleteUpgrade.mockReset();
    mockPush.mockClear();
  });

  it('walks email -> OTP -> password -> done on the happy path', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockResolvedValue(undefined);
    mockCompleteUpgrade.mockResolvedValue(undefined);

    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));
    expect(mockStartEmailUpgrade).toHaveBeenCalledWith('a@b.com');

    expect(await screen.findByPlaceholderText('6-digit code')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '123456');
    await userEvent.press(screen.getByText('Verify'));
    expect(mockVerifyUpgradeOtp).toHaveBeenCalledWith('a@b.com', '123456');

    expect(await screen.findByPlaceholderText('Password')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Set password'));
    expect(mockCompleteUpgrade).toHaveBeenCalledWith('S3cur3-Passw0rd');

    expect(await screen.findByText(/Account created/i)).toBeTruthy();
  });

  it('offers sign-in instead when the email is already registered', async () => {
    mockStartEmailUpgrade.mockRejectedValue(new EmailAlreadyRegisteredError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'taken@b.com');
    await userEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('This email already has an account — sign in instead')).toBeTruthy();
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });

  it('shows an inline error and stays on the OTP step for an invalid code', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockRejectedValue(new InvalidOtpError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '000000');
    await userEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText("That code isn't right — check and try again")).toBeTruthy();
    expect(screen.getByPlaceholderText('6-digit code')).toBeTruthy();
  });

  it('shows an inline error and stays on the password step for a weak password', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockResolvedValue(undefined);
    mockCompleteUpgrade.mockRejectedValue(new WeakPasswordError('Password should be at least 6 characters'));
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '123456');
    await userEvent.press(screen.getByText('Verify'));
    await screen.findByPlaceholderText('Password');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'abc');
    await userEvent.press(screen.getByText('Set password'));

    expect(await screen.findByText('Password should be at least 6 characters')).toBeTruthy();
  });
});
