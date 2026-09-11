import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
	clearSessionCookie,
	enforceOrigin,
	getAuthConfig,
	getSessionToken,
	handlePreflight,
	revokeSession,
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
		if (token) await revokeSession(config, token);
		clearSessionCookie(res);
		res.setHeader("Cache-Control", "no-store");
		return res.status(204).end();
	} catch (error) {
		console.error("auth logout failed", error);
		return res.status(500).json({ error: "logout_failed" });
	}
}
