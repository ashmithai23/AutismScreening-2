import { useState, useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ChildInfo, ScreeningResult } from "@/lib/screening-data";
import type { BackendResult } from "@/pages/Index";
import {
  ShieldCheck, AlertTriangle, AlertCircle, Info,
  Brain, MessageSquare, Activity, Download, RotateCcw,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  CheckCircle2, Calendar, Sparkles, Target,
  Lightbulb, Gauge, CircleCheck, CircleX,
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  RadialBarChart, RadialBar, Cell,
} from "recharts";

interface ResultStepProps {
  backendResult: BackendResult | null;
  fallbackResult: ScreeningResult | null;
  childInfo: ChildInfo;
  onRestart: () => void;
  onDownload: (blob: Blob) => void;
}

// ── DSM-5 Level mapping ───────────────────────────────────────────────────────
// Maps backend risk_level → DSM-5 support level label
const DSM5_MAP: Record<string, {
  level: string;
  shortLabel: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  badge: string;
  barColor: string;
  icon: React.ElementType;
  gradient: string;
}> = {
  Low: {
    level: "No ASD Traits Detected",
    shortLabel: "No Significant Traits",
    desc: "Responses do not indicate significant ASD-related traits at this time.",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    barColor: "#10b981",
    icon: ShieldCheck,
    gradient: "from-emerald-500 to-teal-500",
  },
  Moderate: {
    level: "Level 1 — Requiring Support",
    shortLabel: "Level 1",
    desc: "DSM-5 Level 1: Without supports in place, deficits in social communication cause noticeable impairments.",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    barColor: "#3b82f6",
    icon: Info,
    gradient: "from-blue-500 to-indigo-500",
  },
  High: {
    level: "Level 2 — Requiring Substantial Support",
    shortLabel: "Level 2",
    desc: "DSM-5 Level 2: Marked deficits in verbal and nonverbal social communication; limited social initiations.",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    barColor: "#f59e0b",
    icon: AlertTriangle,
    gradient: "from-amber-500 to-orange-500",
  },
  "Very High": {
    level: "Level 3 — Requiring Very Substantial Support",
    shortLabel: "Level 3",
    desc: "DSM-5 Level 3: Severe deficits in verbal and nonverbal social communication skills cause severe impairments.",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    barColor: "#ef4444",
    icon: AlertCircle,
    gradient: "from-red-500 to-rose-600",
  },
};

// Fallback mapping from legacy riskLevel strings
const FALLBACK_MAP: Record<string, string> = {
  none: "Low",
  level1: "Moderate",
  level2: "High",
  level3: "Very High",
};

const domainMeta: Record<string, { icon: React.ElementType; color: string; fill: string }> = {
  "Social Interaction":  { icon: Brain,         color: "text-blue-600",   fill: "#3b82f6" },
  "Communication":       { icon: MessageSquare, color: "text-emerald-600", fill: "#10b981" },
  "Behavioral Patterns": { icon: Activity,      color: "text-amber-600",  fill: "#f59e0b" },
};

// ── PDF generator: renders the report HTML off-screen, rasterizes it with ──
// html2canvas, and assembles real PDF pages with jsPDF.
async function generatePDF(
  childInfo: ChildInfo,
  backendResult: BackendResult | null,
  fallbackResult: ScreeningResult | null,
  dsm5: typeof DSM5_MAP[string],
  domainScores: Array<{ domain: string; percentage: number; flag_items: string[]; interpretation: string }>,
  recs: BackendResult['recommendations'] | null,
): Promise<Blob> {
  // Build the report markup; this string is rasterized into PDF pages below.
  const riskScore   = backendResult?.overall_score?.toFixed(1) ?? "—";
  const now         = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const reportId    = `SCR-${Date.now()}`;
  const ageFmt      = `${childInfo.ageMonths} months (${Math.floor(childInfo.ageMonths / 12)}y ${childInfo.ageMonths % 12}m)`;
  const genderLabel = childInfo.gender === 'm' ? 'Male' : childInfo.gender === 'f' ? 'Female' : childInfo.gender;

  const domainRows = domainScores.map(ds => `
    <tr>
      <td><strong>${ds.domain}</strong></td>
      <td>
        <div class="bar-wrap"><div class="bar-fill" style="width:${ds.percentage}%;background:${ds.percentage > 60 ? '#ef4444' : ds.percentage > 35 ? '#f59e0b' : '#10b981'}"></div></div>
      </td>
      <td style="text-align:right"><strong>${ds.percentage.toFixed(1)}%</strong></td>
      <td>${ds.interpretation}</td>
    </tr>
    ${ds.flag_items.length > 0 ? `<tr><td colspan="4" style="color:#b45309;font-size:11px;padding-top:0">⚠ Flagged items: ${ds.flag_items.join(', ')}</td></tr>` : ''}
  `).join('');

  const primaryRecs  = (recs?.primary ?? []).map((r, i) => `<li><strong>${i + 1}.</strong> ${r}</li>`).join('');
  const domainRecs   = (recs?.domain_specific ?? [])
    .map(r => {
      // strip square brackets like [Social Interaction]
      const clean = r.replace(/^\[.*?\]\s*/, '');
      return `<li>${clean}</li>`;
    }).join('');

  const mlSection = backendResult?.model_transparency?.models_available ? `
    <table class="data-table">
      <tr><th>Model</th><th>ASD Probability</th><th>Prediction</th><th>Weight</th></tr>
      <tr>
        <td>Random Forest</td>
        <td>${((backendResult.model_transparency.rf_probability ?? 0) * 100).toFixed(1)}%</td>
        <td>${backendResult.model_transparency.rf_prediction ?? '—'}</td>
        <td>60%</td>
      </tr>
      ${backendResult.model_transparency.lr_probability !== null ? `
      <tr>
        <td>Logistic Regression</td>
        <td>${((backendResult.model_transparency.lr_probability ?? 0) * 100).toFixed(1)}%</td>
        <td>${backendResult.model_transparency.lr_prediction ?? '—'}</td>
        <td>40%</td>
      </tr>` : ''}
      <tr style="background:#f8fafc;font-weight:bold">
        <td>Ensemble Decision</td>
        <td>${((backendResult.model_transparency.ensemble_probability ?? 0) * 100).toFixed(1)}%</td>
        <td colspan="2">${backendResult.model_transparency.final_decision_basis}</td>
      </tr>
    </table>
    <p style="font-size:11px;color:#64748b;margin-top:8px">Model trained on Q-Chat-10 dataset (n=1,054). SMOTE applied. Test accuracy: 95.67%. Precision/Recall/F1: 96%.</p>
  ` : '<p>Scores computed via validated Q-Chat-10 rule-based algorithm.</p>';

  const comparisonSection = backendResult?.comparison ? `
    <section>
      <h2>6. Progress Since Last Screening</h2>
      <table class="data-table">
        <tr><th>Metric</th><th>Previous</th><th>Current</th><th>Change</th></tr>
        <tr>
          <td>Overall Score</td>
          <td>${backendResult.comparison.previous_score.toFixed(1)} / 100</td>
          <td>${riskScore} / 100</td>
          <td style="color:${backendResult.comparison.score_change > 0 ? '#ef4444' : '#10b981'}">${backendResult.comparison.score_change > 0 ? '+' : ''}${backendResult.comparison.score_change.toFixed(1)}</td>
        </tr>
        <tr>
          <td>Risk Level</td>
          <td>${backendResult.comparison.previous_risk}</td>
          <td>${dsm5.level}</td>
          <td>${backendResult.comparison.direction}</td>
        </tr>
      </table>
      ${recs?.trend_note ? `<p class="note">${recs.trend_note}</p>` : ''}
    </section>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ASD Screening Report – ${childInfo.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;font-size:13px;color:#1e293b;background:#fff;padding:40px;line-height:1.6}
  .cover{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:240px;background:linear-gradient(135deg,#1d4ed8,#7c3aed);border-radius:16px;padding:40px;margin-bottom:32px;color:white;text-align:center}
  .cover h1{font-size:26px;font-weight:700;margin-bottom:8px}
  .cover p{font-size:13px;opacity:0.85}
  .cover .report-id{font-size:11px;opacity:0.6;margin-top:12px;font-family:monospace}
  .risk-badge{display:inline-block;padding:10px 24px;border-radius:999px;font-size:15px;font-weight:700;margin:16px 0;background:rgba(255,255,255,0.2);color:white;border:2px solid rgba(255,255,255,0.4)}
  section{margin-bottom:28px;page-break-inside:avoid}
  h2{font-size:15px;font-weight:700;color:#1d4ed8;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin-bottom:14px;text-transform:uppercase;letter-spacing:.04em}
  h3{font-size:13px;font-weight:600;color:#334155;margin:12px 0 6px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  .data-table th,.data-table td{padding:8px 10px;border:1px solid #e2e8f0;font-size:12px}
  .data-table th{background:#f1f5f9;font-weight:600;color:#475569}
  .data-table tr:nth-child(even){background:#f8fafc}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
  .info-cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px}
  .info-cell .label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
  .info-cell .value{font-size:13px;font-weight:600;color:#1e293b}
  .bar-wrap{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;min-width:120px}
  .bar-fill{height:100%;border-radius:999px;transition:width .3s}
  .score-circle{width:120px;height:120px;border-radius:50%;border:8px solid #e2e8f0;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px;font-weight:800;color:#1d4ed8}
  .score-circle span{font-size:11px;font-weight:400;color:#64748b}
  .level-box{border-radius:12px;padding:16px;margin-bottom:16px;border:2px solid}
  .rec-list{padding-left:0;list-style:none;space-y:6px}
  .rec-list li{padding:8px 12px;background:#f8fafc;border-left:3px solid #1d4ed8;border-radius:0 6px 6px 0;margin-bottom:6px;font-size:12px}
  .domain-rec-list li{border-left-color:#7c3aed}
  .note{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin-top:8px}
  .disclaimer{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-top:32px;font-size:11px;color:#64748b;line-height:1.7}
  .disclaimer strong{color:#334155}
  .page-break{page-break-after:always}
  @media print{body{padding:20px}.cover{min-height:180px}}
</style>
</head>
<body>

<!-- Cover -->
<div class="cover">
  <p style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin-bottom:8px">ASD Early Screening System</p>
  <h1>Screening Report</h1>
  <p>${childInfo.name} · ${ageFmt} · ${genderLabel}</p>
  <div class="risk-badge">${dsm5.level}</div>
  <p style="font-size:18px;font-weight:700">${riskScore !== '—' ? `Risk Score: ${riskScore} / 100` : ''}</p>
  <p class="report-id">Report ID: ${reportId} · Generated: ${now}</p>
</div>

<!-- Section 1: Child Details -->
<section>
  <h2>1. Child Details</h2>
  <div class="info-grid">
    <div class="info-cell"><div class="label">Name</div><div class="value">${childInfo.name}</div></div>
    <div class="info-cell"><div class="label">Age</div><div class="value">${ageFmt}</div></div>
    <div class="info-cell"><div class="label">Sex</div><div class="value">${genderLabel}</div></div>
    <div class="info-cell"><div class="label">Ethnicity</div><div class="value">${childInfo.ethnicity || 'Not specified'}</div></div>
    <div class="info-cell"><div class="label">Neonatal Jaundice</div><div class="value">${childInfo.jaundice ? '⚠ Yes' : '✓ No'}</div></div>
    <div class="info-cell"><div class="label">Family ASD History</div><div class="value">${childInfo.familyASD ? '⚠ Yes' : '✓ No'}</div></div>
    <div class="info-cell" style="grid-column:span 2"><div class="label">Assessment Completed By</div><div class="value">${childInfo.completedBy}</div></div>
  </div>
</section>

<!-- Section 2: DSM-5 Classification -->
<section>
  <h2>2. DSM-5 Classification &amp; Risk Score</h2>
  ${riskScore !== '—' ? `<div class="score-circle">${riskScore}<span>/ 100</span></div>` : ''}
  <div class="level-box" style="border-color:${dsm5.barColor};background:${dsm5.bg.replace('bg-','').includes('-') ? '#fafafa' : '#fafafa'}">
    <h3 style="color:${dsm5.barColor};margin-top:0">${dsm5.level}</h3>
    <p style="font-size:12px;color:#334155">${dsm5.desc}</p>
    ${backendResult?.is_borderline ? `<p class="note" style="margin-top:10px">⚠ Borderline Result: ${backendResult.borderline_note}</p>` : ''}
    ${backendResult?.age_adjustment_applied ? `<p style="margin-top:8px;font-size:11px;color:#64748b">ℹ Age Adjustment: ${backendResult.age_adjustment_note}</p>` : ''}
  </div>

  <!-- DSM-5 scale reference -->
  <table class="data-table">
    <tr><th>DSM-5 Level</th><th>Score Range</th><th>Description</th></tr>
    <tr style="${dsm5.level.includes('No') ? 'background:#d1fae5' : ''}"><td>No Significant Traits</td><td>0 – 29</td><td>No ASD traits identified at this time</td></tr>
    <tr style="${dsm5.level.includes('Level 1') ? 'background:#dbeafe' : ''}"><td>Level 1 – Requiring Support</td><td>30 – 54</td><td>Social communication deficits with support needs</td></tr>
    <tr style="${dsm5.level.includes('Level 2') ? 'background:#fef3c7' : ''}"><td>Level 2 – Requiring Substantial Support</td><td>55 – 74</td><td>Marked deficits; limited social initiation</td></tr>
    <tr style="${dsm5.level.includes('Level 3') ? 'background:#fee2e2' : ''}"><td>Level 3 – Requiring Very Substantial Support</td><td>75 – 100</td><td>Severe deficits causing serious functional impairment</td></tr>
  </table>
</section>

<!-- Section 3: Domain Analysis -->
<section>
  <h2>3. Domain Analysis</h2>
  <table class="data-table">
    <tr><th>Domain</th><th>Score Distribution</th><th>Score</th><th>Clinical Interpretation</th></tr>
    ${domainRows}
  </table>
</section>

<!-- Section 4: ML Model Transparency -->
<section>
  <h2>4. AI Model Transparency</h2>
  ${mlSection}
</section>

${comparisonSection ? `<div class="page-break"></div>${comparisonSection}` : ''}

<!-- Section 5/6: Recommendations -->
<section>
  <h2>${backendResult?.comparison ? '7' : '5'}. Clinical Recommendations</h2>

  ${recs?.age_note ? `<p class="note" style="margin-bottom:14px">👶 <strong>Age Note (${childInfo.ageMonths} months):</strong> ${recs.age_note}</p>` : ''}

  <h3>Primary Actions</h3>
  <ul class="rec-list">${primaryRecs}</ul>

  ${domainRecs ? `<h3>Domain-Specific Guidance</h3><ul class="rec-list domain-rec-list">${domainRecs}</ul>` : ''}

  ${recs?.borderline_note ? `<p class="note">${recs.borderline_note}</p>` : ''}
  ${recs?.monitoring_interval ? `<p style="margin-top:10px;font-size:12px;color:#1d4ed8;font-weight:600">📅 ${recs.monitoring_interval}</p>` : ''}
</section>

<!-- Validation -->
<section>
  <h2>${backendResult?.comparison ? '8' : '6'}. Model Validation Summary</h2>
  <table class="data-table">
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Dataset</td><td>Q-Chat-10 Toddler Autism Screening (Kaggle) — 1,054 records</td></tr>
    <tr><td>After Preprocessing</td><td>975 records (79 duplicates removed)</td></tr>
    <tr><td>Class Balancing</td><td>SMOTE applied — minority class oversampled to 691</td></tr>
    <tr><td>Model Architecture</td><td>Random Forest (200 trees) + Logistic Regression ensemble</td></tr>
    <tr><td>Train / Test Split</td><td>80% / 20% stratified</td></tr>
    <tr><td>Test Accuracy</td><td>95.67%</td></tr>
    <tr><td>Precision / Recall / F1</td><td>96% / 96% / 96%</td></tr>
  </table>
</section>

<!-- Disclaimer -->
<div class="disclaimer">
  <strong>IMPORTANT DISCLAIMER</strong><br/>
  This report is generated by an automated screening tool based on the validated Q-Chat-10 questionnaire and machine learning analysis.
  It is <strong>NOT a clinical diagnosis</strong> and must not be treated as one. The Diagnostic and Statistical Manual of Mental Disorders,
  Fifth Edition (DSM-5) level classifications shown are indicative only and must be confirmed through a comprehensive evaluation
  by a qualified developmental paediatrician, child psychologist, or multidisciplinary ASD assessment team.
  Early identification leads to better outcomes. If you have concerns, please seek professional evaluation regardless of the score.
  <br/><br/>
  <strong>Reference:</strong> American Psychiatric Association. (2013). Diagnostic and Statistical Manual of Mental Disorders (5th ed.).
  Allison et al. (2012). Toward Brief "Red Flags" for Autism Screening: The Short Autism Spectrum Quotient and the Short Quantitative Checklist in 1,000 Cases.
</div>

</body>
</html>`;

  // Render the report HTML off-screen, then rasterize it into real PDF pages.
  // This produces an actual application/pdf binary (starts with the %PDF
  // magic header), instead of HTML bytes mislabeled with a .pdf extension.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-99999px'; // keep off-screen, but still rendered/laid out
  container.style.width = '794px';   // ~A4 width at 96dpi so wrapping matches print CSS
  container.style.background = '#ffffff';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // Let images/fonts referenced in the markup settle before capture.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;

    // Slice the tall rendered canvas into successive A4-sized pages.
    const pageCanvas = document.createElement('canvas');
    const pageCtx = pageCanvas.getContext('2d');
    const pxPerPage = Math.floor((pageHeight * canvas.width) / imgWidth);
    pageCanvas.width = canvas.width;

    let renderedHeight = 0;
    let pageIndex = 0;
    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pxPerPage, canvas.height - renderedHeight);
      pageCanvas.height = sliceHeight;
      pageCtx?.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageCtx?.drawImage(
        canvas,
        0, renderedHeight, canvas.width, sliceHeight,
        0, 0, canvas.width, sliceHeight,
      );

      const sliceDataUrl = pageCanvas.toDataURL('image/png');
      const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(sliceDataUrl, 'PNG', 0, 0, imgWidth, sliceImgHeight);

      renderedHeight += sliceHeight;
      pageIndex += 1;
    }

    return pdf.output('blob'); // real application/pdf Blob
  } finally {
    document.body.removeChild(container);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ResultStep({ backendResult, fallbackResult, childInfo, onRestart, onDownload }: ResultStepProps) {
  const [expandModel,  setExpandModel]  = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Resolve risk level
  const rawLevel  = backendResult?.risk_level ?? (fallbackResult ? FALLBACK_MAP[fallbackResult.riskLevel] ?? 'Low' : 'Low');
  const dsm5      = DSM5_MAP[rawLevel] ?? DSM5_MAP.Low;
  const Icon      = dsm5.icon;
  const score     = backendResult?.overall_score ?? null;

  // Domain scores
  const domainScores = backendResult?.domain_scores ?? [];

  // Radar chart data
  const radarData = domainScores.map(ds => ({
    domain: ds.domain.split(' ')[0], // shorten for chart
    score: ds.percentage,
    fullMark: 100,
  }));

  // Bar chart data for items
  const barData = domainScores.map(ds => ({
    name: ds.domain.replace(' Patterns', '').replace(' Interaction', ''),
    score: Math.round(ds.percentage),
    fill: domainMeta[ds.domain]?.fill ?? '#6366f1',
  }));

  // Explainability (SHAP) chart data — combine top positive + negative,
  // sort by magnitude so the most influential factors sit at the top.
  const explainability = backendResult?.explainability;
  const shapChartData = explainability?.available
    ? [...explainability.top_positive, ...explainability.top_negative]
        .sort((a, b) => Math.abs(b.contribution_pct) - Math.abs(a.contribution_pct))
        .map(f => ({
          name: f.label.length > 34 ? f.label.slice(0, 33) + '…' : f.label,
          fullName: f.label,
          value: f.contribution_pct,
          fill: f.direction === 'risk' ? '#ef4444' : '#10b981',
        }))
    : [];

  const trend      = backendResult?.trend ?? 'none';
  const TrendIcon  = trend === 'improving' ? TrendingDown : trend === 'declining' ? TrendingUp : Minus;
  const trendColor = trend === 'improving' ? 'text-emerald-600' : trend === 'declining' ? 'text-red-500' : 'text-muted-foreground';

  const handleDownloadPDF = async () => {
    setGeneratingPDF(true);
    try {
      const blob = await generatePDF(
        childInfo,
        backendResult,
        fallbackResult,
        dsm5,
        domainScores,
        backendResult?.recommendations ?? null,
      );
      // blob is a genuine application/pdf Blob — hand it straight to the
      // save-to-disk handler. No print dialog / new tab needed any more.
      onDownload(blob);
    } finally {
      setGeneratingPDF(false);
    }
  };

  return (
    <div className="slide-up max-w-lg mx-auto w-full pb-12">

      {/* ── DSM-5 Level Hero ── */}
      <Card className={`border-2 ${dsm5.border} mb-5 overflow-hidden`}>
        {/* Gradient top band */}
        <div className={`bg-gradient-to-r ${dsm5.gradient} p-5 text-white`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-75 mb-1">
                Screening Complete · {childInfo.name}
              </p>
              <h2 className="text-xl font-extrabold leading-tight">{dsm5.level}</h2>
              <p className="text-xs opacity-80 mt-1">{dsm5.shortLabel !== dsm5.level ? dsm5.shortLabel : ''}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Confidence pill */}
          {backendResult?.confidence?.confidence_pct != null && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full px-3 py-1">
              <Gauge className="w-3.5 h-3.5 text-white/90" />
              <span className="text-xs font-semibold text-white">
                Confidence: {backendResult.confidence.confidence_pct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-white/70 uppercase tracking-wide">
                ({backendResult.confidence.confidence_level})
              </span>
            </div>
          )}

          {/* Score bar */}
          {score !== null && (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1.5 opacity-80">
                <span>Risk Score</span>
                <span className="font-bold text-white">{score.toFixed(1)} / 100</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/80 rounded-full transition-all duration-1000"
                  style={{ width: `${score}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-1 opacity-60">
                <span>No Traits</span>
                <span>Level 1</span>
                <span>Level 2</span>
                <span>Level 3</span>
              </div>
            </div>
          )}
        </div>

        {/* DSM-5 description */}
        <div className={`px-5 py-3 ${dsm5.bg}`}>
          <p className="text-xs text-muted-foreground leading-relaxed">{dsm5.desc}</p>
          <div className="flex gap-2 flex-wrap mt-2">
            {backendResult?.is_borderline && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">⚠ Borderline</span>
            )}
            {backendResult?.age_adjustment_applied && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Age-adjusted</span>
            )}
            {backendResult?.stage_completed === 2 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">Stage 1+2 Complete</span>
            )}
          </div>
          {backendResult?.is_borderline && (
            <p className="text-xs text-amber-700 mt-2 leading-relaxed">{backendResult.borderline_note}</p>
          )}
          {backendResult?.confidence?.low_confidence_note && (
            <p className="text-xs text-amber-700 mt-2 leading-relaxed flex items-start gap-1.5">
              <Gauge className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {backendResult.confidence.low_confidence_note}
            </p>
          )}
        </div>
      </Card>

      {/* ── Explainable AI (SHAP) ── */}
      {explainability?.available && (
        <Card className="mb-5 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              Why This Prediction?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Plain-language summary for parents */}
            {explainability.plain_explanation && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/15">
                <p className="text-xs text-foreground leading-relaxed">{explainability.plain_explanation}</p>
              </div>
            )}

            {/* Horizontal bar chart of top contributing factors */}
            {shapChartData.length > 0 && (
              <div style={{ height: Math.max(160, shapChartData.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={shapChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [`${v > 0 ? '+' : ''}${v.toFixed(1)}%`, 'Contribution to risk']}
                      labelFormatter={(_l, payload) => payload?.[0]?.payload?.fullName ?? ''}
                    />
                    <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                      {shapChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Checklist-style top factors */}
            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              {explainability.top_positive.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CircleX className="w-3 h-3" /> Increased Risk
                  </p>
                  <div className="space-y-1.5">
                    {explainability.top_positive.map(f => (
                      <div key={f.feature} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-red-50 border border-red-100">
                        <span className="text-red-800">{f.label}</span>
                        <span className="font-bold text-red-700 shrink-0">+{f.contribution_pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {explainability.top_negative.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CircleCheck className="w-3 h-3" /> Protective Factors
                  </p>
                  <div className="space-y-1.5">
                    {explainability.top_negative.map(f => (
                      <div key={f.feature} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                        <span className="text-emerald-800">{f.label}</span>
                        <span className="font-bold text-emerald-700 shrink-0">{f.contribution_pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
              Powered by SHAP ({explainability.model_basis}). Contributions are percentage points of predicted ASD-risk probability, computed against a background of typical screening responses.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Domain Analysis with charts ── */}
      {domainScores.length > 0 && (
        <Card className="mb-5 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Domain Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Radar chart */}
            {radarData.length === 3 && (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Bar chart */}
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Risk Score']}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Domain detail rows */}
            <div className="space-y-3 pt-1">
              {domainScores.map(ds => {
                const meta = domainMeta[ds.domain];
                const DomainIcon = meta?.icon ?? Brain;
                return (
                  <div key={ds.domain} className="p-3 rounded-xl bg-secondary/40 border border-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <DomainIcon className={`w-4 h-4 ${meta?.color ?? 'text-primary'}`} />
                      <span className="text-sm font-semibold text-foreground">{ds.domain}</span>
                      <span className="ml-auto text-sm font-bold" style={{ color: meta?.fill }}>{ds.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${ds.percentage}%`, background: meta?.fill ?? 'hsl(var(--primary))' }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{ds.interpretation}</p>
                    {ds.flag_items.length > 0 && (
                      <p className="text-xs text-amber-600 mt-1">⚠ Flagged: {ds.flag_items.join(', ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Trend comparison ── */}
      {backendResult?.comparison && (
        <Card className="mb-5 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendIcon className={`w-4 h-4 ${trendColor}`} />
              Progress Since Last Screening
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Previous', value: backendResult.comparison.previous_score.toFixed(1), sub: backendResult.comparison.previous_date, color: 'text-muted-foreground' },
                { label: 'Change', value: `${backendResult.comparison.score_change > 0 ? '+' : ''}${backendResult.comparison.score_change.toFixed(1)}`, sub: backendResult.comparison.direction, color: trendColor },
                { label: 'Current', value: score?.toFixed(1) ?? '—', sub: rawLevel + ' Risk', color: 'text-foreground' },
              ].map(item => (
                <div key={item.label} className="p-3 rounded-xl bg-secondary">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className={`text-xl font-extrabold ${item.color}`}>{item.value}</p>
                  <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
            {backendResult.recommendations?.trend_note && (
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border leading-relaxed">
                {backendResult.recommendations.trend_note}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Recommendations ── */}
      {backendResult?.recommendations && (
        <Card className="mb-5 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Clinical Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary */}
            <div className="space-y-2">
              {backendResult.recommendations.primary.map((rec, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl bg-secondary/40">
                  <span className={`shrink-0 w-6 h-6 rounded-full ${dsm5.badge} flex items-center justify-center text-xs font-bold`}>
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>

            {/* Domain-specific — clean, no brackets */}
            {backendResult.recommendations.domain_specific.length > 0 && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Domain-Specific Guidance</p>
                <div className="space-y-2">
                  {backendResult.recommendations.domain_specific.map((rec, i) => {
                    // Extract domain tag and clean content
                    const match = rec.match(/^\[(.+?)\]\s*(.*)/);
                    const domain  = match?.[1] ?? '';
                    const content = match?.[2] ?? rec;
                    const meta    = domainMeta[domain];
                    const DIcon   = meta?.icon ?? Brain;
                    return (
                      <div key={i} className="flex gap-3 p-3 rounded-xl border border-border bg-card">
                        {meta && (
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0`}
                            style={{ background: (meta.fill) + '20' }}>
                            <DIcon className="w-3.5 h-3.5" style={{ color: meta.fill }} />
                          </div>
                        )}
                        <div>
                          {domain && <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">{domain}</p>}
                          <p className="text-xs text-foreground leading-relaxed">{content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Age note */}
            {backendResult.recommendations.age_note && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <span className="font-semibold">Age note ({childInfo.ageMonths}m): </span>
                  {backendResult.recommendations.age_note}
                </p>
              </div>
            )}

            {/* Monitoring */}
            {backendResult.recommendations.monitoring_interval && (
              <div className="flex items-center gap-2 text-primary pt-1">
                <Calendar className="w-4 h-4 shrink-0" />
                <p className="text-xs font-semibold">{backendResult.recommendations.monitoring_interval}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Risk factors ── */}
      <Card className="mb-5 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Clinical Risk Factors</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {[
            { label: 'Neonatal Jaundice', value: childInfo.jaundice },
            { label: 'Family ASD History', value: childInfo.familyASD },
          ].map(rf => (
            <div key={rf.label} className={`p-3 rounded-xl border ${rf.value ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xs font-bold ${rf.value ? 'text-amber-700' : 'text-emerald-700'}`}>
                {rf.value ? '⚠ Present' : '✓ Not Present'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{rf.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── ML Transparency (collapsible) ── */}
      {backendResult?.model_transparency?.models_available && (
        <Card className="mb-5 border-border">
          <button
            onClick={() => setExpandModel(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">ML Model Transparency</span>
            </div>
            {expandModel ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandModel && (
            <CardContent className="pt-0 border-t border-border space-y-3">
              {[
                { label: 'Random Forest', prob: backendResult.model_transparency.rf_probability, pred: backendResult.model_transparency.rf_prediction, weight: '60%', color: '#3b82f6', bg: 'bg-blue-50 border-blue-100' },
                { label: 'Logistic Regression', prob: backendResult.model_transparency.lr_probability, pred: backendResult.model_transparency.lr_prediction, weight: '40%', color: '#8b5cf6', bg: 'bg-purple-50 border-purple-100' },
              ].filter(m => m.prob !== null).map(m => (
                <div key={m.label} className={`p-3 rounded-xl border ${m.bg}`}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold" style={{ color: m.color }}>{m.label} ({m.weight})</span>
                    <span className="text-xs font-bold" style={{ color: m.color }}>{((m.prob ?? 0) * 100).toFixed(1)}% ASD prob.</span>
                  </div>
                  <div className="h-2 bg-white/70 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(m.prob ?? 0) * 100}%`, background: m.color }} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: m.color }}>→ {m.pred}</p>
                </div>
              ))}

              {backendResult.model_transparency.ensemble_probability !== null && (
                <div className="p-3 rounded-xl bg-secondary border border-border">
                  <div className="flex justify-between font-bold text-sm mb-1">
                    <span>Ensemble Final</span>
                    <span className="text-primary">{((backendResult.model_transparency.ensemble_probability ?? 0) * 100).toFixed(1)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{backendResult.model_transparency.final_decision_basis}</p>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {[['95.67%','Accuracy'],['96%','Precision'],['96%','Recall'],['96%','F1']].map(([v,l]) => (
                  <div key={l} className="text-center p-2 rounded-lg bg-secondary/60">
                    <p className="text-xs font-bold text-foreground">{v}</p>
                    <p className="text-[10px] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleDownloadPDF}
          disabled={generatingPDF}
          className="flex-1 gap-2"
        >
          <Download className="w-4 h-4" />
          {generatingPDF ? 'Generating PDF…' : 'Download PDF Report'}
        </Button>
        <Button variant="outline" onClick={onRestart} className="flex-1 gap-2">
          <RotateCcw className="w-4 h-4" />
          New Screening
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-5 leading-relaxed">
        Based on DSM-5 criteria and Q-Chat-10 protocol. <strong>Not a clinical diagnosis.</strong><br/>
        Consult a qualified developmental paediatrician for a formal evaluation.
      </p>
    </div>
  );
}