import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserModel } from '@/components/data/orm/orm_user';
import { runtimeConfig } from '@/config/runtime';
import { authService } from '@/services/auth.service';
import { btcService, type BTCTransaction } from '@/services/btc.service';
import { gameService } from '@/services/game.service';

/**
 * Hook for Bitcoin wallet management in demo mode.
 *
 * A deposit address is not an authentication credential. The legacy BTC flow is
 * therefore intentionally unavailable in production until a server-authoritative
 * BTC ownership/authentication design exists.
 */
export function useBTCWallet() {
  const [currentUser, setCurrentUser] = useState<UserModel | null>(null);
  const [btcAddress, setBTCAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<'disconnected' | 'connected' | 'monitoring'>('disconnected');
  const queryClient = useQueryClient();

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (runtimeConfig.mode === 'production') {
        throw new Error('BTC address-based authentication is disabled in production');
      }

      const depositAddress = btcService.getDepositAddress();
      const addressPattern = /^[13bc][a-zA-HJ-NP-Z0-9]{25,62}$/;
      if (!addressPattern.test(depositAddress)) {
        throw new Error('Invalid BTC deposit address configured');
      }

      const result = await authService.connectBTCWallet(depositAddress);
      setBTCAddress(depositAddress);
      setCurrentUser(result.user);
      setWalletStatus('connected');
      queryClient.invalidateQueries({ queryKey: ['btc-wallet'] });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      console.error('Failed to connect BTC wallet:', error);
      setConnectionError(errorMessage);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [queryClient]);

  const disconnectWallet = useCallback(async () => {
    if (runtimeConfig.mode === 'demo') {
      await authService.disconnectWallet();
    }
    setBTCAddress(null);
    setCurrentUser(null);
    setConnectionError(null);
    setWalletStatus('disconnected');
    queryClient.clear();
  }, [queryClient]);

  const updateBalance = useCallback(
    async (userId: string, tx: BTCTransaction) => {
      if (runtimeConfig.mode !== 'demo') {
        throw new Error('Browser-side BTC settlement is disabled in production');
      }

      const wallet = await gameService.getWalletBalance(userId, 'BTC');
      if (!wallet) {
        throw new Error('BTC wallet not found');
      }

      const currentBalance = Number.parseFloat(wallet.available_balance);
      const newBalance = (currentBalance + tx.value).toString();

      const walletOrm = await import('@/components/data/orm/orm_wallet');
      await walletOrm.WalletORM.getInstance().setWalletByCurrencyUserId('BTC', userId, {
        ...wallet,
        available_balance: newBalance,
      });

      const transactionOrm = await import('@/components/data/orm/orm_transaction');
      await transactionOrm.TransactionORM.getInstance().insertTransaction([
        {
          user_id: userId,
          type: transactionOrm.TransactionType.DEPOSIT,
          currency: 'BTC',
          amount: tx.value.toString(),
          balance_before: wallet.available_balance,
          balance_after: newBalance,
          status: transactionOrm.TransactionStatus.COMPLETED,
          game_session_id: null,
          metadata: JSON.stringify({
            method: 'btc-demo',
            txid: tx.txid,
            confirmations: tx.confirmations,
          }),
          completed_at: Math.floor(Date.now() / 1000).toString(),
        } as any,
      ]);

      queryClient.invalidateQueries({ queryKey: ['btc-wallet'] });
    },
    [queryClient],
  );

  const monitorDeposit = useCallback(
    async (txid: string) => {
      if (runtimeConfig.mode !== 'demo') {
        throw new Error('Browser-side BTC deposit monitoring is disabled in production');
      }
      if (!currentUser) {
        throw new Error('User not connected');
      }

      setWalletStatus('monitoring');
      try {
        const tx = await btcService.monitorTransaction(txid, (updatedTx) => {
          queryClient.setQueryData(['btc-deposit', txid], updatedTx);
        });
        if (!tx) {
          throw new Error('Transaction monitoring timeout');
        }
        if (tx.confirmations >= 3) {
          await updateBalance(currentUser.id, tx);
        }
        setWalletStatus('connected');
        return tx;
      } catch (error) {
        console.error('Error monitoring deposit:', error);
        setWalletStatus('connected');
        throw error;
      }
    },
    [currentUser, queryClient, updateBalance],
  );

  return {
    currentUser,
    btcAddress,
    isConnected: !!btcAddress && walletStatus !== 'disconnected',
    isConnecting,
    connectionError,
    walletStatus,
    connectWallet,
    disconnectWallet,
    monitorDeposit,
    depositAddress: runtimeConfig.mode === 'demo' ? btcService.getDepositAddress() : null,
  };
}

export function useBTCBalance(address: string | null) {
  return useQuery({
    queryKey: ['btc-balance', address],
    queryFn: async () => {
      if (!address) return null;
      return await btcService.getAddressInfo(address);
    },
    enabled: runtimeConfig.mode === 'demo' && !!address,
    refetchInterval: runtimeConfig.mode === 'demo' ? 10000 : false,
    refetchOnWindowFocus: runtimeConfig.mode === 'demo',
    staleTime: 5000,
  });
}

export function useBTCTransactions(address: string | null) {
  return useQuery({
    queryKey: ['btc-transactions', address],
    queryFn: async () => {
      if (!address) return [];
      return await btcService.getAddressTransactions(address);
    },
    enabled: runtimeConfig.mode === 'demo' && !!address,
    refetchInterval: runtimeConfig.mode === 'demo' ? 15000 : false,
    staleTime: 5000,
  });
}

export function useBTCDeposit(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ txid }: { txid: string }) => {
      if (runtimeConfig.mode !== 'demo') {
        throw new Error('BTC deposits are disabled until the authoritative payment phase is complete');
      }
      const tx = await btcService.getTransaction(txid);
      if (!tx) {
        throw new Error('Transaction not found');
      }
      if (tx.confirmations < 3) {
        throw new Error(`Transaction needs ${3 - tx.confirmations} more confirmations`);
      }
      return tx;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['btc-wallet'] });
      onSuccess?.();
    },
  });
}

export function useBTCPrice() {
  return useQuery({
    queryKey: ['btc-price'],
    queryFn: () => btcService.getBTCPrice(),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}
