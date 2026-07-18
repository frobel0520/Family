import { readJsonFile, updateJsonFile } from "./github-contents";

/**
 * Login access control, stored in the repo at data/access.json (writable via the
 * same bot-PAT Contents API as board/recipes/orders — no separate KV needed).
 * The one bootstrap exception is env.OWNER_EMAIL, which is always allowed and is
 * the only account that can approve/deny everyone else (see routes/admin.ts).
 */

export interface PendingRequest {
	email: string;
	name: string;
	avatar: string;
	requestedAt: string;
}

interface AccessState {
	approved: string[]; // emails, lowercase
	pending: PendingRequest[];
}

const ACCESS_PATH = "data/access.json";
const EMPTY_STATE: AccessState = { approved: [], pending: [] };

function isOwner(env: Env, email: string): boolean {
	return email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
}

async function getAccessState(env: Env): Promise<AccessState> {
	return readJsonFile(env, ACCESS_PATH, EMPTY_STATE);
}

/**
 * Checks whether `email` may log in. Owner is always allowed. Anyone else must be
 * on the approved list. If they're neither approved nor already pending, this adds
 * them to the pending queue (as a side effect) so the owner can review it.
 */
export async function checkAccess(
	env: Env,
	user: { email: string; name: string; avatar: string },
): Promise<{ allowed: true } | { allowed: false; pending: boolean }> {
	if (isOwner(env, user.email)) return { allowed: true };

	const email = user.email.toLowerCase();
	const state = await getAccessState(env);

	if (state.approved.includes(email)) return { allowed: true };
	if (state.pending.some((p) => p.email === email)) return { allowed: false, pending: true };

	await updateJsonFile(env, ACCESS_PATH, EMPTY_STATE, (s) => ({
		...s,
		pending: [...s.pending, { email, name: user.name, avatar: user.avatar, requestedAt: new Date().toISOString() }],
	}), `access: ${email} requested login`);

	return { allowed: false, pending: false };
}

export async function listPending(env: Env): Promise<PendingRequest[]> {
	return (await getAccessState(env)).pending;
}

export async function approveEmail(env: Env, email: string): Promise<void> {
	const normalized = email.toLowerCase();
	await updateJsonFile(env, ACCESS_PATH, EMPTY_STATE, (s) => ({
		approved: s.approved.includes(normalized) ? s.approved : [...s.approved, normalized],
		pending: s.pending.filter((p) => p.email !== normalized),
	}), `access: approved ${normalized}`);
}

export async function denyEmail(env: Env, email: string): Promise<void> {
	const normalized = email.toLowerCase();
	await updateJsonFile(env, ACCESS_PATH, EMPTY_STATE, (s) => ({
		...s,
		pending: s.pending.filter((p) => p.email !== normalized),
	}), `access: denied ${normalized}`);
}

export { isOwner };
