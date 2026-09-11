import { requireAuthoritativeBackend } from "@/config/runtime";

export type AuthenticatedWallet = {
	address: string;
	chainId: number;
};

export type AuthSession = {
	user: AuthenticatedWallet;
	expiresAt: string;
};

type ChallengeResponse = {
	challengeId: string;
	message: string;
	expiresAt: string;
};

class ProductionAuthService {
	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const baseUrl = requireAuthoritativeBackend();
		const response = await fetch(`${baseUrl}${path}`, {
			...init,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				...(init.headers ?? {}),
			},
		});

		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			throw new Error(payload?.error || `Authentication request failed with HTTP ${response.status}`);
		}

		if (response.status === 204) return undefined as T;
		return response.json() as Promise<T>;
	}

	createChallenge(address: string, chainId: number): Promise<ChallengeResponse> {
		return this.request("/auth/challenge", {
			method: "POST",
			body: JSON.stringify({ address, chainId }),
		});
	}

	verify(challengeId: string, signature: string): Promise<AuthSession> {
		return this.request("/auth/verify", {
			method: "POST",
			body: JSON.stringify({ challengeId, signature }),
		});
	}

	getSession(): Promise<AuthSession> {
		return this.request("/auth/session", { method: "GET" });
	}

	logout(): Promise<void> {
		return this.request("/auth/logout", { method: "POST" });
	}

	revokeAllSessions(): Promise<void> {
		return this.request("/auth/revoke-all", { method: "POST" });
	}

	async authenticateWallet(input: {
		address: string;
		chainId: number;
		signMessage: (message: string) => Promise<string>;
	}): Promise<AuthSession> {
		const challenge = await this.createChallenge(input.address, input.chainId);
		const signature = await input.signMessage(challenge.message);
		return this.verify(challenge.challengeId, signature);
	}
}

export const productionAuthService = new ProductionAuthService();
