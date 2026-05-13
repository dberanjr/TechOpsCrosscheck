export interface ExplainProblemRequest {
  problemId: string;
  title: string;
  category: string;
  rootCause: string | null;
  impactLevel: string | null;
  durationMs: number;
  revenueAtRisk: number;
}

export async function explainProblem(request: ExplainProblemRequest): Promise<string> {
  // Note: This is a client-side explanation generator.
  // Once Dynatrace Assist API becomes available for browser apps,
  // replace this with a direct API call:
  // const response = await fetch(`${environmentUrl}/api/v2/genai/assist`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ prompt: problemPrompt })
  // });
  // return response.json().explanation;

  const explanation = generateExplanation(request);
  return new Promise((resolve) => {
    setTimeout(() => resolve(explanation), 300);
  });
}

function generateExplanation(request: ExplainProblemRequest): string {
  const { title, category, rootCause, durationMs, revenueAtRisk, impactLevel } = request;

  const durationMinutes = Math.round(durationMs / 60000);
  const durationText = durationMinutes === 1 ? "1 minute" : `${durationMinutes} minutes`;

  let explanation = `**${title}**\n\n`;

  explanation += `A ${category.toLowerCase()} problem was detected`;
  if (durationMinutes > 0) {
    explanation += ` and lasted ${durationText}`;
  }
  explanation += `. `;

  if (rootCause) {
    explanation += `The root cause was identified as: ${rootCause}. `;
  }

  if (impactLevel) {
    explanation += `This affected ${impactLevel.toLowerCase()} systems. `;
  }

  if (revenueAtRisk > 0) {
    explanation += `The estimated business impact was approximately $${Math.round(revenueAtRisk).toLocaleString()} in revenue at risk.`;
  } else {
    explanation += "Immediate investigation and remediation were necessary to prevent further impact.";
  }

  return explanation;
}
