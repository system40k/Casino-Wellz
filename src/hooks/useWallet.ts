import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserModel } from '@/components/data/orm/orm_user';
import type { WalletModel } from '@/components/data/orm/orm_wallet';
import { runtimeConfig } from '@/config/runtime';
import { authService } from '@/services/auth.service';
import { gameService } from '@/services/game.service';
import { productionAuthService, type AuthSession } from '@/services/production-auth.service';

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
};

function getInjectedProvider(): Eip1193Provider | null {
  return (window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

function utf8ToHex(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function parseInjectedAddress(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error('Wallet returned an invalid EVM address');
  }
  return value.toLowerCase();
}

function parseInjectedChainId(value: unknown): number {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]+$/.test(value)) {
    throw new Error('Wallet returned an invalid chain ID');
  }
  const chainId = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('Wallet returned an invalid chain ID');
  }
  return chainId;
}

/**
 * Custom hook for wallet management.
 *
 * Demo mode preserves the generated-wallet fixture used by the prototype.
 * Production mode never treats a browser-supplied address as authenticated:
 * it requests the real injected wallet account, signs the backend challenge,
 * and relies on the HttpOnly server session created by productionAuthService.
 */
export function useWallet() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserModel | null>(null);
  const [productionSession, setProductionSession] = useState<AuthSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (runtimeConfig.mode !== 'production') return;

    let cancelled = false;
    productionAuthService
      .getSession()
      .then((session) => {
        if (cancelled) return;
        setProductionSession(session);
        setConnectedAddress(session.user.address);
      })
      .catch(() => {
        if (cancelled) return;
        setProductionSession(null);
        setConnectedAddress(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (runtimeConfig.mode === 'production') {
        const provider = getInjectedProvider();
        if (!provider) {
          throw new Error('No compatible browser wallet detected');
        }

        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        if (!Array.isArray(accounts) || accounts.length === 0) {
          throw new Error('Wallet did not provide an account');
        }

        const address = parseInjectedAddress(accounts[0]);
        const chainId = parseInjectedChainId(await provider.request({ method: 'eth_chainId' }));
        const session = await productionAuthService.authenticateWallet({
          address,
          chainId,
          signMessage: async (message) => {
            const signature = await provider.request({
              method: 'personal_sign',
              params: [utf8ToHex(message), address],
            });
            if (typeof signature !== 'string') {
              throw new Error('Wallet did not return a signature');
            }
            return signature;
          },
        });

        setConnectedAddress(session.user.address);
        setProductionSession(session);
        setCurrentUser(null);
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        return { user: null, isAuthenticated: true, session };
      }

      const demoAddress = `0x${Math.random().toString(16).substring(2, 42)}`;
      const result = await authService.connectWallet(demoAddress);
      setConnectedAddress(demoAddress);
      setCurrentUser(result.user);
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to connect wallet. Please check your network connection and try again.';

      console.error('Failed to connect wallet:', error);
      setConnectionError(errorMessage);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [queryClient]);

  const disconnectWallet = useCallback(async () => {
    if (runtimeConfig.mode === 'production') {
      await productionAuthService.logout();
      setProductionSession(null);
    } else {
      await authService.disconnectWallet();
    }

    setConnectedAddress(null);
    setCurrentUser(null);
    setConnectionError(null);
    queryClient.clear();
  }, [queryClient]);

  const setUserKycLevel = useCallback(
    async (level: number) => {
      if (runtimeConfig.mode === 'production') {
        throw new Error('KYC state is server-authoritative in production');
      }
      if (!currentUser) {
        throw new Error('User not connected');
      }
      const updated = await authService.setUserKycLevel(currentUser.id, level);
      setCurrentUser(updated);
      return updated;
    },
    [currentUser],
  );

  return {
    connectedAddress,
    currentUser,
    productionSession,
    isConnected: !!connectedAddress,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
    setUserKycLevel,
  };
}

/**
 * Hook to get wallet balances
 */
export function useWalletBalances(userId: string | null, currency: string = 'ETH') {
  return useQuery({
    queryKey: ['wallet', 'balance', userId, currency],
    queryFn: async () => {
      if (!userId) return null;
      return await gameService.getWalletBalance(userId, currency);
    },
    enabled: runtimeConfig.mode === 'demo' && !!userId,
    refetchInterval: runtimeConfig.mode === 'demo' ? 1000 : false,
    refetchOnWindowFocus: runtimeConfig.mode === 'demo',
    staleTime: 0,
  });
}

/**
 * Hook to get all user wallets
 */
export function useUserWallets(userId: string | null) {
  return useQuery({
    queryKey: ['wallet', 'all', userId],
    queryFn: async () => {
      if (!userId) return [];

      const currencies = ['ETH', 'BTC', 'USDT'];
      const wallets = await Promise.all(
        currencies.map((currency) => gameService.getWalletBalance(userId, currency)),
      );

      return wallets.filter((wallet): wallet is WalletModel => wallet !== null);
    },
    enabled: runtimeConfig.mode === 'demo' && !!userId,
  });
}

/**
 * Hook for deposit functionality (simulation only).
 */
export function useDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      currency,
      amount,
    }: {
      userId: string;
      currency: string;
      amount: string;
    }) => {
      if (runtimeConfig.mode !== 'demo') {
        throw new Error('Browser-side deposits are disabled in production');
      }

      const wallet = await gameService.getWalletBalance(userId, currency);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const currentBalance = Number.parseFloat(wallet.available_balance);
      const depositAmount = Number.parseFloat(amount);
      const newBalance = (currentBalance + depositAmount).toString();

      const walletOrm = await import('@/components/data/orm/orm_wallet');
      await walletOrm.WalletORM.getInstance().setWalletByCurrencyUserId(currency, userId, {
        ...wallet,
        available_balance: newBalance,
      });

      const transactionOrm = await import('@/components/data/orm/orm_transaction');
      await transactionOrm.TransactionORM.getInstance().insertTransaction([
        {
          user_id: userId,
          type: transactionOrm.TransactionType.DEPOSIT,
          currency,
          amount,
          balance_before: wallet.available_balance,
          balance_after: newBalance,
          status: transactionOrm.TransactionStatus.COMPLETED,
          game_session_id: null,
          metadata: JSON.stringify({ method: 'demo' }),
          completed_at: Math.floor(Date.now() / 1000).toString(),
        } as any,
      ]);

      return { success: true, newBalance };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
