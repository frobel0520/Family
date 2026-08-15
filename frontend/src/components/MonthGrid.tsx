import type { FamilyEvent } from "../types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
/** 一格最多列幾筆，超過用「+N」帶過 */
const MAX_PER_CELL = 2;

interface Props {
	year: number;
	month: number; // 1-12
	today: string; // YYYY-MM-DD
	selected: string;
	eventsByDate: Map<string, FamilyEvent[]>;
	onSelect: (date: string) => void;
}

export function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

export function dateString(year: number, month: number, day: number): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 月曆格子。整個月一次畫完，上個月/下個月的位置留空（避免點到別的月份）。 */
export function MonthGrid({ year, month, today, selected, eventsByDate, onSelect }: Props) {
	// UTC 建構避免本機時區把 1 號推到上個月
	const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const cells: (number | null)[] = [
		...Array.from({ length: firstWeekday }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1),
	];
	while (cells.length % 7 !== 0) cells.push(null);

	return (
		<div className="month-grid">
			{WEEKDAYS.map((label) => (
				<div key={label} className="month-weekday">
					{label}
				</div>
			))}

			{cells.map((day, index) => {
				if (day === null) return <div key={`blank-${index}`} className="month-cell blank" />;

				const date = dateString(year, month, day);
				const dayEvents = eventsByDate.get(date) ?? [];
				const classes = ["month-cell"];
				if (date === today) classes.push("today");
				if (date === selected) classes.push("selected");

				return (
					<button key={date} type="button" className={classes.join(" ")} onClick={() => onSelect(date)}>
						<span className="month-cell-day">{day}</span>
						{dayEvents.slice(0, MAX_PER_CELL).map((event) => (
							<span key={event.id} className="month-cell-event">
								{event.title}
							</span>
						))}
						{dayEvents.length > MAX_PER_CELL && (
							<span className="month-cell-more">+{dayEvents.length - MAX_PER_CELL}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
