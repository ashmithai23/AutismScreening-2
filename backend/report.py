"""
report.py - DSM-5 Aligned PDF Report Generator
================================================
Generates a professional, graph-rich PDF screening report using matplotlib.
The PDF is returned as bytes and sent to the frontend for download.

Sections:
  1. Cover Page
  2. Child Details
  3. DSM-5 Classification & Risk Score (gauge chart)
  4. Domain Analysis (bar chart + radar chart)
  5. Item-Level Heatmap
  6. ML Model Transparency (horizontal bar chart)
  7. Clinical Recommendations
  8. Progress Comparison (line chart, if available)
  9. Model Validation Summary
  10. Disclaimer
"""

import io
import base64
from datetime import datetime
from typing import Optional

import matplotlib
matplotlib.use("Agg")   # non-interactive backend - safe for servers
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import numpy as np

from backend.scorer import ScoringResult
from backend.questions import DOMAIN_SOCIAL, DOMAIN_COMMUNICATION, DOMAIN_BEHAVIORAL

# ── Colour palette ────────────────────────────────────────────────────────────
C = {
    "primary":   "#1d4ed8",
    "low":       "#10b981",
    "moderate":  "#3b82f6",
    "high":      "#f59e0b",
    "very_high": "#ef4444",
    "bg":        "#f8fafc",
    "card":      "#ffffff",
    "text":      "#1e293b",
    "muted":     "#64748b",
    "border":    "#e2e8f0",
    "social":    "#3b82f6",
    "comm":      "#10b981",
    "behav":     "#f59e0b",
}

RISK_COLORS = {
    "Low":       C["low"],
    "Moderate":  C["moderate"],
    "High":      C["high"],
    "Very High": C["very_high"],
}

DOMAIN_COLORS = {
    DOMAIN_SOCIAL:        C["social"],
    DOMAIN_COMMUNICATION: C["comm"],
    DOMAIN_BEHAVIORAL:    C["behav"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def _risk_color(risk_level: str) -> str:
    return RISK_COLORS.get(risk_level, C["primary"])


def _dsm5_label(risk_level: str) -> str:
    return {
        "Low":       "No Significant ASD Traits Detected",
        "Moderate":  "Level 1 - Requiring Support",
        "High":      "Level 2 - Requiring Substantial Support",
        "Very High": "Level 3 - Requiring Very Substantial Support",
    }.get(risk_level, risk_level)


# ── Chart builders ────────────────────────────────────────────────────────────

def _build_gauge(score: float, risk_level: str) -> str:
    """Semi-circular gauge showing overall risk score."""
    fig, ax = plt.subplots(figsize=(5, 3), facecolor="white")
    ax.set_aspect("equal")
    ax.axis("off")

    # Background arc segments
    segments = [
        (0,   30,  C["low"],       "Low"),
        (30,  55,  C["moderate"],  "Moderate"),
        (55,  75,  C["high"],      "High"),
        (75,  100, C["very_high"], "Very High"),
    ]
    theta_start = 180
    theta_range = 180

    for lo, hi, color, label in segments:
        t1 = theta_start - (lo  / 100) * theta_range
        t2 = theta_start - (hi  / 100) * theta_range
        theta = np.linspace(np.radians(t2), np.radians(t1), 100)
        r_outer, r_inner = 1.0, 0.65
        x_outer = r_outer * np.cos(theta)
        y_outer = r_outer * np.sin(theta)
        x_inner = r_inner * np.cos(theta[::-1])
        y_inner = r_inner * np.sin(theta[::-1])
        ax.fill(
            np.concatenate([x_outer, x_inner]),
            np.concatenate([y_outer, y_inner]),
            color=color, alpha=0.85, linewidth=0
        )

    # Needle
    needle_angle = theta_start - (score / 100) * theta_range
    needle_rad   = np.radians(needle_angle)
    ax.annotate(
        "", xy=(0.82 * np.cos(needle_rad), 0.82 * np.sin(needle_rad)),
        xytext=(0, 0),
        arrowprops=dict(arrowstyle="-|>", color=C["text"],
                        lw=2.5, mutation_scale=18),
    )
    ax.add_patch(plt.Circle((0, 0), 0.07, color=C["text"], zorder=5))

    # Score text
    ax.text(0, -0.18, f"{score:.1f}", ha="center", va="center",
            fontsize=28, fontweight="bold", color=C["text"])
    ax.text(0, -0.35, "/ 100", ha="center", va="center",
            fontsize=11, color=C["muted"])
    ax.text(0, -0.52, _dsm5_label(risk_level), ha="center", va="center",
            fontsize=8, color=_risk_color(risk_level), fontweight="bold")

    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-0.65, 1.1)
    return _fig_to_base64(fig)


def _build_domain_bars(domain_scores: dict) -> str:
    """Horizontal bar chart for domain scores."""
    domains = [DOMAIN_SOCIAL, DOMAIN_COMMUNICATION, DOMAIN_BEHAVIORAL]
    labels  = ["Social\nInteraction", "Communication", "Behavioral\nPatterns"]
    values  = [domain_scores.get(d).percentage if domain_scores.get(d) else 0 for d in domains]
    colors  = [DOMAIN_COLORS[d] for d in domains]

    fig, ax = plt.subplots(figsize=(6, 2.8), facecolor="white")
    bars = ax.barh(labels, values, color=colors, height=0.5, alpha=0.88)

    # Value labels
    for bar, val in zip(bars, values):
        ax.text(val + 1, bar.get_y() + bar.get_height() / 2,
                f"{val:.1f}%", va="center", fontsize=9,
                fontweight="bold", color=C["text"])

    # Threshold lines
    for x, label, color in [(30, "Low/Mod", C["moderate"]),
                             (55, "Mod/High", C["high"]),
                             (75, "High/VH", C["very_high"])]:
        ax.axvline(x, color=color, linewidth=1, linestyle="--", alpha=0.6)
        ax.text(x + 0.5, 2.42, label, fontsize=6.5, color=color, va="bottom")

    ax.set_xlim(0, 110)
    ax.set_xlabel("Risk Score (%)", fontsize=9, color=C["muted"])
    ax.tick_params(axis="y", labelsize=9)
    ax.tick_params(axis="x", labelsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_facecolor("white")
    fig.tight_layout()
    return _fig_to_base64(fig)


def _build_radar(domain_scores: dict) -> str:
    """Radar / spider chart for domain scores."""
    domains = [DOMAIN_SOCIAL, DOMAIN_COMMUNICATION, DOMAIN_BEHAVIORAL]
    labels  = ["Social\nInteraction", "Communication", "Behavioral\nPatterns"]
    values  = [domain_scores.get(d).percentage if domain_scores.get(d) else 0 for d in domains]
    values += values[:1]   # close the polygon

    angles = np.linspace(0, 2 * np.pi, len(labels), endpoint=False).tolist()
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(3.5, 3.5),
                           subplot_kw={"polar": True}, facecolor="white")
    ax.set_facecolor("white")

    # Fill
    ax.fill(angles, values, alpha=0.25, color=C["primary"])
    ax.plot(angles, values, "o-", linewidth=2, color=C["primary"], markersize=5)

    # Reference circles
    for r, alpha in [(25, 0.12), (50, 0.10), (75, 0.08), (100, 0.06)]:
        ax.plot(angles, [r] * len(angles), "--", color=C["muted"],
                linewidth=0.6, alpha=alpha * 3)

    ax.set_thetagrids(np.degrees(angles[:-1]), labels, fontsize=8.5)
    ax.set_ylim(0, 100)
    ax.set_yticks([25, 50, 75, 100])
    ax.set_yticklabels(["25", "50", "75", "100"], fontsize=7, color=C["muted"])
    ax.tick_params(axis="x", pad=6)
    ax.spines["polar"].set_visible(False)
    fig.tight_layout()
    return _fig_to_base64(fig)


def _build_item_heatmap(item_scores: dict, all_questions: dict) -> str:
    """Grid heatmap of A1–A10 item scores."""
    base_ids = [f"A{i}" for i in range(1, 11)]
    labels, values = [], []
    for qid in base_ids:
        q = all_questions.get(qid)
        if q:
            labels.append(qid)
            values.append(item_scores.get(qid, 0))

    n = len(labels)
    cols = 5
    rows = (n + cols - 1) // cols
    grid = np.full((rows, cols), np.nan)
    for i, v in enumerate(values):
        grid[i // cols, i % cols] = v

    fig, ax = plt.subplots(figsize=(5, 2.2), facecolor="white")
    cmap = matplotlib.colors.ListedColormap([C["low"], C["very_high"]])
    norm = matplotlib.colors.BoundaryNorm([0, 0.5, 1], cmap.N)

    im = ax.imshow(grid, cmap=cmap, norm=norm, aspect="auto")

    for i, (label, val) in enumerate(zip(labels, values)):
        r, c = divmod(i, cols)
        ax.text(c, r, label, ha="center", va="center",
                fontsize=10, fontweight="bold", color="white")
        indicator = "✗" if val == 1 else "✓"
        ax.text(c, r + 0.32, indicator, ha="center", va="center",
                fontsize=8, color="white")

    ax.set_xticks([])
    ax.set_yticks([])
    ax.spines[:].set_visible(False)

    # Legend
    legend_elements = [
        mpatches.Patch(color=C["low"],       label="No risk (0)"),
        mpatches.Patch(color=C["very_high"], label="Risk indicator (1)"),
    ]
    ax.legend(handles=legend_elements, loc="lower center",
              bbox_to_anchor=(0.5, -0.28), ncol=2, fontsize=8,
              frameon=False)
    fig.tight_layout()
    return _fig_to_base64(fig)


def _build_model_bars(rf_prob: Optional[float],
                      lr_prob: Optional[float],
                      ensemble_prob: Optional[float]) -> str:
    """Horizontal bar chart for ML model probabilities."""
    labels, values, colors = [], [], []
    if rf_prob is not None:
        labels.append("Random Forest\n(weight: 60%)")
        values.append(rf_prob * 100)
        colors.append(C["moderate"])
    if lr_prob is not None:
        labels.append("Logistic Regression\n(weight: 40%)")
        values.append(lr_prob * 100)
        colors.append("#8b5cf6")
    if ensemble_prob is not None:
        labels.append("Ensemble\n(Final)")
        values.append(ensemble_prob * 100)
        colors.append(C["primary"])

    if not labels:
        return ""

    fig, ax = plt.subplots(figsize=(5, 1.8 + 0.5 * len(labels)), facecolor="white")
    bars = ax.barh(labels, values, color=colors, height=0.45, alpha=0.88)

    ax.axvline(50, color=C["very_high"], linewidth=1.2,
               linestyle="--", alpha=0.7, label="50% threshold")
    ax.text(51, len(labels) - 0.55, "Decision\nthreshold", fontsize=7,
            color=C["very_high"], va="top")

    for bar, val in zip(bars, values):
        ax.text(val + 0.5, bar.get_y() + bar.get_height() / 2,
                f"{val:.1f}%", va="center", fontsize=9,
                fontweight="bold", color=C["text"])

    ax.set_xlim(0, 115)
    ax.set_xlabel("P(ASD Traits) %", fontsize=9, color=C["muted"])
    ax.tick_params(axis="y", labelsize=8.5)
    ax.tick_params(axis="x", labelsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_facecolor("white")
    fig.tight_layout()
    return _fig_to_base64(fig)


def _build_comparison_chart(previous_score: float, current_score: float,
                             previous_date: str) -> str:
    """Simple line chart comparing previous vs current score."""
    fig, ax = plt.subplots(figsize=(5, 2.5), facecolor="white")

    x     = [0, 1]
    y     = [previous_score, current_score]
    color = C["low"] if current_score < previous_score else C["very_high"]

    ax.plot(x, y, "o-", color=color, linewidth=2.5, markersize=9,
            markerfacecolor="white", markeredgewidth=2.5)
    ax.fill_between(x, y, alpha=0.12, color=color)

    # Threshold bands
    for threshold, label, col in [
        (30, "Moderate", C["moderate"]),
        (55, "High", C["high"]),
        (75, "Very High", C["very_high"]),
    ]:
        ax.axhline(threshold, color=col, linewidth=0.8,
                   linestyle="--", alpha=0.5)
        ax.text(1.02, threshold, label, fontsize=7, color=col, va="center")

    for xi, yi, label in [
        (0, previous_score, f"Previous\n{previous_score:.1f}"),
        (1, current_score,  f"Current\n{current_score:.1f}"),
    ]:
        ax.annotate(label, (xi, yi), textcoords="offset points",
                    xytext=(0, 14), ha="center", fontsize=9,
                    fontweight="bold", color=C["text"])

    ax.set_xticks([0, 1])
    ax.set_xticklabels([previous_date, "Today"], fontsize=9)
    ax.set_ylim(0, 105)
    ax.set_ylabel("Risk Score", fontsize=9, color=C["muted"])
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_facecolor("white")
    fig.tight_layout()
    return _fig_to_base64(fig)


# ── Main report generator ─────────────────────────────────────────────────────

def generate_report(
    child_name: str,
    age_months: int,
    gender: str,
    ethnicity: str,
    jaundice: bool,
    family_asd: bool,
    completed_by: str,
    result: ScoringResult,
    recommendations: dict,
    comparison: Optional[dict] = None,
    model_accuracy:   float = 0.9567,
    model_precision:  float = 0.96,
    model_recall:     float = 0.96,
    model_f1:         float = 0.96,
) -> str:
    """
    Returns an HTML string that, when printed via browser,
    produces a DSM-5 aligned PDF with embedded charts.
    """
    from backend.questions import ALL_QUESTIONS

    now        = datetime.now().strftime("%d %B %Y")
    report_id  = f"SCR-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    gender_lbl = {"m": "Male", "f": "Female"}.get(gender.lower(), gender)
    age_fmt    = f"{age_months} months ({age_months // 12}y {age_months % 12}m)"
    rc         = _risk_color(result.risk_level)
    dsm5_lbl   = _dsm5_label(result.risk_level)

    # ── Generate charts ───────────────────────────────────────────────────────
    gauge_b64       = _build_gauge(result.overall_score, result.risk_level)
    domain_bar_b64  = _build_domain_bars(result.domain_scores)
    radar_b64       = _build_radar(result.domain_scores)
    heatmap_b64     = _build_item_heatmap(result.item_scores, ALL_QUESTIONS)
    model_bar_b64   = _build_model_bars(
        result.rf_probability,
        result.lr_probability,
        (0.6 * (result.rf_probability or 0) + 0.4 * (result.lr_probability or 0))
        if result.rf_probability is not None else None,
    )
    comparison_b64  = ""
    if comparison:
        comparison_b64 = _build_comparison_chart(
            comparison["previous_score"],
            result.overall_score,
            comparison.get("previous_date", "Previous"),
        )

    # ── Recommendations HTML ──────────────────────────────────────────────────
    primary_html = "".join(
        f'<li class="rec-item"><span class="rec-num">{i+1}</span>{r}</li>'
        for i, r in enumerate(recommendations.get("primary", []))
    )

    domain_recs_html = ""
    for rec in recommendations.get("domain_specific", []):
        import re
        match = re.match(r"^\[(.+?)\]\s*(.*)", rec)
        domain_tag = match.group(1) if match else ""
        content    = match.group(2) if match else rec
        domain_recs_html += f'''
        <div class="domain-rec">
          {f'<span class="domain-tag">{domain_tag}</span>' if domain_tag else ""}
          <span>{content}</span>
        </div>'''

    # ── Comparison section ────────────────────────────────────────────────────
    comparison_section = ""
    if comparison and comparison_b64:
        delta  = comparison["score_change"]
        arrow  = "↑" if delta > 0 else "↓" if delta < 0 else "→"
        col    = C["very_high"] if delta > 0 else C["low"] if delta < 0 else C["muted"]
        comparison_section = f"""
        <section>
          <h2>8. Progress Since Last Screening</h2>
          <div class="two-col">
            <div>
              <table class="data-table">
                <tr><th>Metric</th><th>Previous</th><th>Current</th><th>Change</th></tr>
                <tr>
                  <td>Overall Score</td>
                  <td>{comparison['previous_score']:.1f}</td>
                  <td>{result.overall_score:.1f}</td>
                  <td style="color:{col};font-weight:700">{arrow} {abs(delta):.1f}</td>
                </tr>
                <tr>
                  <td>Risk Level</td>
                  <td>{comparison['previous_risk']}</td>
                  <td>{result.risk_level}</td>
                  <td>{comparison['direction'].capitalize()}</td>
                </tr>
              </table>
              {f'<p class="note">{recommendations.get("trend_note","")}</p>' if recommendations.get("trend_note") else ""}
            </div>
            <div class="chart-box">
              <img src="data:image/png;base64,{comparison_b64}" style="width:100%"/>
              <p class="chart-caption">Score trajectory over screenings</p>
            </div>
          </div>
        </section>"""

    rec_sec = 8 if not comparison else 9
    val_sec = rec_sec + 1

    # ── Full HTML ─────────────────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ASD Screening Report - {child_name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    color: {C["text"]};
    background: white;
    padding: 32px 40px;
    line-height: 1.6;
  }}

  /* ── Cover ── */
  .cover {{
    background: linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%);
    border-radius: 16px;
    padding: 36px 40px;
    color: white;
    margin-bottom: 28px;
    page-break-after: always;
  }}
  .cover-sub   {{ font-size: 10px; letter-spacing: .12em; text-transform: uppercase; opacity: .7; margin-bottom: 8px; }}
  .cover h1    {{ font-size: 26px; font-weight: 800; margin-bottom: 6px; }}
  .cover-meta  {{ opacity: .8; font-size: 12px; margin-bottom: 16px; }}
  .risk-badge  {{
    display: inline-block;
    padding: 8px 22px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 14px;
    background: rgba(255,255,255,.2);
    border: 2px solid rgba(255,255,255,.45);
    color: white;
    margin: 8px 0;
  }}
  .report-id {{ font-size: 10px; opacity: .5; margin-top: 10px; font-family: monospace; }}

  /* ── Sections ── */
  section {{ margin-bottom: 26px; page-break-inside: avoid; }}
  h2 {{
    font-size: 13px; font-weight: 700; color: {C["primary"]};
    text-transform: uppercase; letter-spacing: .06em;
    border-bottom: 2px solid {C["border"]};
    padding-bottom: 5px; margin-bottom: 14px;
  }}
  h3 {{ font-size: 12px; font-weight: 600; color: {C["text"]}; margin: 12px 0 6px; }}

  /* ── Info grid ── */
  .info-grid {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;
  }}
  .info-cell {{
    background: {C["bg"]}; border: 1px solid {C["border"]};
    border-radius: 8px; padding: 9px 12px;
  }}
  .info-cell .lbl {{ font-size: 9.5px; color: {C["muted"]}; text-transform: uppercase; letter-spacing: .04em; }}
  .info-cell .val {{ font-size: 12px; font-weight: 600; }}

  /* ── Risk level box ── */
  .risk-box {{
    border-radius: 12px; padding: 14px 18px;
    border: 2px solid; margin-bottom: 14px;
  }}
  .risk-box h3 {{ margin-top: 0; font-size: 15px; }}

  /* ── DSM-5 table ── */
  .dsm5-table {{ width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }}
  .dsm5-table th, .dsm5-table td {{ padding: 7px 10px; border: 1px solid {C["border"]}; }}
  .dsm5-table th {{ background: {C["bg"]}; font-weight: 600; color: {C["muted"]}; }}
  .dsm5-table .active {{ font-weight: 700; }}

  /* ── Data table ── */
  .data-table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
  .data-table th, .data-table td {{ padding: 7px 10px; border: 1px solid {C["border"]}; }}
  .data-table th {{ background: {C["bg"]}; font-weight: 600; color: {C["muted"]}; }}
  .data-table tr:nth-child(even) {{ background: {C["bg"]}; }}

  /* ── Two column layout ── */
  .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }}
  .three-col {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }}

  /* ── Chart boxes ── */
  .chart-box {{ text-align: center; }}
  .chart-caption {{
    font-size: 9.5px; color: {C["muted"]}; margin-top: 4px; font-style: italic;
  }}

  /* ── Recommendations ── */
  .rec-list {{ list-style: none; padding: 0; }}
  .rec-item {{
    display: flex; gap: 10px; align-items: flex-start;
    padding: 8px 10px; background: {C["bg"]};
    border-left: 3px solid {C["primary"]};
    border-radius: 0 6px 6px 0;
    margin-bottom: 6px; font-size: 11px;
  }}
  .rec-num {{
    min-width: 20px; height: 20px; border-radius: 50%;
    background: {C["primary"]}; color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; flex-shrink: 0;
  }}
  .domain-rec {{
    display: flex; gap: 8px; align-items: flex-start;
    padding: 7px 10px; border: 1px solid {C["border"]};
    border-radius: 6px; margin-bottom: 5px;
    font-size: 11px; background: white;
  }}
  .domain-tag {{
    font-size: 9px; font-weight: 700; color: {C["primary"]};
    text-transform: uppercase; letter-spacing: .04em;
    background: #dbeafe; padding: 2px 6px; border-radius: 4px;
    white-space: nowrap; flex-shrink: 0;
  }}

  /* ── Note box ── */
  .note {{
    background: #fef3c7; border: 1px solid #fde68a;
    border-radius: 8px; padding: 9px 12px;
    font-size: 11px; color: #92400e; margin-top: 8px;
  }}
  .note-blue {{
    background: #dbeafe; border: 1px solid #bfdbfe;
    border-radius: 8px; padding: 9px 12px;
    font-size: 11px; color: #1d4ed8; margin-top: 8px;
  }}

  /* ── Stat cards ── */
  .stat-card {{
    background: {C["bg"]}; border: 1px solid {C["border"]};
    border-radius: 10px; padding: 12px; text-align: center;
  }}
  .stat-val {{ font-size: 22px; font-weight: 800; color: {C["primary"]}; }}
  .stat-lbl {{ font-size: 9.5px; color: {C["muted"]}; margin-top: 2px; }}

  /* ── Disclaimer ── */
  .disclaimer {{
    background: {C["bg"]}; border: 1px solid {C["border"]};
    border-radius: 10px; padding: 14px 16px;
    margin-top: 24px; font-size: 10.5px; color: {C["muted"]}; line-height: 1.75;
  }}
  .disclaimer strong {{ color: {C["text"]}; }}

  @media print {{
    body {{ padding: 16px 20px; }}
    .cover {{ page-break-after: always; }}
    section {{ page-break-inside: avoid; }}
  }}
</style>
</head>
<body>

<!-- ══ COVER ══════════════════════════════════════════════════════════════ -->
<div class="cover">
  <p class="cover-sub">ASD Early Screening System · Confidential</p>
  <h1>Developmental Screening Report</h1>
  <p class="cover-meta">{child_name} &nbsp;·&nbsp; {age_fmt} &nbsp;·&nbsp; {gender_lbl}</p>
  <div class="risk-badge">{dsm5_lbl}</div>
  <p style="font-size:18px;font-weight:800;margin-top:6px">
    {f"Risk Score: {result.overall_score:.1f} / 100" if result.overall_score else ""}
  </p>
  <p class="report-id">Report ID: {report_id} &nbsp;·&nbsp; Generated: {now}</p>
</div>

<!-- ══ SECTION 1: CHILD DETAILS ══════════════════════════════════════════ -->
<section>
  <h2>1. Child Details</h2>
  <div class="info-grid">
    <div class="info-cell"><div class="lbl">Name</div><div class="val">{child_name}</div></div>
    <div class="info-cell"><div class="lbl">Age</div><div class="val">{age_fmt}</div></div>
    <div class="info-cell"><div class="lbl">Sex</div><div class="val">{gender_lbl}</div></div>
    <div class="info-cell"><div class="lbl">Ethnicity</div><div class="val">{ethnicity or "Not specified"}</div></div>
    <div class="info-cell"><div class="lbl">Neonatal Jaundice</div><div class="val">{"⚠ Yes" if jaundice else "✓ No"}</div></div>
    <div class="info-cell"><div class="lbl">Family ASD History</div><div class="val">{"⚠ Yes" if family_asd else "✓ No"}</div></div>
    <div class="info-cell" style="grid-column:span 2">
      <div class="lbl">Assessment Completed By</div>
      <div class="val">{completed_by}</div>
    </div>
  </div>
</section>

<!-- ══ SECTION 2: DSM-5 CLASSIFICATION ══════════════════════════════════ -->
<section>
  <h2>2. DSM-5 Classification &amp; Risk Score</h2>
  <div class="two-col">
    <div>
      <div class="risk-box" style="border-color:{rc}; background:{rc}10">
        <h3 style="color:{rc}">{dsm5_lbl}</h3>
        <p style="font-size:11px; color:{C["muted"]}">{
            {
                "Low":       "Responses do not indicate significant ASD-related traits at this time. Continue regular developmental monitoring.",
                "Moderate":  "DSM-5 Level 1: Without supports in place, deficits in social communication cause noticeable impairments. Inflexibility of behaviour causes significant interference in one or more contexts.",
                "High":      "DSM-5 Level 2: Marked deficits in verbal and nonverbal social communication skills; social impairments apparent even with supports in place. Limited initiation of social interactions.",
                "Very High": "DSM-5 Level 3: Severe deficits in verbal and nonverbal social communication skills cause severe impairments in functioning. Very limited initiation of social interactions and minimal response to others.",
            }.get(result.risk_level, "")
        }</p>
        {"<p class='note'>⚠ Borderline Result: " + result.borderline_note + "</p>" if result.is_borderline else ""}
        {"<p class='note-blue'>ℹ Age Adjustment Applied: " + result.age_adjustment_note + "</p>" if result.age_adjustment_applied else ""}
      </div>

      <!-- DSM-5 Reference Scale -->
      <table class="dsm5-table">
        <tr><th>DSM-5 Level</th><th>Score</th><th>Support Need</th></tr>
        <tr {"class='active' style='background:#d1fae5'" if result.risk_level=="Low" else ""}>
          <td>No Significant Traits</td><td>0 – 29</td><td>-</td>
        </tr>
        <tr {"class='active' style='background:#dbeafe'" if result.risk_level=="Moderate" else ""}>
          <td>Level 1</td><td>30 – 54</td><td>Requiring Support</td>
        </tr>
        <tr {"class='active' style='background:#fef3c7'" if result.risk_level=="High" else ""}>
          <td>Level 2</td><td>55 – 74</td><td>Requiring Substantial Support</td>
        </tr>
        <tr {"class='active' style='background:#fee2e2'" if result.risk_level=="Very High" else ""}>
          <td>Level 3</td><td>75 – 100</td><td>Requiring Very Substantial Support</td>
        </tr>
      </table>
    </div>

    <!-- Gauge Chart -->
    <div class="chart-box">
      <img src="data:image/png;base64,{gauge_b64}" style="width:100%; max-width:280px"/>
      <p class="chart-caption">Overall risk score gauge</p>
    </div>
  </div>
</section>

<!-- ══ SECTION 3: DOMAIN ANALYSIS ════════════════════════════════════════ -->
<section>
  <h2>3. Domain Analysis</h2>
  <div class="two-col">
    <div>
      <img src="data:image/png;base64,{domain_bar_b64}" style="width:100%"/>
      <p class="chart-caption">Domain risk scores with DSM-5 thresholds</p>
    </div>
    <div>
      <img src="data:image/png;base64,{radar_b64}" style="width:100%"/>
      <p class="chart-caption">Domain profile radar chart</p>
    </div>
  </div>

  <!-- Domain detail rows -->
  <table class="data-table" style="margin-top:12px">
    <tr><th>Domain</th><th>Score</th><th>Items</th><th>Flagged Items</th><th>Interpretation</th></tr>
    {"".join(
    f"<tr><td><strong>{d}</strong></td>"
    f"<td style='font-weight:700;color:{DOMAIN_COLORS.get(d, C['primary'])}'>{ds.percentage:.1f}%</td>"
    f"<td>{ds.item_count}</td>"
    f"<td>{'⚠ ' + ', '.join(ds.flag_items) if ds.flag_items else '✓ None'}</td>"
    f"<td>{'Within typical range' if ds.percentage < 30 else 'Mild concerns' if ds.percentage < 55 else 'Moderate concerns' if ds.percentage < 75 else 'Significant concerns'}</td></tr>"
    for d, ds in result.domain_scores.items()
)}
  </table>
</section>

<!-- ══ SECTION 4: ITEM-LEVEL HEATMAP ════════════════════════════════════ -->
<section>
  <h2>4. Q-Chat-10 Item Responses</h2>
  <div class="two-col">
    <div class="chart-box">
      <img src="data:image/png;base64,{heatmap_b64}" style="width:100%"/>
      <p class="chart-caption">Green = no risk indicator · Red = risk indicator</p>
    </div>
    <div>
      <table class="data-table">
        <tr><th>Item</th><th>Domain</th><th>Flag</th></tr>
        {"".join(
    f"<tr>"
    f"<td><strong>{qid}</strong></td>"
    f"<td style='font-size:10px'>{ALL_QUESTIONS[qid].domain if ALL_QUESTIONS.get(qid) else ''}</td>"
    f"<td style='color:{C['very_high'] if v==1 else C['low']};font-weight:700'>"
    f"{'⚠ Risk' if v==1 else '✓ OK'}</td>"
    f"</tr>"
    for qid, v in sorted(result.item_scores.items())
    if qid.startswith("A") and len(qid) <= 3
)}
      </table>
    </div>
  </div>
</section>

<!-- ══ SECTION 5: RISK FACTORS ══════════════════════════════════════════ -->
<section>
  <h2>5. Clinical Risk Factors</h2>
  <div class="two-col">
    <div class="info-cell" style="{'background:#fef3c7;border-color:#fde68a' if jaundice else ''}">
      <div class="lbl">Neonatal Jaundice</div>
      <div class="val">{"⚠ Present - associated with increased ASD risk in literature" if jaundice else "✓ Not Present"}</div>
    </div>
    <div class="info-cell" style="{'background:#fef3c7;border-color:#fde68a' if family_asd else ''}">
      <div class="lbl">Family ASD History</div>
      <div class="val">{"⚠ Present - heritability of ASD estimated at 64–91%" if family_asd else "✓ Not Present"}</div>
    </div>
  </div>
</section>

<!-- ══ SECTION 6: ML MODEL TRANSPARENCY ═════════════════════════════════ -->
<section>
  <h2>6. AI Model Transparency</h2>
  {"<div class='two-col'><div>" if model_bar_b64 else ""}
  {"<p>ML models not available - Q-Chat-10 rule-based scoring used.</p>" if not result.rf_probability else ""}
  {f'''
  <table class="data-table">
    <tr><th>Model</th><th>P(ASD Traits)</th><th>Prediction</th><th>Weight</th></tr>
    <tr>
      <td>Random Forest</td>
      <td style="font-weight:700">{result.rf_probability*100:.1f}%</td>
      <td>{"ASD Traits" if result.rf_prediction==1 else "No ASD Traits"}</td>
      <td>60%</td>
    </tr>
    {"" if result.lr_probability is None else f"""
    <tr>
      <td>Logistic Regression</td>
      <td style='font-weight:700'>{result.lr_probability*100:.1f}%</td>
      <td>{'ASD Traits' if result.lr_prediction==1 else 'No ASD Traits'}</td>
      <td>40%</td>
    </tr>"""}
    <tr style="font-weight:700;background:{C["bg"]}">
      <td>Ensemble Decision</td>
      <td>{((0.6*(result.rf_probability or 0)+0.4*(result.lr_probability or 0))*100):.1f}%</td>
      <td colspan="2">{result.final_decision_basis}</td>
    </tr>
  </table>
  ''' if result.rf_probability else ""}
  {"</div><div class='chart-box'>" if model_bar_b64 else ""}
  {f'<img src="data:image/png;base64,{model_bar_b64}" style="width:100%"/><p class="chart-caption">Model probability comparison</p>' if model_bar_b64 else ""}
  {"</div></div>" if model_bar_b64 else ""}
  <p style="font-size:10.5px;color:{C['muted']};margin-top:8px">
    Model trained on Q-Chat-10 dataset (n=1,054, post-deduplication: 975).
    SMOTE applied for class balancing. Test accuracy: 95.67%. Precision/Recall/F1: 96%.
  </p>
</section>

<!-- ══ SECTION 7: COMPARISON (conditional) ══════════════════════════════ -->
{comparison_section}

<!-- ══ SECTION 8/9: RECOMMENDATIONS ════════════════════════════════════ -->
<section>
  <h2>{rec_sec}. Clinical Recommendations</h2>

  {f'<p class="note-blue" style="margin-bottom:12px">👶 <strong>Age Note ({age_months}m):</strong> {recommendations.get("age_note","")}</p>' if recommendations.get("age_note") else ""}

  <h3>Primary Actions</h3>
  <ul class="rec-list">{primary_html}</ul>

  {f"<h3>Domain-Specific Guidance</h3>{domain_recs_html}" if domain_recs_html else ""}

  {f'<p class="note">{recommendations.get("borderline_note","")}</p>' if recommendations.get("borderline_note") else ""}
  {f'<p class="note">{recommendations.get("trend_note","")}</p>' if recommendations.get("trend_note") else ""}

  {f'<p class="note-blue" style="margin-top:10px">📅 <strong>{recommendations.get("monitoring_interval","")}</strong></p>' if recommendations.get("monitoring_interval") else ""}
</section>

<!-- ══ SECTION 9/10: MODEL VALIDATION ══════════════════════════════════ -->
<section>
  <h2>{val_sec}. Model Validation Summary</h2>
  <div class="three-col" style="margin-bottom:12px">
    <div class="stat-card"><div class="stat-val">{model_accuracy*100:.1f}%</div><div class="stat-lbl">Accuracy</div></div>
    <div class="stat-card"><div class="stat-val">{model_precision*100:.1f}%</div><div class="stat-lbl">Precision</div></div>
    <div class="stat-card"><div class="stat-val">{model_f1*100:.1f}%</div><div class="stat-lbl">F1 Score</div></div>
  </div>
  <table class="data-table">
    <tr><th>Parameter</th><th>Detail</th></tr>
    <tr><td>Dataset</td><td>Q-Chat-10 Toddler Autism Screening - 1,054 records</td></tr>
    <tr><td>After Preprocessing</td><td>975 records (79 duplicates removed)</td></tr>
    <tr><td>Class Balancing</td><td>SMOTE applied - minority class augmented to 691 samples</td></tr>
    <tr><td>Model Architecture</td><td>Random Forest (200 trees) + Logistic Regression ensemble</td></tr>
    <tr><td>Train / Test Split</td><td>80% / 20% stratified split</td></tr>
    <tr><td>Test Set Size</td><td>277 samples (139 No ASD, 138 ASD)</td></tr>
    <tr><td>Recall (ASD class)</td><td>{model_recall*100:.1f}%</td></tr>
  </table>
</section>

<!-- ══ DISCLAIMER ═══════════════════════════════════════════════════════ -->
<div class="disclaimer">
  <strong>IMPORTANT DISCLAIMER</strong><br/>
  This report is generated by an automated early screening tool using the validated Q-Chat-10 questionnaire
  and machine learning analysis. It is <strong>NOT a clinical diagnosis</strong> and must not be treated as one.
  The DSM-5 level classifications shown are indicative only and must be confirmed through a comprehensive
  evaluation by a qualified developmental paediatrician, child psychologist, or multidisciplinary ASD
  assessment team. Early identification leads to significantly better outcomes - please seek professional
  evaluation regardless of the score if you have concerns.<br/><br/>
  <strong>References:</strong> American Psychiatric Association. (2013). <em>Diagnostic and Statistical Manual
  of Mental Disorders</em> (5th ed.). &nbsp;·&nbsp; Allison, C. et al. (2012). Toward Brief "Red Flags" for
  Autism Screening: The Short Autism Spectrum Quotient and the Short Quantitative Checklist in 1,000 Cases.
  <em>Journal of Autism and Developmental Disorders</em>.
</div>

</body>
</html>"""

    return html