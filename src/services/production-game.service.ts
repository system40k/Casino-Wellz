import { requireAuthoritativeBackend } from '@/config/runtime';

export interface ProductionPlaceBetRequest {
  betAmount: string;
  currency: string;
  clientSeed: string;
  target: number;
  idempotencyKey: string;
}

export interface ProductionPlaceBetResult {
  betId: string;
  outcome: number;
  won: boolean;
  winAmount: string;
  balance: string;
  serverSeedHash: string;
  nonce: number;
}

class ProductionGameService {
  async placeBet(request: ProductionPlaceBetRequest): Promise<ProductionPlaceBetResult> {
    const baseUrl = requireAuthoritativeBackend();

    if (!request.idempotencyKey.trim()) {
      throw new Error('A non-empty idempotency key is required for every production bet.');
    }

    const response = await fetch(`${baseUrl}/games/dice/bets`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': request.idempotencyKey,
      },
      body: JSON.stringify({
        betAmount: request.betAmount,
        currency: request.currency,
        clientSeed: request.clientSeed,
        target: request.target,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || `Bet request failed with HTTP ${response.status}`);
    }

    return response.json() as Promise<ProductionPlaceBetResult>;
  }
}

export const productionGameService = new ProductionGameService();
