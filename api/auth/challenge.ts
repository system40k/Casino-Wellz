import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
	buildWalletChallenge,
	consumeRateLimit,
	enforceOrigin,
	getAuthConfig,
	getClientIp,
	handlePreflight,
	insertChallenge,
	normalizeChainId,
	normalizeEvmAddress,
	randomToken,
	requestOrigin,
	sha256,
} from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const config = getAuthConfig();
		if (handlePreflight(req, res, config)) return;
		if (!enforceOrigin(req, res, config)) return;
		if (req.method !== "POST") {
			res.setHeader("Allow", "POST, OPTIONS");
			return res.status(405).json({ error: "method_not_allowed" });
		}

		const address = normalizeEvmAddress(req.body?.address);
		const chainId = normalizeChainId(req.body?.chainId);
		const ip = getClientIp(req);
		const allowed = await consumeRateLimit(config, `challenge:${ip}:${address}`, 10, 60);
		if (!allowed) return res.status(429).json({ error: "rate_limited" });

		const issuedAt = new Date();
		const expiresAt = new Date(issuedAt.getTime() + config.challengeTtlSeconds * 1000);
		const nonce = randomToken(24);
		const origin = requestOrigin(req);
		const message = buildWalletChallenge({ address, chainId, origin, nonce, issuedAt, expiresAt });
		const challenge = await insertChallenge(config, {
			address,
			chainId,
			origin,
			message,
			nonceHash: sha256(nonce),
			expiresAt,
		});

		res.setHeader("Cache-Control", "no-store");
		return res.status(201).json({
			challengeId: challenge.id,
			message,
			expiresAt: challenge.expires_at,
		});
	} catch (error) {
		console.error("auth challenge failed", error);
		return res.status(400).json({ error: "challenge_failed" });
	}
}
