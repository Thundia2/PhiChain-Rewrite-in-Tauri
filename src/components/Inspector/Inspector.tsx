import { useMemo, useEffect, useRef, useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import type { Note, LineEvent, NoteKind, EasingType } from "../../types/chart";
import { Field, SelectField, BeatField, EASING_OPTIONS } from "../common/FormFields";
import { Card, SectionHeader, ActionButton } from "../common/UIKit";
import { ColorPicker } from "../common/ColorPicker";

/** Texture thumbnail + upload/remove for a line's custom texture */
function TexturePreview({ textureName, lineIndex }: { textureName?: string; lineIndex: number }) {
  const lineTextures = useChartStore((s) => s.lineTextures);
  const setLineTexture = useChartStore((s) => s.setLineTexture);
  const editLine = useChartStore((s) => s.editLine);

  const previewUrl = useMemo(() => {
    if (!textureName) return null;
    const blob = lineTextures.get(textureName);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [textureName, lineTextures]);

  // Revoke previous blob URLs to prevent memory leaks
  const prevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevUrlRef.current && prevUrlRef.current !== previewUrl) {
      URL.revokeObjectURL(prevUrlRef.current);
    }
    prevUrlRef.current = previewUrl;
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, [previewUrl]);

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      setLineTexture(file.name, blob);
      editLine(lineIndex, { texture: file.name });
    };
    input.click();
  };

  const handleRemove = () => {
    editLine(lineIndex, { texture: undefined });
  };

  return (
    <div style={{ marginTop: 2, marginBottom: 4 }}>
      {previewUrl && (
        <img
          src={previewUrl}
          alt={textureName}
          style={{
            maxWidth: "100%",
            maxHeight: 80,
            borderRadius: 6,
            border: "1px solid var(--border-color)",
            marginBottom: 4,
            objectFit: "contain",
            background: "rgba(0,0,0,0.3)",
          }}
        />
      )}
      {textureName && !previewUrl && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
          Image not loaded ({textureName})
        </div>
      )}
      <div style={{ display: "flex", gap: 4 }}>
        <ActionButton variant="primary" onClick={handleUpload}>
          {textureName ? "Change..." : "+ Add Texture"}
        </ActionButton>
        {textureName && (
          <ActionButton variant="danger" onClick={handleRemove}>
            Remove
          </ActionButton>
        )}
      </div>
    </div>
  );
}

const NOTE_KIND_OPTIONS = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

function NoteInspector({ note, lineIndex, noteIndex }: { note: Note; lineIndex: number; noteIndex: number }) {
  const editNote = useChartStore((s) => s.editNote);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
      <SectionHeader color="var(--accent-primary)">Note #{noteIndex}</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <SelectField
            label="Kind"
            value={note.kind}
            options={NOTE_KIND_OPTIONS}
            onChange={(v) => editNote(lineIndex, noteIndex, { kind: v as NoteKind })}
          />
          <BeatField
            label="Beat"
            beat={note.beat}
            onChange={(b) => editNote(lineIndex, noteIndex, { beat: b })}
          />
          <Field
            label="X"
            value={note.x}
            onChange={(v) => editNote(lineIndex, noteIndex, { x: parseFloat(v) })}
            step="1"
          />
          <Field
            label="Speed"
            value={note.speed}
            onChange={(v) => { const val = parseFloat(v); editNote(lineIndex, noteIndex, { speed: isNaN(val) ? 1 : val }); }}
            step="0.1"
          />
          <SelectField
            label="Side"
            value={note.above ? "above" : "below"}
            options={[
              { value: "above", label: "Above" },
              { value: "below", label: "Below" },
            ]}
            onChange={(v) => editNote(lineIndex, noteIndex, { above: v === "above" })}
          />
          {note.kind === "hold" && note.hold_beat && (
            <BeatField
              label="Hold"
              beat={note.hold_beat}
              onChange={(b) => editNote(lineIndex, noteIndex, { hold_beat: b })}
            />
          )}
        </div>
      </Card>
      <SectionHeader>RPE Properties</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <Field
            label="Size"
            value={note.size ?? 1}
            onChange={(v) => {
              const val = parseFloat(v);
              editNote(lineIndex, noteIndex, { size: val === 1 ? undefined : (isNaN(val) ? 1 : val) });
            }}
            step="0.1"
          />
          <Field
            label="Alpha"
            value={note.alpha ?? 255}
            onChange={(v) => {
              const val = parseInt(v);
              editNote(lineIndex, noteIndex, { alpha: val === 255 ? undefined : Math.max(0, Math.min(255, isNaN(val) ? 255 : val)) });
            }}
            step="1"
          />
          <Field
            label="Vis. Time"
            value={note.visible_time ?? 999999}
            onChange={(v) => {
              const val = parseFloat(v);
              editNote(lineIndex, noteIndex, { visible_time: val === 999999 ? undefined : (isNaN(val) ? 999999 : val) });
            }}
            step="0.5"
          />
          <SelectField
            label="Fake"
            value={note.fake ? "true" : "false"}
            options={[
              { value: "false", label: "No" },
              { value: "true", label: "Yes" },
            ]}
            onChange={(v) => editNote(lineIndex, noteIndex, { fake: v === "true" ? true : undefined })}
          />
          <Field
            label="Y Offset"
            value={note.y_offset ?? 0}
            onChange={(v) => {
              const val = parseFloat(v);
              editNote(lineIndex, noteIndex, { y_offset: val === 0 ? undefined : (isNaN(val) ? 0 : val) });
            }}
            step="0.5"
          />
          <Field
            label="Judge Area"
            value={note.judge_area ?? 1}
            onChange={(v) => {
              const val = parseFloat(v);
              editNote(lineIndex, noteIndex, { judge_area: val === 1 ? undefined : (isNaN(val) ? 1 : val) });
            }}
            step="0.1"
          />
          <Field
            label="Hit Sound"
            type="text"
            value={note.hitsound ?? ""}
            onChange={(v) => editNote(lineIndex, noteIndex, { hitsound: v || undefined })}
          />
        </div>
      </Card>
    </div>
  );
}

function EventInspectorPanel({ event, lineIndex, eventIndex }: { event: LineEvent; lineIndex: number; eventIndex: number }) {
  const editEvent = useChartStore((s) => s.editEvent);
  const [showColorPicker, setShowColorPicker] = useState<"start" | "end" | "constant" | null>(null);

  const isTransition = "transition" in event.value;
  const isColorTransition = "color_transition" in event.value;
  const isColorConstant = "color_constant" in event.value;
  const isTextValue = "text_value" in event.value;
  const isTextTransition = "text_transition" in event.value;
  const isScaleEvent = event.kind === "scale_x" || event.kind === "scale_y";

  const tv = isTransition ? (event.value as { transition: { start: number; end: number; easing: EasingType } }).transition : null;
  const cv = !isTransition && !isColorTransition && !isColorConstant && !isTextValue && !isTextTransition
    ? (event.value as { constant: number }).constant : null;
  const startVal = tv ? tv.start : cv ?? 0;
  const endVal = tv ? tv.end : cv ?? 0;

  const valueStep = isScaleEvent ? "0.01" : "0.1";
  const valueMin = isScaleEvent ? "0" : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
      <SectionHeader color="var(--accent-primary)">Event #{eventIndex} ({event.kind})</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <BeatField
            label="Start"
            beat={event.start_beat}
            onChange={(b) => editEvent(lineIndex, eventIndex, { start_beat: b })}
          />
          <BeatField
            label="End"
            beat={event.end_beat}
            onChange={(b) => editEvent(lineIndex, eventIndex, { end_beat: b })}
          />

          {/* Color event: constant */}
          {isColorConstant && (() => {
            const rgb = (event.value as { color_constant: [number, number, number] }).color_constant;
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                    border: "1px solid var(--border-color)",
                  }} />
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    rgb({rgb[0]}, {rgb[1]}, {rgb[2]})
                  </span>
                </div>
                <ActionButton variant="primary" onClick={() => setShowColorPicker("constant")}>
                  Edit Color
                </ActionButton>
                <Field label="R" value={rgb[0]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_constant: [parseInt(v) || 0, rgb[1], rgb[2]] } })} step="1" min="0" max="255" />
                <Field label="G" value={rgb[1]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_constant: [rgb[0], parseInt(v) || 0, rgb[2]] } })} step="1" min="0" max="255" />
                <Field label="B" value={rgb[2]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_constant: [rgb[0], rgb[1], parseInt(v) || 0] } })} step="1" min="0" max="255" />
                {showColorPicker === "constant" && (
                  <ColorPicker
                    value={rgb}
                    onChange={(newRgb) => editEvent(lineIndex, eventIndex, { value: { color_constant: newRgb } })}
                    onClose={() => setShowColorPicker(null)}
                  />
                )}
              </>
            );
          })()}

          {/* Color event: transition */}
          {isColorTransition && (() => {
            const ct = (event.value as { color_transition: { start: [number, number, number]; end: [number, number, number]; easing: EasingType } }).color_transition;
            return (
              <>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>Start Color</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: `rgb(${ct.start[0]},${ct.start[1]},${ct.start[2]})`, border: "1px solid var(--border-color)", cursor: "pointer" }} onClick={() => setShowColorPicker("start")} />
                  <ActionButton onClick={() => setShowColorPicker("start")}>Edit</ActionButton>
                </div>
                <Field label="R" value={ct.start[0]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, start: [parseInt(v) || 0, ct.start[1], ct.start[2]] } } })} step="1" min="0" max="255" />
                <Field label="G" value={ct.start[1]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, start: [ct.start[0], parseInt(v) || 0, ct.start[2]] } } })} step="1" min="0" max="255" />
                <Field label="B" value={ct.start[2]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, start: [ct.start[0], ct.start[1], parseInt(v) || 0] } } })} step="1" min="0" max="255" />
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginTop: 4 }}>End Color</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: `rgb(${ct.end[0]},${ct.end[1]},${ct.end[2]})`, border: "1px solid var(--border-color)", cursor: "pointer" }} onClick={() => setShowColorPicker("end")} />
                  <ActionButton onClick={() => setShowColorPicker("end")}>Edit</ActionButton>
                </div>
                <Field label="R" value={ct.end[0]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, end: [parseInt(v) || 0, ct.end[1], ct.end[2]] } } })} step="1" min="0" max="255" />
                <Field label="G" value={ct.end[1]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, end: [ct.end[0], parseInt(v) || 0, ct.end[2]] } } })} step="1" min="0" max="255" />
                <Field label="B" value={ct.end[2]} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, end: [ct.end[0], ct.end[1], parseInt(v) || 0] } } })} step="1" min="0" max="255" />
                <SelectField
                  label="Easing"
                  value={typeof ct.easing === "string" ? ct.easing : "linear"}
                  options={EASING_OPTIONS}
                  onChange={(v) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, easing: v as EasingType } } })}
                />
                {showColorPicker === "start" && (
                  <ColorPicker
                    value={ct.start}
                    onChange={(newRgb) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, start: newRgb } } })}
                    onClose={() => setShowColorPicker(null)}
                  />
                )}
                {showColorPicker === "end" && (
                  <ColorPicker
                    value={ct.end}
                    onChange={(newRgb) => editEvent(lineIndex, eventIndex, { value: { color_transition: { ...ct, end: newRgb } } })}
                    onClose={() => setShowColorPicker(null)}
                  />
                )}
              </>
            );
          })()}

          {/* Text event */}
          {isTextValue && (() => {
            const text = (event.value as { text_value: string }).text_value;
            return (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Text</label>
                  <textarea
                    value={text}
                    onChange={(e) => editEvent(lineIndex, eventIndex, { value: { text_value: e.target.value } })}
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontSize: 11,
                      resize: "vertical",
                      minHeight: 40,
                    }}
                  />
                </div>
                {event.font !== undefined && (
                  <Field label="Font" value={event.font} onChange={(v) => editEvent(lineIndex, eventIndex, { font: v })} type="text" />
                )}
              </>
            );
          })()}

          {/* Text transition event (with easing) */}
          {isTextTransition && (() => {
            const tt = (event.value as { text_transition: { start: string; end: string; easing: EasingType } }).text_transition;
            return (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Start Text</label>
                  <textarea
                    value={tt.start}
                    onChange={(e) => editEvent(lineIndex, eventIndex, { value: { text_transition: { ...tt, start: e.target.value } } })}
                    style={{
                      backgroundColor: "var(--bg-primary)", color: "var(--text-primary)",
                      border: "1px solid var(--border-color)", borderRadius: 4,
                      padding: "4px 6px", fontSize: 11, resize: "vertical", minHeight: 40,
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>End Text</label>
                  <textarea
                    value={tt.end}
                    onChange={(e) => editEvent(lineIndex, eventIndex, { value: { text_transition: { ...tt, end: e.target.value } } })}
                    style={{
                      backgroundColor: "var(--bg-primary)", color: "var(--text-primary)",
                      border: "1px solid var(--border-color)", borderRadius: 4,
                      padding: "4px 6px", fontSize: 11, resize: "vertical", minHeight: 40,
                    }}
                  />
                </div>
                {event.font !== undefined && (
                  <Field label="Font" value={event.font} onChange={(v) => editEvent(lineIndex, eventIndex, { font: v })} type="text" />
                )}
              </>
            );
          })()}

          {/* Standard numeric event (transition or constant) */}
          {!isColorTransition && !isColorConstant && !isTextValue && !isTextTransition && (
            <>
              <SelectField
                label="Type"
                value={isTransition ? "transition" : "constant"}
                options={[
                  { value: "transition", label: "Transition" },
                  { value: "constant", label: "Constant" },
                ]}
                onChange={(v) => {
                  if (v === "constant") {
                    editEvent(lineIndex, eventIndex, { value: { constant: startVal } });
                  } else {
                    editEvent(lineIndex, eventIndex, {
                      value: { transition: { start: startVal, end: endVal, easing: "linear" } },
                    });
                  }
                }}
              />
              {isTransition && tv ? (
                <>
                  <Field
                    label={isScaleEvent ? "Start scale" : "Start val"}
                    value={startVal}
                    onChange={(v) =>
                      editEvent(lineIndex, eventIndex, {
                        value: {
                          transition: {
                            start: parseFloat(v),
                            end: tv.end,
                            easing: tv.easing,
                          },
                        },
                      })
                    }
                    step={valueStep}
                    min={valueMin}
                  />
                  <Field
                    label={isScaleEvent ? "End scale" : "End val"}
                    value={endVal}
                    onChange={(v) =>
                      editEvent(lineIndex, eventIndex, {
                        value: {
                          transition: {
                            start: tv.start,
                            end: parseFloat(v),
                            easing: tv.easing,
                          },
                        },
                      })
                    }
                    step={valueStep}
                    min={valueMin}
                  />
                  <SelectField
                    label="Easing"
                    value={typeof tv.easing === "string" ? tv.easing : "linear"}
                    options={EASING_OPTIONS}
                    onChange={(v) =>
                      editEvent(lineIndex, eventIndex, {
                        value: {
                          transition: {
                            start: tv.start,
                            end: tv.end,
                            easing: v as EasingType,
                          },
                        },
                      })
                    }
                  />
                  <Field
                    label="Ease L"
                    value={event.easing_left ?? 0}
                    onChange={(v) => editEvent(lineIndex, eventIndex, { easing_left: parseFloat(v) })}
                    step="0.05"
                  />
                  <Field
                    label="Ease R"
                    value={event.easing_right ?? 1}
                    onChange={(v) => { const val = parseFloat(v); editEvent(lineIndex, eventIndex, { easing_right: isNaN(val) ? 1 : val }); }}
                    step="0.05"
                  />
                </>
              ) : (
                <Field
                  label={isScaleEvent ? "Scale" : "Value"}
                  value={startVal}
                  onChange={(v) =>
                    editEvent(lineIndex, eventIndex, { value: { constant: parseFloat(v) } })
                  }
                  step={valueStep}
                  min={valueMin}
                />
              )}
              {isScaleEvent && (
                <div style={{ fontSize: 9, color: "var(--text-muted)", padding: "0 0 0 4px" }}>
                  0.0 = invisible, 1.0 = normal, 2.0 = double size
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function LineInspector({ lineIndex }: { lineIndex: number }) {
  const line = useChartStore((s) => s.chart.lines[lineIndex]);
  const editLine = useChartStore((s) => s.editLine);

  if (!line) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
      <SectionHeader color="var(--accent-primary)">Line #{lineIndex}</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <Field
            label="Name"
            type="text"
            value={line.name}
            onChange={(v) => editLine(lineIndex, { name: v })}
          />
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {line.notes.length} notes, {line.events.length} events
            {line.event_layers && line.event_layers.length > 0 ? `, ${line.event_layers.length} layers` : ""}
          </div>
        </div>
      </Card>
      <SectionHeader>RPE Properties</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <Field
            label="Z Order"
            value={line.z_order ?? 0}
            onChange={(v) => {
              const val = parseInt(v);
              editLine(lineIndex, { z_order: val === 0 ? undefined : val });
            }}
            step="1"
          />
          <SelectField
            label="Is Cover"
            value={line.is_cover === false ? "false" : "true"}
            options={[
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]}
            onChange={(v) => editLine(lineIndex, { is_cover: v === "false" ? false : undefined })}
          />
          <Field
            label="BPM Factor"
            value={line.bpm_factor ?? 1}
            onChange={(v) => {
              const val = parseFloat(v);
              editLine(lineIndex, { bpm_factor: val === 1 ? undefined : (isNaN(val) ? 1 : val) });
            }}
            step="0.1"
          />
          <Field
            label="Group"
            value={line.group ?? 0}
            onChange={(v) => {
              const val = parseInt(v);
              editLine(lineIndex, { group: val === 0 ? undefined : val });
            }}
            step="1"
          />
          <Field
            label="Texture"
            type="text"
            value={line.texture ?? ""}
            onChange={(v) => editLine(lineIndex, { texture: v || undefined })}
          />
          <TexturePreview textureName={line.texture} lineIndex={lineIndex} />
          <SelectField
            label="Rot w/ Father"
            value={line.rotate_with_father === false ? "false" : "true"}
            options={[
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]}
            onChange={(v) => editLine(lineIndex, { rotate_with_father: v === "false" ? false : undefined })}
          />
          <Field
            label="Father Idx"
            value={line.father_index ?? -1}
            onChange={(v) => {
              const val = parseInt(v);
              editLine(lineIndex, { father_index: val === -1 ? undefined : val });
            }}
            step="1"
          />
          <SelectField
            label="Attach UI"
            value={line.attach_ui ?? ""}
            options={[
              { value: "", label: "None" },
              { value: "pause", label: "Pause Button" },
              { value: "combonumber", label: "Combo Number" },
              { value: "combo", label: "Combo Label" },
              { value: "score", label: "Score" },
              { value: "bar", label: "Progress Bar" },
              { value: "name", label: "Song Name" },
              { value: "level", label: "Level Label" },
            ]}
            onChange={(v) => editLine(lineIndex, { attach_ui: v || undefined })}
          />
          <SelectField
            label="Is GIF"
            value={line.is_gif ? "true" : "false"}
            options={[
              { value: "false", label: "No" },
              { value: "true", label: "Yes" },
            ]}
            onChange={(v) => editLine(lineIndex, { is_gif: v === "true" ? true : undefined })}
          />
        </div>
      </Card>
      <SectionHeader>Incline & GIF Hints</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
            <strong>Incline events</strong> control 3D tilt perspective. Values are in degrees.
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
            <strong>GIF events</strong> control animated texture playback. 0.0 = start, 1.0 = end (step 0.01).
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
            Set <strong>Is GIF = Yes</strong> to mark this line's texture as an animated GIF.
          </div>
        </div>
      </Card>
    </div>
  );
}

function MultiNoteInspector({ count, lineIndex, indices }: { count: number; lineIndex: number; indices: number[] }) {
  const editNotes = useChartStore((s) => s.editNotes);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
      <SectionHeader color="var(--accent-primary)">{count} notes selected</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <SelectField
            label="Kind"
            value=""
            options={[{ value: "", label: "(mixed)" }, ...NOTE_KIND_OPTIONS]}
            onChange={(v) => {
              if (v) editNotes(lineIndex, indices, { kind: v as NoteKind });
            }}
          />
          <SelectField
            label="Side"
            value=""
            options={[
              { value: "", label: "(mixed)" },
              { value: "above", label: "Above" },
              { value: "below", label: "Below" },
            ]}
            onChange={(v) => {
              if (v) editNotes(lineIndex, indices, { above: v === "above" });
            }}
          />
        </div>
      </Card>
      <SectionHeader>RPE Properties</SectionHeader>
      <Card>
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <Field
            label="Size"
            type="text"
            value=""
            onChange={(v) => {
              const val = parseFloat(v);
              if (!isNaN(val)) editNotes(lineIndex, indices, { size: val === 1 ? undefined : val });
            }}
          />
          <Field
            label="Alpha"
            type="text"
            value=""
            onChange={(v) => {
              const val = parseInt(v);
              if (!isNaN(val)) editNotes(lineIndex, indices, { alpha: val === 255 ? undefined : Math.max(0, Math.min(255, val)) });
            }}
          />
          <Field
            label="Vis. Time"
            type="text"
            value=""
            onChange={(v) => {
              const val = parseFloat(v);
              if (!isNaN(val)) editNotes(lineIndex, indices, { visible_time: val === 999999 ? undefined : val });
            }}
          />
          <SelectField
            label="Fake"
            value=""
            options={[
              { value: "", label: "(mixed)" },
              { value: "false", label: "No" },
              { value: "true", label: "Yes" },
            ]}
            onChange={(v) => {
              if (v) editNotes(lineIndex, indices, { fake: v === "true" ? true : undefined });
            }}
          />
        </div>
      </Card>
    </div>
  );
}

export function Inspector() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const selectedEventIndices = useEditorStore((s) => s.selectedEventIndices);
  const chart = useChartStore((s) => s.chart);

  if (selectedLineIndex === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          No line selected
        </span>
      </div>
    );
  }

  const line = chart.lines[selectedLineIndex];
  if (!line) return null;

  // Single note selected
  if (selectedNoteIndices.length === 1) {
    const note = line.notes[selectedNoteIndices[0]];
    if (note) {
      return (
        <div style={{ overflowY: "auto", height: "100%" }}>
          <NoteInspector
            note={note}
            lineIndex={selectedLineIndex}
            noteIndex={selectedNoteIndices[0]}
          />
        </div>
      );
    }
  }

  // Multiple notes selected
  if (selectedNoteIndices.length > 1) {
    return (
      <div style={{ overflowY: "auto", height: "100%" }}>
        <MultiNoteInspector
          count={selectedNoteIndices.length}
          lineIndex={selectedLineIndex}
          indices={selectedNoteIndices}
        />
      </div>
    );
  }

  // Single event selected
  if (selectedEventIndices.length === 1) {
    const event = line.events[selectedEventIndices[0]];
    if (event) {
      return (
        <div style={{ overflowY: "auto", height: "100%" }}>
          <EventInspectorPanel
            event={event}
            lineIndex={selectedLineIndex}
            eventIndex={selectedEventIndices[0]}
          />
        </div>
      );
    }
  }

  // Multiple events selected
  if (selectedEventIndices.length > 1) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {selectedEventIndices.length} events selected
        </span>
      </div>
    );
  }

  // Nothing selected — show line info
  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      <LineInspector lineIndex={selectedLineIndex} />
    </div>
  );
}
