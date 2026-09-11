import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
	consumeRateLimit,
	enforceOrigin,
	getActiveSession,
	getAuthConfig,
	getClientIp,
	getSessionToken,
	handlePreflight,
} from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const config = getAuthConfig();
		if (handlePreflight(req, res, config)) return;
		if (!enforceOrigin(req, res, config)) return;
		if (req.method !== "GET") {
			res.setHeader("Allow", "GET, OPTIONS");
			return res.status(405).json({ error: "method_not_allowed" });
		}

		const ip = getClientIp(req);
		if (!(await consumeRateLimit(config, `session:${ip}`, 60, 60))) {
			return res.status(429).json({ error: "rate_limited" });
		}

		const token = getSessionToken(req);
		if (!token) return res.status(401).json({ error: "not_authenticated" });
		const session = await getActiveSession(config, token);
		if (!session) return res.status(401).json({ error: "session_invalid" });

		res.setHeader("Cache-Control", "no-store");
		return res.status(200).json({
			user: { address: session.address, chainId: session.chain_id },
			expiresAt: session.expires_at,
		});
	} catch (error) {
		console.error("auth session failed", error);
		return res.status(500).json({ error: "session_lookup_failed" });
	}
}
