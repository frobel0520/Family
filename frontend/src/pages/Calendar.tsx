import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createEvent, deleteEvent, listEvents, listFamily, updateEvent, type EventInput } from "../api";
import type { FamilyEvent, FamilyMember } from "../types";
import { MonthGrid, dateString } from "../components/MonthGrid";
import { Avatar } from "../components/Avatar";
import { ConfirmDialog } from "../components/ConfirmDialog";

/** 家人都在台灣，裝置本地時間就是台灣時間，不用另外換算。 */
function todayString(): string {
	const now = new Date();
	return dateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

interface FormState {
	title: string;
	date: string;
	time: string; // "" = 整天活動
	note: string;
	remindEmails: string[];
	remindDate: string;
	remindTime: string;
}

function emptyForm(date: string): FormState {
	return { title: "", date, time: "", note: "", remindEmails: [], remindDate: date, remindTime: "09:00" };
}

function formFor(event: FamilyEvent): FormState {
	const [remindDate, remindTime] = event.remindAt?.split("T") ?? [event.date, "09:00"];
	return {
		title: event.title,
		date: event.date,
		time: event.time ?? "",
		note: event.note ?? "",
		remindEmails: event.remindEmails ?? [],
		remindDate,
		remindTime,
	};
}

export function Calendar() {
	const { session } = useAuth();
	const today = todayString();
	const [events, setEvents] = useState<FamilyEvent[]>([]);
	const [family, setFamily] = useState<FamilyMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [cursor, setCursor] = useState(() => {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() + 1 };
	});
	const [selected, setSelected] = useState(today);
	const [editing, setEditing] = useState<FamilyEvent | "new" | null>(null);
	const [form, setForm] = useState<FormState>(() => emptyForm(today));
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<FamilyEvent | null>(null);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		if (!session) {
			setLoading(false);
			return;
		}
		setLoading(true);
		Promise.all([listEvents(session.token), listFamily(session.token)])
			.then(([loadedEvents, loadedFamily]) => {
				setEvents(loadedEvents);
				setFamily(loadedFamily);
			})
			.catch((err: Error) => setLoadError(err.message))
			.finally(() => setLoading(false));
	}, [session?.token]);

	const eventsByDate = useMemo(() => {
		const map = new Map<string, FamilyEvent[]>();
		// 同一天的排序：整天活動在前，其餘照時間（新增/編輯後不用重新載入也能維持順序）
		for (const event of [...events].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))) {
			const list = map.get(event.date);
			if (list) list.push(event);
			else map.set(event.date, [event]);
		}
		return map;
	}, [events]);

	const selectedEvents = eventsByDate.get(selected) ?? [];

	function shiftMonth(delta: number) {
		setCursor(({ year, month }) => {
			const next = new Date(Date.UTC(year, month - 1 + delta, 1));
			return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
		});
	}

	function jumpToToday() {
		const now = new Date();
		setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 });
		setSelected(today);
	}

	function openNew() {
		setForm(emptyForm(selected));
		setFormError(null);
		setEditing("new");
	}

	function openEdit(event: FamilyEvent) {
		setForm(formFor(event));
		setFormError(null);
		setEditing(event);
	}

	/** 勾選提醒對象；第一次勾人時把提醒時間預設成活動當天（沒填時間就用 09:00）。 */
	function toggleRemind(email: string) {
		setForm((prev) => {
			const has = prev.remindEmails.includes(email);
			const remindEmails = has
				? prev.remindEmails.filter((e) => e !== email)
				: [...prev.remindEmails, email];
			if (has || prev.remindEmails.length > 0) return { ...prev, remindEmails };
			return { ...prev, remindEmails, remindDate: prev.date, remindTime: prev.time || "09:00" };
		});
	}

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		if (!session || !editing) return;

		const title = form.title.trim();
		if (!title) {
			setFormError("活動名稱不能空白");
			return;
		}
		if (form.remindEmails.length > 0 && (!form.remindDate || !form.remindTime)) {
			setFormError("有勾選提醒對象就要設定提醒時間");
			return;
		}

		const payload: EventInput = {
			title,
			date: form.date,
			time: form.time || null,
			note: form.note.trim(),
			remindEmails: form.remindEmails,
			remindAt: form.remindEmails.length > 0 ? `${form.remindDate}T${form.remindTime}` : null,
		};

		setSaving(true);
		setFormError(null);
		try {
			if (editing === "new") {
				const created = await createEvent(session.token, payload);
				setEvents((prev) => [...prev, created]);
			} else {
				const saved = await updateEvent(session.token, editing.id, payload);
				setEvents((prev) => prev.map((event) => (event.id === saved.id ? saved : event)));
			}
			setSelected(payload.date);
			setEditing(null);
		} catch (err) {
			setFormError((err as Error).message);
		} finally {
			setSaving(false);
		}
	}

	async function confirmDelete() {
		if (!session || !pendingDelete) return;
		setDeleting(true);
		try {
			await deleteEvent(session.token, pendingDelete.id);
			setEvents((prev) => prev.filter((event) => event.id !== pendingDelete.id));
			if (editing !== "new" && editing?.id === pendingDelete.id) setEditing(null);
			setPendingDelete(null);
		} catch (err) {
			setLoadError((err as Error).message);
			setPendingDelete(null);
		} finally {
			setDeleting(false);
		}
	}

	function remindLabel(event: FamilyEvent): string | null {
		if (!event.remindAt || event.remindEmails.length === 0) return null;
		const names = event.remindEmails.map(
			(email) => family.find((member) => member.email === email)?.name ?? email.split("@")[0],
		);
		const [date, time] = event.remindAt.split("T");
		const sameDay = date === event.date;
		return `🔔 ${sameDay ? time : `${date} ${time}`} 提醒 ${names.join("、")}`;
	}

	if (!session) {
		return (
			<div className="page">
				<h1>行事曆</h1>
				<p className="hint">請先登入才能查看行事曆（只有家人看得到）。</p>
			</div>
		);
	}

	return (
		<div className="page">
			<h1>行事曆</h1>

			<div className="calendar-toolbar">
				<button type="button" onClick={() => shiftMonth(-1)} aria-label="上個月">
					‹
				</button>
				<strong>
					{cursor.year} 年 {cursor.month} 月
				</strong>
				<button type="button" onClick={() => shiftMonth(1)} aria-label="下個月">
					›
				</button>
				<button type="button" className="calendar-today-btn" onClick={jumpToToday}>
					今天
				</button>
			</div>

			{loading && <p>載入中…</p>}
			{loadError && <p className="error">載入失敗：{loadError}</p>}

			<MonthGrid
				year={cursor.year}
				month={cursor.month}
				today={today}
				selected={selected}
				eventsByDate={eventsByDate}
				onSelect={(date) => {
					setSelected(date);
					setEditing(null);
				}}
			/>

			<div className="calendar-day">
				<div className="calendar-day-header">
					<h2>
						{Number(selected.slice(5, 7))} 月 {Number(selected.slice(8, 10))} 日
						{selected === today && <span className="calendar-today-tag">今天</span>}
					</h2>
					<button type="button" onClick={openNew}>
						＋ 新增活動
					</button>
				</div>

				{selectedEvents.length === 0 && <p className="hint">這天還沒有活動。</p>}

				<ul className="calendar-event-list">
					{selectedEvents.map((event) => (
						<li key={event.id} className="calendar-event">
							<span className="calendar-event-time">{event.time ?? "整天"}</span>
							<div className="calendar-event-body">
								<strong>{event.title}</strong>
								{event.note && <p>{event.note}</p>}
								{remindLabel(event) && <span className="calendar-event-remind">{remindLabel(event)}</span>}
								<span className="calendar-event-author">
									<Avatar name={event.createdBy} avatar={event.avatar ?? undefined} />
									{event.createdBy} 建立
								</span>
							</div>
							<div className="calendar-event-actions">
								<button type="button" onClick={() => openEdit(event)}>
									編輯
								</button>
								<button type="button" className="delete-x" aria-label="刪除活動" onClick={() => setPendingDelete(event)}>
									✕
								</button>
							</div>
						</li>
					))}
				</ul>
			</div>

			{editing && (
				<form className="calendar-form" onSubmit={handleSave}>
					<h3>{editing === "new" ? "新增活動" : "編輯活動"}</h3>

					<label>
						活動名稱
						<input
							type="text"
							value={form.title}
							maxLength={60}
							placeholder="例如：阿嬤生日聚餐"
							onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
						/>
					</label>

					<div className="calendar-form-row">
						<label>
							日期
							<input
								type="date"
								value={form.date}
								onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
							/>
						</label>
						<label>
							時間（留空＝整天）
							<input
								type="time"
								value={form.time}
								onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
							/>
						</label>
					</div>

					<label>
						備註
						<textarea
							value={form.note}
							rows={2}
							maxLength={500}
							placeholder="地點、要帶什麼…"
							onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
						/>
					</label>

					<fieldset className="calendar-remind">
						<legend>要提醒誰？（沒勾的人不會收到通知）</legend>
						<div className="calendar-remind-people">
							{family.map((member) => (
								<label key={member.email} className="calendar-remind-person">
									<input
										type="checkbox"
										checked={form.remindEmails.includes(member.email)}
										onChange={() => toggleRemind(member.email)}
									/>
									<Avatar name={member.name} avatar={member.avatar ?? undefined} />
									{member.name}
								</label>
							))}
						</div>

						{form.remindEmails.length > 0 && (
							<div className="calendar-form-row">
								<label>
									提醒日期
									<input
										type="date"
										value={form.remindDate}
										onChange={(e) => setForm((prev) => ({ ...prev, remindDate: e.target.value }))}
									/>
								</label>
								<label>
									提醒時間
									<input
										type="time"
										value={form.remindTime}
										onChange={(e) => setForm((prev) => ({ ...prev, remindTime: e.target.value }))}
									/>
								</label>
							</div>
						)}
					</fieldset>

					{formError && <p className="error">{formError}</p>}

					<div className="calendar-form-actions">
						<button type="button" onClick={() => setEditing(null)} disabled={saving}>
							取消
						</button>
						<button type="submit" disabled={saving}>
							{saving ? "儲存中…" : "儲存"}
						</button>
					</div>
				</form>
			)}

			{pendingDelete && (
				<ConfirmDialog
					message={`確定要刪除「${pendingDelete.title}」嗎？`}
					busy={deleting}
					onConfirm={confirmDelete}
					onCancel={() => setPendingDelete(null)}
				/>
			)}
		</div>
	);
}
