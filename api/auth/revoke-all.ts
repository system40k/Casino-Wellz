import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
	clearSessionCookie,
	enforceOrigin,
	getActiveSession,
	getAuthConfig,
	getSessionToken,
	handlePreflight,
	revokeAllSessions,
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

		const token = getSessionToken(req);
		if (!token) return res.status(401).json({ error: "not_authenticated" });
		const session = await getActiveSession(config, token);
		if (!session) return res.status(401).json({ error: "session_invalid" });

		await revokeAllSessions(config, session.address);
		clearSessionCookie(res);
		res.setHeader("Cache-Control", "no-store");
		return res.status(204).end();
	} catch (error) {
		console.error("auth revoke-all failed", error);
		return res.status(500).json({ error: "revoke_failed" });
	}
}
