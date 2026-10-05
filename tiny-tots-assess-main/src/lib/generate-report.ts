import type { ChildInfo, ScreeningResult } from "./screening-data";
import { questions } from "./screening-data";

export function generatePDFReport(
  childInfo: ChildInfo,
  answers: Record<string, number>,
  result: ScreeningResult,
  recommendations: string[] = []
) {
  const genderLabel: Record<string, string> = { m: 'Male', f: 'Female' };
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const recommendationsSection = recommendations.length > 0 ? `
<h2>Personalised Activity Suggestions</h2>
<ul style="padding-left: 20px; margin: 8px 0;">
  ${recommendations.map((r) => `<li style="margin-bottom: 8px; font-size: 14px;">${r}</li>`).join('')}
</ul>` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Q-Chat-10 Screening Report - ${childInfo.name}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1a1a2e; line-height: 1.6; }
  h1 { color: #0d9488; border-bottom: 3px solid #0d9488; padding-bottom: 8px; font-size: 24px; }
  h2 { color: #334155; font-size: 18px; margin-top: 28px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .header { text-align: center; margin-bottom: 30px; }
  .header h1 { border: none; }
  .header p { color: #64748b; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
  .info-item { font-size: 14px; }
  .info-label { color: #64748b; }
  .risk-box { padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0; }
  .risk-none   { background: #dcfce7; color: #166534; }
  .risk-level1 { background: #dbeafe; color: #1e40af; }
  .risk-level2 { background: #fef3c7; color: #92400e; }
  .risk-level3 { background: #fee2e2; color: #991b1b; }
  .score-bar { height: 12px; background: #e2e8f0; border-radius: 6px; margin: 4px 0 12px; overflow: hidden; }
  .score-fill { height: 100%; border-radius: 6px; }
  .social-fill { background: #3b82f6; }
  .comm-fill   { background: #22c55e; }
  .behav-fill  { background: #f59e0b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
  th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { color: #64748b; font-weight: 600; }
  .score-1 { color: #991b1b; font-weight: bold; }
  .score-0 { color: #166534; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<div class="header">
  <h1>🧒 Q-Chat-10 Screening Report</h1>
  <p>Generated on ${date}</p>
</div>

<h2>Child Information</h2>
<div class="info-grid">
  <div class="info-item"><span class="info-label">Name:</span> ${childInfo.name}</div>
  <div class="info-item"><span class="info-label">Age:</span> ${childInfo.ageMonths} months</div>
  ${childInfo.gender    ? `<div class="info-item"><span class="info-label">Sex:</span> ${genderLabel[childInfo.gender] || childInfo.gender}</div>` : ''}
  ${childInfo.ethnicity ? `<div class="info-item"><span class="info-label">Ethnicity:</span> ${childInfo.ethnicity}</div>` : ''}
  <div class="info-item"><span class="info-label">Jaundice:</span> ${childInfo.jaundice  ? 'Yes' : 'No'}</div>
  <div class="info-item"><span class="info-label">Family ASD:</span> ${childInfo.familyASD ? 'Yes' : 'No'}</div>
</div>

<h2>Screening Result</h2>
<div class="risk-box risk-${result.riskLevel}">
  <strong style="font-size: 18px;">${result.riskLabel}</strong><br>
  <span style="font-size: 14px;">Q-Chat-10 Score: ${result.totalScore} / 10</span><br>
  <span style="font-size: 13px;">Confidence: ${result.confidence}%</span>
</div>

<h2>Category Scores</h2>
<div>
  <div><strong>Social Interaction:</strong> ${result.scores.social.score}%</div>
  <div class="score-bar"><div class="score-fill social-fill" style="width: ${result.scores.social.score}%"></div></div>
  <div><strong>Communication:</strong> ${result.scores.communication.score}%</div>
  <div class="score-bar"><div class="score-fill comm-fill" style="width: ${result.scores.communication.score}%"></div></div>
  <div><strong>Behavior & Sensory:</strong> ${result.scores.behavior.score}%</div>
  <div class="score-bar"><div class="score-fill behav-fill" style="width: ${result.scores.behavior.score}%"></div></div>
</div>

<h2>Q-Chat-10 Item Responses</h2>
<table>
  <thead><tr><th>Item</th><th>Question</th><th>Answer</th><th>Score</th></tr></thead>
  <tbody>
    ${questions.map((q) => {
      const ansIdx     = answers[q.id];
      const answerText = ansIdx !== undefined ? q.options[ansIdx] : 'N/A';
      const score      = result.individualScores[q.id] ?? 0;
      return `<tr><td>${q.id}</td><td>${q.text}</td><td>${answerText}</td><td class="score-${score}">${score}</td></tr>`;
    }).join('')}
  </tbody>
</table>

<h2>Recommendation</h2>
<p>${result.recommendation}</p>

${recommendationsSection}

<div class="footer">
  <p>Based on the Q-Chat-10 screening method (Allison et al., 2012).<br>
  This report is for screening purposes only and does not constitute a medical diagnosis.<br>
  Please consult a qualified healthcare professional for a comprehensive evaluation.</p>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => printWindow.print();
  }
}

// ── CSV Export ───────────────────────────────────────────────
export function generateCSVReport(
  childInfo: ChildInfo,
  answers: Record<string, number>,
  result: ScreeningResult,
  recommendations: string[] = []
) {
  const genderLabel: Record<string, string> = { m: 'Male', f: 'Female' };
  const date = new Date().toLocaleDateString('en-US');

  const rows: string[][] = [
    // Header block
    ['Q-Chat-10 Screening Report'],
    ['Generated', date],
    [],
    // Child info
    ['Child Information'],
    ['Name',         childInfo.name],
    ['Age (months)', String(childInfo.ageMonths)],
    ['Sex',          genderLabel[childInfo.gender] || childInfo.gender || 'N/A'],
    ['Ethnicity',    childInfo.ethnicity || 'N/A'],
    ['Jaundice',     childInfo.jaundice  ? 'Yes' : 'No'],
    ['Family ASD',   childInfo.familyASD ? 'Yes' : 'No'],
    [],
    // Result
    ['Screening Result'],
    ['Risk Level',   result.riskLabel],
    ['Total Score',  `${result.totalScore} / 10`],
    ['Confidence',   `${result.confidence}%`],
    [],
    // Category scores
    ['Category Scores'],
    ['Social Interaction',  `${result.scores.social.score}%`],
    ['Communication',       `${result.scores.communication.score}%`],
    ['Behavior & Sensory',  `${result.scores.behavior.score}%`],
    [],
    // Item responses
    ['Item Responses'],
    ['Item', 'Question', 'Answer', 'Score'],
    ...questions.map((q) => {
      const ansIdx     = answers[q.id];
      const answerText = ansIdx !== undefined ? q.options[ansIdx] : 'N/A';
      const score      = result.individualScores[q.id] ?? 0;
      return [q.id, q.text, answerText, String(score)];
    }),
    [],
    // Recommendation
    ['Recommendation'],
    [result.recommendation],
    [],
    // Personalised activities
    ...(recommendations.length > 0
      ? [
          ['Personalised Activity Suggestions'],
          ...recommendations.map((r, i) => [`${i + 1}.`, r]),
          [],
        ]
      : []),
    ['Disclaimer'],
    ['This report is for screening purposes only and does not constitute a medical diagnosis.'],
  ];

  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `qchat10-${childInfo.name.replace(/\s+/g, '-') || 'report'}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}