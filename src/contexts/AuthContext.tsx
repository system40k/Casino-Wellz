import React, { createContext, useContext, useEffect, useState } from 'react';
import { runtimeConfig } from '@/config/runtime';
import { productionAuthService } from '@/services/production-auth.service';

type User = {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  walletAddress?: string;
  is2FAEnabled: boolean;
  isVerified: boolean;
  kycStatus: 'none' | 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithFacebook: () => Promise<void>;
  loginWithWallet: (address: string, signature: string) => Promise<void>;
  enable2FA: () => Promise<{ secret: string; qrCodeUrl: string }>;
  verify2FA: (token: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function userFromSession(address: string): User {
  const now = new Date().toISOString();
  return {
    id: address,
    walletAddress: address,
    is2FAEnabled: false,
    isVerified: true,
    kycStatus: 'none',
    createdAt: now,
    updatedAt: now,
  };
}

function unsupported(method: string): never {
  throw new Error(`${method} is not implemented by the authoritative authentication backend`);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        if (runtimeConfig.mode !== 'production') return;
        const session = await productionAuthService.getSession();
        if (!cancelled) setUser(userFromSession(session.user.address));
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (_email: string, _password: string) => unsupported('Password login');
  const register = async (_data: { email: string; password: string; name: string }) =>
    unsupported('Registration');

  const logout = async () => {
    setIsLoading(true);
    try {
      if (runtimeConfig.mode === 'production') {
        await productionAuthService.logout();
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => unsupported('Google login');
  const loginWithFacebook = async () => unsupported('Facebook login');

  // A raw address/signature pair is insufficient because production wallet auth
  // must begin with a server-issued one-time challenge. useWallet owns that flow.
  const loginWithWallet = async (_address: string, _signature: string) =>
    unsupported('Legacy wallet login');

  const enable2FA = async (): Promise<{ secret: string; qrCodeUrl: string }> =>
    unsupported('Two-factor authentication');

  const verify2FA = async (_token: string): Promise<boolean> => false;
  const resetPassword = async (_email: string) => unsupported('Password reset');
  const updateProfile = async (_data: Partial<User>) => unsupported('Profile mutation');

  const value: AuthContextType = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    register,
    logout,
    loginWithGoogle,
    loginWithFacebook,
    loginWithWallet,
    enable2FA,
    verify2FA,
    resetPassword,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
