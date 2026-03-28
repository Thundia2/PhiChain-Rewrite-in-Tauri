// ============================================================
// Record Review Dialog
//
// Shown after recording mode is toggled off (when there are
// recorded keyframes). Allows the user to apply simplification
// before committing the keyframes as events.
// ============================================================

import { useState, useMemo } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { simplifyKeyframes, previewSimplification } from "../../utils/keyframeSimplify";
import type { SimplifiableKeyframe } from "../../utils/keyframeSimplify";

interface RecordReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onAccept: (simplified: SimplifiableKeyframe[]) => void;
}

export function RecordReviewDialog({ open, onClose, onAccept }: RecordReviewDialogProps) {
  const recordedKeyframes = useEditorStore((s) => s.recordedKeyframes);
  const [threshold, setThreshold] = useState(0.5);

  const asSimplifiable: SimplifiableKeyframe[] = useMemo(
    () => recordedKeyframes.map((kf) => ({ beat: kf.beat, value: kf.x ?? kf.y ?? kf.rotation ?? 0 })),
    [recordedKeyframes],
  );

  const simplifiedCount = useMemo(
    () => previewSimplification(asSimplifiable, threshold),
    [asSimplifiable, threshold],
  );

  const simplified = useMemo(
    () => simplifyKeyframes(asSimplifiable, threshold),
    [asSimplifiable, threshold],
  );

  if (!open || recordedKeyframes.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div
        className="rounded-lg p-5 w-96"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <h3 className="text-sm font-semibold mb-3">Review Recorded Keyframes</h3>

        <div className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          Recorded <strong>{recordedKeyframes.length}</strong> keyframes.
          Adjust simplification to reduce redundant points.
        </div>

        {/* Simplification threshold slider */}
        <label className="block mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Simplification Threshold</span>
            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={10}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full"
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            <span>Fine (0.01)</span>
            <span>Coarse (10.0)</span>
          </div>
        </label>

        {/* Preview count */}
        <div
          className="text-xs text-center py-2 mb-3 rounded"
          style={{ backgroundColor: "var(--bg-active)" }}
        >
          {recordedKeyframes.length} keyframes &rarr; <strong>{simplifiedCount}</strong> after simplification
          <span className="ml-2" style={{ color: "var(--text-muted)" }}>
            ({Math.round((1 - simplifiedCount / recordedKeyframes.length) * 100)}% reduction)
          </span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button
            className="px-3 py-1.5 rounded text-xs"
            style={{
              backgroundColor: "var(--bg-active)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-color)",
            }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded text-xs"
            style={{
              backgroundColor: "var(--bg-active)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
            }}
            onClick={() => onAccept(asSimplifiable)}
          >
            Accept Raw
          </button>
          <button
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
            onClick={() => onAccept(simplified)}
          >
            Accept Simplified
          </button>
        </div>
      </div>
    </div>
  );
}
