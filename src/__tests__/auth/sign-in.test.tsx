import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import SignIn from '../../../app/account/sign-in';
import { InvalidCredentialsError } from '../../data/repositories/authErrors';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockSignIn = jest.fn();
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ signIn: (e: string, p: string) => mockSignIn(e, p) }) }));

describe('Sign in screen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockBack.mockClear();
  });

  it('signs in and returns to the previous screen on success', async () => {
    mockSignIn.mockResolvedValue(undefined);
    render(<SignIn />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'pw');
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockSignIn).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows an inline error on invalid credentials and does not navigate', async () => {
    mockSignIn.mockRejectedValue(new InvalidCredentialsError());
    render(<SignIn />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong');
    await userEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Incorrect email or password')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('links to forgot-password', async () => {
    render(<SignIn />);
    await userEvent.press(screen.getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/account/forgot-password');
  });
});
