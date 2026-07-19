interface ConfirmDialogProps {
	message: string;
	confirmLabel?: string;
	busy?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** 刪除等破壞性操作前的確認彈窗，取代瀏覽器原生 window.confirm。 */
export function ConfirmDialog({ message, confirmLabel = "刪除", busy, onConfirm, onCancel }: ConfirmDialogProps) {
	return (
		<div className="recipe-modal-backdrop" onClick={busy ? undefined : onCancel}>
			<div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
				<p className="confirm-dialog-message">{message}</p>
				<div className="confirm-dialog-actions">
					<button type="button" className="confirm-dialog-cancel" onClick={onCancel} disabled={busy}>
						取消
					</button>
					<button type="button" className="confirm-dialog-danger" onClick={onConfirm} disabled={busy}>
						{busy ? "刪除中…" : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
