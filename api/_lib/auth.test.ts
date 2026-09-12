import { describe, expect, it } from "vitest";
import {
	buildWalletChallenge,
	normalizeChainId,
	normalizeEvmAddress,
	randomToken,
	sha256,
} from "./auth";

describe("authentication primitives", () => {
	it("normalizes valid EVM addresses and rejects malformed addresses", () => {
		expect(normalizeEvmAddress("0xAABBccDDeeFF0011223344556677889900AAbbCC")).toBe(
			"0xaabbccddeeff0011223344556677889900aabbcc",
		);
		expect(() => normalizeEvmAddress("0x1234")).toThrow("Invalid EVM wallet address");
	});

	it("accepts positive integer chain identifiers only", () => {
		expect(normalizeChainId("1")).toBe(1);
		expect(normalizeChainId(8453)).toBe(8453);
		expect(() => normalizeChainId(0)).toThrow("Invalid chain ID");
		expect(() => normalizeChainId("abc")).toThrow("Invalid chain ID");
	});

	it("binds a challenge to address, chain, origin, nonce, and expiry", () => {
		const message = buildWalletChallenge({
			address: "0xaabbccddeeff0011223344556677889900aabbcc",
			chainId: 1,
			origin: "https://casino.example",
			nonce: "one-time-nonce",
			issuedAt: new Date("2026-09-11T16:00:00.000Z"),
			expiresAt: new Date("2026-09-11T16:05:00.000Z"),
		});

		expect(message).toContain("casino.example wants you to sign in");
		expect(message).toContain("0xaabbccddeeff0011223344556677889900aabbcc");
		expect(message).toContain("URI: https://casino.example");
		expect(message).toContain("Chain ID: 1");
		expect(message).toContain("Nonce: one-time-nonce");
		expect(message).toContain("Expiration Time: 2026-09-11T16:05:00.000Z");
	});

	it("generates high-entropy tokens and hashes them deterministically", () => {
		const first = randomToken(32);
		const second = randomToken(32);
		expect(first).not.toBe(second);
		expect(first.length).toBeGreaterThanOrEqual(40);
		expect(sha256("casino-wellz")).toHaveLength(64);
		expect(sha256("casino-wellz")).toBe(sha256("casino-wellz"));
	});
});
