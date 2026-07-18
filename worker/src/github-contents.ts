import { encodeBase64Utf8, decodeBase64Utf8 } from "./base64";

/**
 * All repo reads/writes go through the GitHub Contents API using a bot PAT
 * (env.GITHUB_BOT_PAT). Family members authenticate via their own GitHub OAuth
 * (see github-oauth.ts / session.ts) only to identify who made a change —
 * the actual commit is always made by the bot.
 */

const GITHUB_API = "https://api.github.com";

export class GithubApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

function repoParts(env: Env): { owner: string; repo: string } {
	const [owner, repo] = env.GITHUB_REPO.split("/");
	return { owner, repo };
}

function apiHeaders(env: Env): HeadersInit {
	return {
		Authorization: `Bearer ${env.GITHUB_BOT_PAT}`,
		Accept: "application/vnd.github+json",
		"User-Agent": "family-app-worker",
	};
}

interface ContentsGetResponse {
	content: string;
	sha: string;
}

/** Fetches a file's raw text content + sha. Returns null if the file doesn't exist yet. */
async function getFile(env: Env, path: string): Promise<{ text: string; sha: string } | null> {
	const { owner, repo } = repoParts(env);
	const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
		headers: apiHeaders(env),
	});

	if (response.status === 404) return null;
	if (!response.ok) {
		throw new GithubApiError(`Failed to read ${path}: ${response.status} ${await response.text()}`, response.status);
	}

	const data = (await response.json()) as ContentsGetResponse;
	return { text: decodeBase64Utf8(data.content), sha: data.sha };
}

/** Creates or updates a file. Omit `sha` when creating a brand-new file. */
async function putFile(env: Env, path: string, content: string, message: string, sha?: string): Promise<void> {
	const { owner, repo } = repoParts(env);
	const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
		method: "PUT",
		headers: { ...apiHeaders(env), "Content-Type": "application/json" },
		body: JSON.stringify({
			message,
			content: encodeBase64Utf8(content),
			...(sha ? { sha } : {}),
		}),
	});

	if (!response.ok) {
		throw new GithubApiError(`Failed to write ${path}: ${response.status} ${await response.text()}`, response.status);
	}
}

/** Reads and JSON-parses a file, or returns `fallback` if it doesn't exist yet. */
export async function readJsonFile<T>(env: Env, path: string, fallback: T): Promise<T> {
	const existing = await getFile(env, path);
	return existing ? JSON.parse(existing.text) : fallback;
}

/**
 * Reads a JSON file (or starts from `fallback`), applies `mutate`, and commits the result.
 * v1 conflict policy is "last write wins" (per project plan) — no retry/merge logic.
 */
export async function updateJsonFile<T>(
	env: Env,
	path: string,
	fallback: T,
	mutate: (value: T) => T,
	message: string,
): Promise<T> {
	const existing = await getFile(env, path);
	const value: T = existing ? JSON.parse(existing.text) : fallback;

	const updated = mutate(value);
	await putFile(env, path, JSON.stringify(updated, null, 2), message, existing?.sha);

	return updated;
}

/** Reads a JSON array file for display. Empty array if the file doesn't exist yet. */
export function readJsonArrayFile<T>(env: Env, path: string): Promise<T[]> {
	return readJsonFile<T[]>(env, path, []);
}

/** Reads a JSON array file, applies `mutate`, and commits the result. */
export function updateJsonArrayFile<T>(
	env: Env,
	path: string,
	mutate: (items: T[]) => T[],
	message: string,
): Promise<T[]> {
	return updateJsonFile<T[]>(env, path, [], mutate, message);
}

/** Commits a binary file (e.g. a recipe photo) given its base64 content. */
export async function putBase64File(env: Env, path: string, base64Content: string, message: string): Promise<void> {
	const { owner, repo } = repoParts(env);

	// Images are overwritten wholesale, but the Contents API still requires the
	// current sha when a file already exists at that path.
	const existing = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
		headers: apiHeaders(env),
	});
	const sha = existing.ok ? ((await existing.json()) as ContentsGetResponse).sha : undefined;

	const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
		method: "PUT",
		headers: { ...apiHeaders(env), "Content-Type": "application/json" },
		body: JSON.stringify({
			message,
			content: base64Content,
			...(sha ? { sha } : {}),
		}),
	});

	if (!response.ok) {
		throw new GithubApiError(`Failed to write ${path}: ${response.status} ${await response.text()}`, response.status);
	}
}
