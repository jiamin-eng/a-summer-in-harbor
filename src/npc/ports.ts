export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChoiceOption = { value: string; description: string };
export type ScoreLevel = { label: string; description: string };
export type DecisionQuestion =
  | { type: "choice"; name: string; instructions: string; choices: ChoiceOption[] }
  | { type: "score"; name: string; instructions: string; levels: ScoreLevel[] }
  | { type: "predicate"; name: string; instructions: string };
export type ChoiceWeight = { value: string; probability: number };
export type DecisionAnswer =
  | { type: "choice"; name: string; choice: string; probabilities?: ChoiceWeight[]; confidence?: number }
  | { type: "score"; name: string; score: number; confidence?: number }
  | { type: "predicate"; name: string; probability: number };

/** Body for `POST /aigram/api/chatgpt/decision`. The relay adds the model. */
export function decisionRequest(input: string, questions: DecisionQuestion[]) {
  return { input, questions };
}

export function decisionAnswers(body: unknown): DecisionAnswer[] {
  const answers = (body as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers) || !answers.length) throw Error("NPC_DECIDE");
  return answers.map(decisionAnswer);
}

export function choiceNamed(answers: DecisionAnswer[], name: string) {
  const answer = answers.find((item) => item.name === name);
  if (!answer || answer.type !== "choice") throw Error("NPC_DECIDE");
  return answer.choice;
}

/** The listed probabilities decide. `choice` is used only when no probabilities came back. */
export function choiceDrawn(answers: DecisionAnswer[], name: string, random: () => number = Math.random) {
  const answer = answers.find((item) => item.name === name);
  if (!answer || answer.type !== "choice" || !answer.choice.trim()) throw Error("NPC_DECIDE");
  return answer.probabilities?.length ? sampleWeighted(answer.probabilities, random) : answer.choice;
}

/** Draw one listed value. A larger probability is only more likely, not an automatic winner. */
export function sampleWeighted(weights: ChoiceWeight[], random: () => number = Math.random) {
  const rows = weights.filter((row) => row.value && Number.isFinite(row.probability) && row.probability > 0);
  const total = rows.reduce((sum, row) => sum + row.probability, 0);
  if (!total) throw Error("NPC_DECIDE");
  let mark = random() * total;
  for (const row of rows) {
    mark -= row.probability;
    if (mark < 0) return row.value;
  }
  return rows[rows.length - 1].value;
}

/** `probability` is how likely the statement is true. A high value is only more likely. */
export function samplePredicate(probability: number, random: () => number = Math.random) {
  if (!Number.isFinite(probability)) throw Error("NPC_DECIDE");
  return random() < Math.min(1, Math.max(0, probability));
}

function choiceWeights(value: unknown): ChoiceWeight[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return typeof row.value === "string" && row.value.trim() && typeof row.probability === "number" && Number.isFinite(row.probability)
      ? [{ value: row.value, probability: row.probability }]
      : [];
  });
  return rows.length ? rows : undefined;
}

function decisionAnswer(value: unknown): DecisionAnswer {
  if (!value || typeof value !== "object") throw Error("NPC_DECIDE");
  const row = value as Record<string, unknown>;
  if (row.type === "refusal") throw Error("NPC_DECIDE");
  if (typeof row.name !== "string" || !row.name.trim()) throw Error("NPC_DECIDE");
  const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : undefined;
  if (row.type === "choice" && typeof row.choice === "string" && row.choice.trim()) return { type: "choice", name: row.name, choice: row.choice, probabilities: choiceWeights(row.probabilities), confidence };
  if (row.type === "score" && typeof row.score === "number" && Number.isFinite(row.score)) return { type: "score", name: row.name, score: row.score, confidence };
  if (row.type === "predicate" && typeof row.probability === "number" && Number.isFinite(row.probability)) return { type: "predicate", name: row.name, probability: row.probability };
  throw Error("NPC_DECIDE");
}
