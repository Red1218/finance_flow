import { getExistingSession, signOutUser } from './auth';
import { supabase } from '../supabaseClient';

jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

function session(overrides: Partial<{ is_anonymous: boolean }> = {}) {
  return { user: { is_anonymous: false, ...overrides } } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('getExistingSession', () => {
  it('returns a real session unchanged', async () => {
    const real = session();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: real }, error: null });
    await expect(getExistingSession()).resolves.toBe(real);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('returns null when nothing is persisted', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
    await expect(getExistingSession()).resolves.toBeNull();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out and returns null for a leftover anonymous session', async () => {
    const anon = session({ is_anonymous: true });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: anon }, error: null });
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    await expect(getExistingSession()).resolves.toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('throws when getSession errors', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: new Error('boom') });
    await expect(getExistingSession()).rejects.toThrow('boom');
  });
});

describe('signOutUser', () => {
  it('throws when signOut errors', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: new Error('boom') });
    await expect(signOutUser()).rejects.toThrow('boom');
  });
});
