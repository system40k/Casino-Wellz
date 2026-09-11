import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SESSION_COOKIE = "cw_session";
const DEFAULT_CHALLENGE_TTL_SECONDS = 300;
const DEFAULT_SESSION_TTL_SECONDS = 900;

export type AuthConfig = {
	allowedOrigin: string;
	supabaseUrl: string;
	supabaseServiceRoleKey: string;
	evmRpcUrl: string;
	challengeTtlSeconds: number;
	sessionTtlSeconds: number;
};

export type ChallengeRecord = {
	id: string;
	address: string;
	chain_id: number;
	origin: string;
	message: string;
	expires_at: string;
	consumed_at: string | null;
};

export type SessionRecord = {
	id: string;
	address: string;
	chain_id: number;
	origin: string;
	expires_at: string;
	revoked_at: string | null;
};

export function getAuthConfig(): AuthConfig {
	const allowedOrigin = process.env.AUTH_ALLOWED_ORIGIN?.trim();
	const supabaseUrl = process.env.AUTH_SUPABASE_URL?.trim();
	const supabaseServiceRoleKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY?.trim();
	const evmRpcUrl = process.env.AUTH_EVM_RPC_URL?.trim();

	if (!allowedOrigin || !supabaseUrl || !supabaseServiceRoleKey || !evmRpcUrl) {
		throw new Error(
			"Authentication backend is not configured. AUTH_ALLOWED_ORIGIN, AUTH_SUPABASE_URL, AUTH_SUPABASE_SERVICE_ROLE_KEY, and AUTH_EVM_RPC_URL are required.",
		);
	}

	if (!allowedOrigin.startsWith("https://") && !allowedOrigin.startsWith("http://localhost")) {
		throw new Error("AUTH_ALLOWED_ORIGIN must use HTTPS outside localhost.");
	}

	if (!supabaseUrl.startsWith("https://") || !evmRpcUrl.startsWith("https://")) {
		throw new Error("Authentication data store and EVM RPC must use HTTPS.");
	}

	return {
		allowedOrigin: allowedOrigin.replace(/\/$/, ""),
		supabaseUrl: supabaseUrl.replace(/\/$/, ""),
		supabaseServiceRoleKey,
		evmRpcUrl,
		challengeTtlSeconds: parsePositiveInt(
			process.env.AUTH_CHALLENGE_TTL_SECONDS,
			DEFAULT_CHALLENGE_TTL_SECONDS,
		),
		sessionTtlSeconds: parsePositiveInt(
			process.env.AUTH_SESSION_TTL_SECONDS,
			DEFAULT_SESSION_TTL_SECONDS,
		),
	};
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeEvmAddress(address: unknown): string {
	if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
		throw new Error("Invalid EVM wallet address.");
	}
	return address.toLowerCase();
}

export function normalizeChainId(chainId: unknown): number {
	const parsed = typeof chainId === "string" ? Number.parseInt(chainId, 10) : Number(chainId);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error("Invalid chain ID.");
	}
	return parsed;
}

export function requestOrigin(req: VercelRequest): string {
	const origin = typeof req.headers.origin === "string" ? req.headers.origin.replace(/\/$/, "") : "";
	return origin;
}

export function enforceOrigin(req: VercelRequest, res: VercelResponse, config: AuthConfig): boolean {
	const origin = requestOrigin(req);
	if (origin !== config.allowedOrigin) {
		res.status(403).json({ error: "origin_not_allowed" });
		return false;
	}

	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader("Access-Control-Allow-Credentials", "true");
	res.setHeader("Vary", "Origin");
	return true;
}

export function handlePreflight(req: VercelRequest, res: VercelResponse, config: AuthConfig): boolean {
	if (req.method !== "OPTIONS") return false;
	if (!enforceOrigin(req, res, config)) return true;
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	res.status(204).end();
	return true;
}

export function getClientIp(req: VercelRequest): string {
	const forwarded = req.headers["x-forwarded-for"];
	const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
	return (value?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown").slice(0, 128);
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
	if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function buildWalletChallenge(input: {
	address: string;
	chainId: number;
	origin: string;
	nonce: string;
	issuedAt: Date;
	expiresAt: Date;
}): string {
	const domain = new URL(input.origin).host;
	return [
		`${domain} wants you to sign in to Casino-Wellz with your Ethereum account:`,
		input.address,
		"",
		"Authenticate this browser session. This request does not authorize a transaction or transfer funds.",
		"",
		`URI: ${input.origin}`,
		"Version: 1",
		`Chain ID: ${input.chainId}`,
		`Nonce: ${input.nonce}`,
		`Issued At: ${input.issuedAt.toISOString()}`,
		`Expiration Time: ${input.expiresAt.toISOString()}`,
	].join("\n");
}

async function supabaseRequest<T>(
	config: AuthConfig,
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
		...init,
		headers: {
			apikey: config.supabaseServiceRoleKey,
			Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});

	if (!response.ok) {
		throw new Error(`Auth data store request failed (${response.status}).`);
	}

	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export async function consumeRateLimit(
	config: AuthConfig,
	bucket: string,
	limit: number,
	windowSeconds: number,
): Promise<boolean> {
	const result = await supabaseRequest<Array<{ allowed: boolean }>>(config, "rpc/auth_consume_rate_limit", {
		method: "POST",
		body: JSON.stringify({ p_bucket: sha256(bucket), p_limit: limit, p_window_seconds: windowSeconds }),
	});
	return result[0]?.allowed === true;
}

export async function insertChallenge(
	config: AuthConfig,
	input: {
		address: string;
		chainId: number;
		origin: string;
		message: string;
		nonceHash: string;
		expiresAt: Date;
	},
): Promise<ChallengeRecord> {
	const rows = await supabaseRequest<ChallengeRecord[]>(config, "auth_challenges", {
		method: "POST",
		headers: { Prefer: "return=representation" },
		body: JSON.stringify({
			address: input.address,
			chain_id: input.chainId,
			origin: input.origin,
			message: input.message,
			nonce_hash: input.nonceHash,
			expires_at: input.expiresAt.toISOString(),
		}),
	});
	if (!rows[0]) throw new Error("Failed to persist authentication challenge.");
	return rows[0];
}

export async function getChallenge(config: AuthConfig, challengeId: string): Promise<ChallengeRecord | null> {
	const id = encodeURIComponent(challengeId);
	const rows = await supabaseRequest<ChallengeRecord[]>(
		config,
		`auth_challenges?id=eq.${id}&select=id,address,chain_id,origin,message,expires_at,consumed_at&limit=1`,
	);
	return rows[0] ?? null;
}

export async function consumeChallenge(config: AuthConfig, challengeId: string): Promise<boolean> {
	const result = await supabaseRequest<Array<{ consumed: boolean }>>(config, "rpc/auth_consume_challenge", {
		method: "POST",
		body: JSON.stringify({ p_challenge_id: challengeId }),
	});
	return result[0]?.consumed === true;
}

export async function recoverEvmAddress(
	config: AuthConfig,
	message: string,
	signature: string,
	chainId: number,
): Promise<string> {
	if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
		throw new Error("Invalid wallet signature format.");
	}

	const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
		const response = await fetch(config.evmRpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: randomToken(8), method, params }),
		});
		if (!response.ok) throw new Error(`EVM RPC request failed (${response.status}).`);
		const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
		if (payload.error || payload.result === undefined) {
			throw new Error(payload.error?.message || `EVM RPC method ${method} failed.`);
		}
		return payload.result;
	};

	const rpcChainHex = await rpc("eth_chainId", []);
	const rpcChainId = Number.parseInt(String(rpcChainHex), 16);
	if (rpcChainId !== chainId) {
		throw new Error(`Configured EVM RPC is on chain ${rpcChainId}, but challenge is for chain ${chainId}.`);
	}

	const recovered = await rpc("personal_ecRecover", [message, signature]);
	return normalizeEvmAddress(recovered);
}

export async function createSession(
	config: AuthConfig,
	input: { address: string; chainId: number; origin: string },
): Promise<{ token: string; session: SessionRecord }> {
	const token = randomToken(32);
	const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
	const rows = await supabaseRequest<SessionRecord[]>(config, "auth_sessions", {
		method: "POST",
		headers: { Prefer: "return=representation" },
		body: JSON.stringify({
			token_hash: sha256(token),
			address: input.address,
			chain_id: input.chainId,
			origin: input.origin,
			expires_at: expiresAt.toISOString(),
		}),
	});
	if (!rows[0]) throw new Error("Failed to create authenticated session.");
	return { token, session: rows[0] };
}

export function setSessionCookie(res: VercelResponse, token: string, ttlSeconds: number): void {
	res.setHeader(
		"Set-Cookie",
		`${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${ttlSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`,
	);
}

export function clearSessionCookie(res: VercelResponse): void {
	res.setHeader(
		"Set-Cookie",
		`${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
	);
}

export function getSessionToken(req: VercelRequest): string | null {
	const cookies = req.headers.cookie ?? "";
	for (const part of cookies.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
	}
	return null;
}

export async function getActiveSession(config: AuthConfig, token: string): Promise<SessionRecord | null> {
	const tokenHash = sha256(token);
	const rows = await supabaseRequest<SessionRecord[]>(
		config,
		`auth_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,address,chain_id,origin,expires_at,revoked_at&limit=1`,
	);
	return rows[0] ?? null;
}

export async function revokeSession(config: AuthConfig, token: string): Promise<void> {
	await supabaseRequest(config, `auth_sessions?token_hash=eq.${encodeURIComponent(sha256(token))}&revoked_at=is.null`, {
		method: "PATCH",
		headers: { Prefer: "return=minimal" },
		body: JSON.stringify({ revoked_at: new Date().toISOString() }),
	});
}

export async function revokeAllSessions(config: AuthConfig, address: string): Promise<void> {
	await supabaseRequest(config, `auth_sessions?address=eq.${encodeURIComponent(address)}&revoked_at=is.null`, {
		method: "PATCH",
		headers: { Prefer: "return=minimal" },
		body: JSON.stringify({ revoked_at: new Date().toISOString() }),
	});
}
