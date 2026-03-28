// ============================================================
// Timeline Minimap — Note density overview with click-to-seek
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { audioEngine } from "../../audio/audioEngine";
import { beatToFloat } from "../../types/chart";
import { BpmList } from "../../utils/bpmList";

export function TimelineMinimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lines = useChartStore((s) => s.chart.lines);
  const bpmPoints = useChartStore((s) => s.chart.bpm_list);
  const offset = useChartStore((s) => s.chart.offset);

  // Render density + playhead
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const bpmList = new BpmList(bpmPoints);

    function draw() {
      if (!canvas || !ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = "rgba(12, 12, 18, 0.6)";
      ctx.fillRect(0, 0, width, height);

      // Find total beat range
      let maxBeat = 0;
      for (const line of lines) {
        for (const note of line.notes) {
          maxBeat = Math.max(maxBeat, beatToFloat(note.beat));
        }
        for (const event of line.events) {
          maxBeat = Math.max(maxBeat, beatToFloat(event.end_beat));
        }
      }
      if (maxBeat === 0) maxBeat = 100;

      // Compute note density per pixel column
      const density = new Float32Array(width);
      for (const line of lines) {
        for (const note of line.notes) {
          const beat = beatToFloat(note.beat);
          const x = Math.floor((beat / maxBeat) * (width - 1));
          if (x >= 0 && x < width) density[x]++;
        }
      }

      // Normalize and draw
      let maxDensity = 0;
      for (let i = 0; i < width; i++) {
        if (density[i] > maxDensity) maxDensity = density[i];
      }
      if (maxDensity === 0) maxDensity = 1;

      for (let x = 0; x < width; x++) {
        const intensity = density[x] / maxDensity;
        if (intensity > 0) {
          const alpha = Math.max(0.15, intensity);
          ctx.fillStyle = `rgba(108, 138, 255, ${alpha})`;
          ctx.fillRect(x, 0, 1, height);
        }
      }

      // Playhead
      const { currentTime } = useAudioStore.getState();
      const currentBeat = bpmList.beatAtFloat(Math.max(0, currentTime - offset));
      const playheadX = (currentBeat / maxBeat) * width;
      ctx.fillStyle = "rgba(108, 138, 255, 0.9)";
      ctx.fillRect(playheadX - 1, 0, 2, height);

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [lines, bpmPoints, offset]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;

      let maxBeat = 0;
      const cs = useChartStore.getState();
      for (const line of cs.chart.lines) {
        for (const note of line.notes) {
          maxBeat = Math.max(maxBeat, beatToFloat(note.beat));
        }
        for (const event of line.events) {
          maxBeat = Math.max(maxBeat, beatToFloat(event.end_beat));
        }
      }
      if (maxBeat === 0) return;

      const targetBeat = fraction * maxBeat;
      const bpmList = new BpmList(cs.chart.bpm_list);
      const targetTime = bpmList.timeAtFloat(targetBeat) + cs.chart.offset;
      audioEngine.seek(targetTime);
    },
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={16}
      style={{
        width: "100%",
        height: 16,
        borderBottom: "1px solid var(--border-color)",
        cursor: "pointer",
        display: "block",
        flexShrink: 0,
      }}
      onClick={handleClick}
    />
  );
}
