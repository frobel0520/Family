import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { approveRequest, denyRequest, listPendingRequests } from "../api";
import type { PendingRequest } from "../types";

function formatTime(iso: string): string {
	return new Date(iso).toLocaleString("zh-TW");
}

export function Admin() {
	const { session } = useAuth();
	const [pending, setPending] = useState<PendingRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [actingOn, setActingOn] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	useEffect(() => {
		if (!session) return;
		listPendingRequests(session.token)
			.then(setPending)
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, [session]);

	if (!session) {
		return (
			<div className="page">
				<h1>審核</h1>
				<p className="hint">登入後才能使用。</p>
			</div>
		);
	}

	if (!session.isOwner) {
		return (
			<div className="page">
				<h1>審核</h1>
				<p className="hint">只有管理員能使用這個頁面。</p>
			</div>
		);
	}

	async function handleApprove(email: string) {
		if (!session) return;
		setActingOn(email);
		setActionError(null);
		try {
			await approveRequest(session.token, email);
			setPending((prev) => prev.filter((p) => p.email !== email));
		} catch (err) {
			setActionError((err as Error).message);
		} finally {
			setActingOn(null);
		}
	}

	async function handleDeny(email: string) {
		if (!session) return;
		setActingOn(email);
		setActionError(null);
		try {
			await denyRequest(session.token, email);
			setPending((prev) => prev.filter((p) => p.email !== email));
		} catch (err) {
			setActionError((err as Error).message);
		} finally {
			setActingOn(null);
		}
	}

	return (
		<div className="page">
			<h1>審核</h1>

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}
			{actionError && <p className="error">{actionError}</p>}

			<ul className="pending-list">
				{pending.map((req) => (
					<li key={req.email} className="pending-item">
						<img src={req.avatar} alt={req.name} className="nav-avatar" />
						<div className="pending-info">
							<div>
								<strong>{req.name}</strong>（{req.email}）
							</div>
							<div className="hint">申請時間：{formatTime(req.requestedAt)}</div>
						</div>
						<div className="pending-actions">
							<button type="button" disabled={actingOn === req.email} onClick={() => handleApprove(req.email)}>
								同意
							</button>
							<button
								type="button"
								className="logout"
								disabled={actingOn === req.email}
								onClick={() => handleDeny(req.email)}
							>
								拒絕
							</button>
						</div>
					</li>
				))}
			</ul>
			{!loading && pending.length === 0 && <p className="hint">目前沒有待審核的登入申請。</p>}
		</div>
	);
}
