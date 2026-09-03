// src/__tests__/auth/create.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import CreateAccount from '../../../app/account/create';
import { EmailAlreadyRegisteredError, InvalidOtpError, WeakPasswordError, RateLimitedError } from '../../data/repositories/authErrors';

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
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({
    startEmailUpgrade: (email: string, password: string) => mockStartEmailUpgrade(email, password),
    verifyUpgradeOtp: (email: string, token: string) => mockVerifyUpgradeOtp(email, token),
  }),
}));

describe('Create account screen', () => {
  beforeEach(() => {
    mockStartEmailUpgrade.mockReset();
    mockVerifyUpgradeOtp.mockReset();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('walks email+password -> OTP -> done on the happy path', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockResolvedValue(undefined);

    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Continue'));
    expect(mockStartEmailUpgrade).toHaveBeenCalledWith('a@b.com', 'S3cur3-Passw0rd');

    expect(await screen.findByPlaceholderText('6-digit code')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '123456');
    await userEvent.press(screen.getByText('Verify'));
    expect(mockVerifyUpgradeOtp).toHaveBeenCalledWith('a@b.com', '123456');

    expect(await screen.findByText(/Account created/i)).toBeTruthy();
  });

  it('requires a password before submitting', async () => {
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('Enter a password')).toBeTruthy();
    expect(mockStartEmailUpgrade).not.toHaveBeenCalled();
  });

  it('offers sign-in instead when the email is already registered', async () => {
    mockStartEmailUpgrade.mockRejectedValue(new EmailAlreadyRegisteredError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'taken@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('This email already has an account — sign in instead')).toBeTruthy();
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });

  it('shows an inline error and stays on the email+password step for a weak password', async () => {
    mockStartEmailUpgrade.mockRejectedValue(new WeakPasswordError('Password should be at least 6 characters'));
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'abc');
    await userEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('Password should be at least 6 characters')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
  });

  it('shows an inline error and stays on the OTP step for an invalid code', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockRejectedValue(new InvalidOtpError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '000000');
    await userEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText("That code isn't right — check and try again")).toBeTruthy();
    expect(screen.getByPlaceholderText('6-digit code')).toBeTruthy();
  });

  it('resends the code by re-invoking the same combined upgrade call', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');
    expect(mockStartEmailUpgrade).toHaveBeenCalledTimes(1);

    await userEvent.press(screen.getByText("Didn't get a code? Resend"));
    expect(mockStartEmailUpgrade).toHaveBeenCalledTimes(2);
    expect(mockStartEmailUpgrade).toHaveBeenLastCalledWith('a@b.com', 'S3cur3-Passw0rd');
    expect(await screen.findByText('A new code is on its way.')).toBeTruthy();
  });

  it('shows a rate-limit error on resend without leaving the OTP step', async () => {
    mockStartEmailUpgrade.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new RateLimitedError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');

    await userEvent.press(screen.getByText("Didn't get a code? Resend"));
    expect(await screen.findByText('Too many attempts — wait a minute and try again')).toBeTruthy();
    expect(screen.getByPlaceholderText('6-digit code')).toBeTruthy();
  });

  it('cancels immediately with no confirmation guard, on any step', async () => {
    render(<CreateAccount />);
    await userEvent.press(screen.getByText('← Cancel'));
    expect(mockBack).toHaveBeenCalled();
  });
});
