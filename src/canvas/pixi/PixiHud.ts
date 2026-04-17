// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// PixiHud — HUD overlay for score, combo, chart name, level
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Renders score, combo, chart name, and level as PixiJS Text objects
// positioned at the corners of the canvas.
// ============================================================

import { Container, Text, TextStyle } from "pixi.js";

// ============================================================
// HUD Container
// ============================================================

/**
 * Manages the HUD overlay: score (top-right), combo (top-center),
 * chart name (bottom-left), and chart level (bottom-right).
 *
 * Positioned in screen space (not affected by game transforms).
 */
export class PixiHud extends Container {
  private scoreText: Text;
  private comboNumber: Text;
  private comboLabel: Text;
  private chartNameText: Text;
  private chartLevelText: Text;

  constructor() {
    super();

    // Score (top-right)
    this.scoreText = new Text({
      text: "0000000",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fontWeight: "bold",
        fill: "rgba(255, 255, 255, 0.9)",
      }),
    });
    this.scoreText.anchor.set(1, 0); // right-aligned, top
    this.addChild(this.scoreText);

    // Combo number (center-top)
    this.comboNumber = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 28,
        fontWeight: "bold",
        fill: "rgba(255, 255, 255, 0.9)",
      }),
    });
    this.comboNumber.anchor.set(0.5, 0); // center-aligned, top
    this.comboNumber.visible = false;
    this.addChild(this.comboNumber);

    // Combo label
    this.comboLabel = new Text({
      text: "COMBO",
      style: new TextStyle({
        fontFamily: "sans-serif",
        fontSize: 9,
        fill: "rgba(255, 255, 255, 0.7)",
      }),
    });
    this.comboLabel.anchor.set(0.5, 0);
    this.comboLabel.visible = false;
    this.addChild(this.comboLabel);

    // Chart name (bottom-left)
    this.chartNameText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "sans-serif",
        fontSize: 10,
        fill: "rgba(255, 255, 255, 0.5)",
      }),
    });
    this.chartNameText.anchor.set(0, 1); // left-aligned, bottom
    this.addChild(this.chartNameText);

    // Chart level (bottom-right)
    this.chartLevelText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "sans-serif",
        fontSize: 10,
        fill: "rgba(255, 255, 255, 0.5)",
      }),
    });
    this.chartLevelText.anchor.set(1, 1); // right-aligned, bottom
    this.addChild(this.chartLevelText);
  }

  /**
   * Update HUD values and positions for the current frame.
   */
  update(
    combo: number,
    totalNotes: number,
    chartName: string,
    chartLevel: string,
    canvasWidth: number,
    canvasHeight: number,
    showHud: boolean,
  ): void {
    this.visible = showHud;
    if (!showHud) return;

    const score = totalNotes > 0 ? Math.round(1000000 * combo / totalNotes) : 0;

    // Score (top-right)
    this.scoreText.text = score.toString().padStart(7, "0");
    this.scoreText.position.set(canvasWidth - 12, 10);

    // Combo (center-top, only when >= 3)
    if (combo >= 3) {
      this.comboNumber.visible = true;
      this.comboLabel.visible = true;
      this.comboNumber.text = combo.toString();
      this.comboNumber.position.set(canvasWidth / 2, 10);
      this.comboLabel.position.set(canvasWidth / 2, 42);
    } else {
      this.comboNumber.visible = false;
      this.comboLabel.visible = false;
    }

    // Chart name (bottom-left)
    if (chartName) {
      this.chartNameText.visible = true;
      this.chartNameText.text = chartName;
      this.chartNameText.position.set(10, canvasHeight - 6);
    } else {
      this.chartNameText.visible = false;
    }

    // Chart level (bottom-right)
    if (chartLevel) {
      this.chartLevelText.visible = true;
      this.chartLevelText.text = chartLevel;
      this.chartLevelText.position.set(canvasWidth - 10, canvasHeight - 6);
    } else {
      this.chartLevelText.visible = false;
    }
  }
}
