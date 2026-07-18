interface PagerProps {
	page: number; // 1-indexed
	totalPages: number;
	onChange: (page: number) => void;
}

export function Pager({ page, totalPages, onChange }: PagerProps) {
	if (totalPages <= 1) return null;

	return (
		<div className="pager">
			<button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="上一頁">
				←
			</button>
			<span className="pager-status">
				{page}/{totalPages}
			</span>
			<button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="下一頁">
				→
			</button>
		</div>
	);
}
