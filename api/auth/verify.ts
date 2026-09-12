import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
	consumeChallenge,
	consumeRateLimit,
	createSession,
	enforceOrigin,
	getAuthConfig,
	getChallenge,
	getClientIp,
	handlePreflight,
	recoverEvmAddress,
	requestOrigin,
	setSessionCookie,
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

		const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
		const signature = typeof req.body?.signature === "string" ? req.body.signature : "";
		if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !signature) {
			return res.status(400).json({ error: "invalid_request" });
		}

		const ip = getClientIp(req);

		// The global per-IP bucket prevents challenge-ID rotation from bypassing
		// the narrower replay/guessing limit for a specific challenge.
		const [ipAllowed, challengeAllowed] = await Promise.all([
			consumeRateLimit(config, `verify-ip:${ip}`, 30, 60),
			consumeRateLimit(config, `verify:${ip}:${challengeId}`, 8, 60),
		]);
		if (!ipAllowed || !challengeAllowed) return res.status(429).json({ error: "rate_limited" });

		const challenge = await getChallenge(config, challengeId);
		if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
			return res.status(401).json({ error: "challenge_expired_or_used" });
		}
		if (challenge.origin !== requestOrigin(req)) {
			return res.status(401).json({ error: "challenge_origin_mismatch" });
		}

		const recoveredAddress = await recoverEvmAddress(
			config,
			challenge.message,
			signature,
			challenge.chain_id,
		);
		if (recoveredAddress !== challenge.address) {
			return res.status(401).json({ error: "invalid_signature" });
		}

		// Atomic one-time consumption is intentionally performed after signature
		// verification. Only one concurrent verifier can consume the challenge.
		if (!(await consumeChallenge(config, challenge.id))) {
			return res.status(409).json({ error: "challenge_already_consumed" });
		}

		const { token, session } = await createSession(config, {
			address: challenge.address,
			chainId: challenge.chain_id,
			origin: challenge.origin,
		});
		setSessionCookie(res, token, config.sessionTtlSeconds);
		res.setHeader("Cache-Control", "no-store");
		return res.status(200).json({
			user: { address: session.address, chainId: session.chain_id },
			expiresAt: session.expires_at,
		});
	} catch (error) {
		console.error("auth verify failed", error);
		return res.status(400).json({ error: "verification_failed" });
	}
}
