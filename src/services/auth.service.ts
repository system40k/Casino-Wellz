import { UserORM, type UserModel } from '@/components/data/orm/orm_user';
import { WalletORM } from '@/components/data/orm/orm_wallet';
import { runtimeConfig } from '@/config/runtime';

/**
 * Legacy demo authentication service.
 *
 * This service intentionally has no production capability. Production identity
 * is established only through production-auth.service.ts and the server-issued
 * wallet challenge/session flow.
 */

export interface AuthenticatedUser {
  user: UserModel;
  isAuthenticated: boolean;
}

function requireDemoMode(operation: string): void {
  if (runtimeConfig.mode !== 'demo') {
    throw new Error(`${operation} is disabled in production; use the authoritative authentication backend`);
  }
}

class AuthService {
  private userOrm = UserORM.getInstance();
  private walletOrm = WalletORM.getInstance();

  async connectWallet(walletAddress: string): Promise<AuthenticatedUser> {
    requireDemoMode('Legacy wallet authentication');
    const normalizedAddress = walletAddress.toLowerCase();
    const existingUsers = await this.userOrm.getUserByWalletAddress(normalizedAddress);

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      const updatedUser = await this.userOrm.setUserByWalletAddress(normalizedAddress, {
        ...user,
        last_login_at: Math.floor(Date.now() / 1000).toString(),
      });

      return { user: updatedUser[0], isAuthenticated: true };
    }

    const newUsers = await this.userOrm.insertUser([
      {
        wallet_address: normalizedAddress,
        kyc_level: 0,
        is_banned: false,
        last_login_at: Math.floor(Date.now() / 1000).toString(),
      } as UserModel,
    ]);
    const newUser = newUsers[0];

    const currencies = ['ETH', 'BTC', 'USDT'];
    await this.walletOrm.insertWallet(
      currencies.map(
        (currency) =>
          ({
            user_id: newUser.id,
            currency,
            available_balance: '0',
            locked_balance: '0',
          }) as any,
      ),
    );

    return { user: newUser, isAuthenticated: true };
  }

  async connectBTCWallet(btcAddress: string): Promise<AuthenticatedUser> {
    requireDemoMode('Legacy BTC address authentication');
    const addressPattern = /^[13bc][a-zA-HJ-NP-Z0-9]{25,62}$/;
    if (!addressPattern.test(btcAddress)) {
      throw new Error('Invalid BTC address format');
    }

    const normalizedAddress = btcAddress.toLowerCase();
    const existingUsers = await this.userOrm.getUserByWalletAddress(normalizedAddress);
    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      const updatedUser = await this.userOrm.setUserByWalletAddress(normalizedAddress, {
        ...user,
        last_login_at: Math.floor(Date.now() / 1000).toString(),
      });
      return { user: updatedUser[0], isAuthenticated: true };
    }

    const newUsers = await this.userOrm.insertUser([
      {
        wallet_address: normalizedAddress,
        kyc_level: 0,
        is_banned: false,
        last_login_at: Math.floor(Date.now() / 1000).toString(),
      } as UserModel,
    ]);
    const newUser = newUsers[0];

    await this.walletOrm.insertWallet([
      {
        user_id: newUser.id,
        currency: 'BTC',
        available_balance: '0',
        locked_balance: '0',
      } as any,
    ]);

    return { user: newUser, isAuthenticated: true };
  }

  async disconnectWallet(): Promise<void> {
    requireDemoMode('Legacy wallet disconnect');
  }

  async getUserByWallet(walletAddress: string): Promise<UserModel | null> {
    requireDemoMode('Legacy browser user lookup');
    const normalizedAddress = walletAddress.toLowerCase();
    const users = await this.userOrm.getUserByWalletAddress(normalizedAddress);
    return users.length > 0 ? users[0] : null;
  }

  async isUserBanned(userId: string): Promise<boolean> {
    requireDemoMode('Legacy browser restriction lookup');
    const users = await this.userOrm.getUserById(userId);
    return users.length > 0 ? users[0].is_banned : true;
  }

  async getUserKycLevel(userId: string): Promise<number> {
    requireDemoMode('Legacy browser KYC lookup');
    const users = await this.userOrm.getUserById(userId);
    return users.length > 0 ? users[0].kyc_level : 0;
  }

  async setUserKycLevel(userId: string, level: number): Promise<UserModel> {
    requireDemoMode('Legacy browser KYC mutation');
    const users = await this.userOrm.getUserById(userId);
    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];
    const [updated] = await this.userOrm.setUserById(userId, {
      ...user,
      kyc_level: level,
    });
    return updated;
  }
}

export const authService = new AuthService();
