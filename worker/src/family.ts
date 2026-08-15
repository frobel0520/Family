import { listApprovedEmails } from "./access";
import { avatarProxyUrl, listProfiles, type Profile } from "./profiles";
import { storedAvatarUrl } from "./image-url";

/**
 * 「全家人名單」：行事曆要勾選提醒對象，就得先知道家裡有誰。
 *
 * 名單本身來自 access.json 的 approved（＋擁有者），顯示名/大頭貼從 profiles.json 補：
 * 暱稱 > 登入時記下的 Google 名字 > email 的 @ 前面（真的什麼都沒有時的保底）。
 */

export interface FamilyMember {
	email: string;
	name: string;
	avatar: string | null;
}

export function listFamilyEmails(env: Env): Promise<string[]> {
	return listApprovedEmails(env);
}

function displayName(email: string, profile?: Profile): string {
	return profile?.nickname?.trim() || profile?.googleName?.trim() || email.split("@")[0];
}

export async function listFamilyMembers(request: Request, env: Env): Promise<FamilyMember[]> {
	const [emails, profiles] = await Promise.all([listApprovedEmails(env), listProfiles(env)]);

	return Promise.all(
		emails.map(async (email) => {
			const profile = profiles.find((p) => p.email === email);
			const customAvatar = profile ? await avatarProxyUrl(request, env, profile) : null;
			return {
				email,
				name: displayName(email, profile),
				avatar: customAvatar ?? (await storedAvatarUrl(request, profile?.googleAvatar, env.JWT_SECRET)),
			};
		}),
	);
}
