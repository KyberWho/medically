// Requires Node.js 18+ and a running Ollama server.

const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_TEXT_MODEL = process.env.OLLAMA_MODEL || process.env.OLLAMA_TEXT_MODEL || 'qwen3:1.7b';
const DEFAULT_DECISION_MODEL = normalizeModelName(process.env.OLLAMA_DECISION_MODEL) || '';

function normalizeModelName(model) {
	return typeof model === 'string' ? model.trim() : '';
}

function isDecisionModelName(model) {
	return /(^|[.:])d3\b|decision/i.test(model || '');
}

function getDecisionModelCandidates(primaryModel) {
	const uniqueModels = new Set();
	for (const candidate of [
		normalizeModelName(primaryModel),
		normalizeModelName(process.env.OLLAMA_DECISION_MODEL),
	]) {
		if (candidate && isDecisionModelName(candidate)) uniqueModels.add(candidate);
	}
	return [...uniqueModels];
}

function getChatFallbackCandidates() {
	const uniqueModels = new Set();
	for (const candidate of [
		normalizeModelName(DEFAULT_TEXT_MODEL),
		normalizeModelName(process.env.OLLAMA_MODEL),
		normalizeModelName(process.env.OLLAMA_TEXT_MODEL),
		'qwen3:1.7b',
	]) {
		if (candidate) uniqueModels.add(candidate);
	}
	return [...uniqueModels];
}

function isModelMissingError(error) {
	const message = (error && error.message) || '';
	return /model .* not found|model .* not available|404/i.test(message);
}

function isUnsupportedDecisionModelError(error) {
	const message = (error && error.message) || '';
	return /not a llama\.cpp decision model|not a .* decision model|decision model/i.test(message);
}

function parseBooleanText(text) {
	if (typeof text !== 'string') return null;
	const cleaned = text.trim().toLowerCase();
	if (!cleaned) return null;
	if (/^true\b|\btrue\b/i.test(cleaned)) return true;
	if (/^false\b|\bfalse\b/i.test(cleaned)) return false;
	return null;
}

export async function text_prompt(prompt) {
	try {
		const response = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: DEFAULT_TEXT_MODEL,
				messages: [{ role: 'user', content: prompt }],
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Ollama returned HTTP ${response.status}: ${await response.text()}`);
		}

		const data = await response.json();

		if (data.error) throw new Error(data.error);

		if (typeof data.message?.content !== 'string') {
			throw new Error('Ollama returned an unexpected response.');
		}

		return data.message.content;
	} catch (error) {
		console.error(`Request failed: ${error.message}`);

		if (error.cause?.code) {
			console.error(`Connection error: ${error.cause.code}`);
		}

		console.error(
			`Ensure Ollama is running at ${host}. For a shared deployment, set OLLAMA_HOST to the server URL used by everyone (for example http://10.0.0.12:11434), then pull a model such as 'qwen3:1.7b' on that machine.`
		);
		process.exitCode = 1;
		return '';
	}
}

export async function decision_prompt(context, instructions, criteria_true, criteria_false) {
	const decisionCandidates = getDecisionModelCandidates(DEFAULT_DECISION_MODEL);
	const chatCandidates = getChatFallbackCandidates();
	let lastError = null;

	for (const model of decisionCandidates) {
		try {
			const response = await fetch(`${host.replace(/\/$/, '')}/v1/systemone`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model,
					state: context,
					questions: {
						verify: {
							type: 'noul',
							instructions,
							criteria: {
								true: criteria_true,
								false: criteria_false,
							},
						},
					},
				}),
			});

			if (!response.ok) {
				const errorBody = await response.text();
				const error = new Error(`HTTP ${response.status}: ${errorBody}`);
				if (response.status === 404 || /model .* not found/i.test(errorBody) || isUnsupportedDecisionModelError(error)) {
					lastError = error;
					continue;
				}
				throw error;
			}

			const data = await response.json();
			if (data.error) {
				const error = new Error(data.error);
				if (isModelMissingError(error) || isUnsupportedDecisionModelError(error)) {
					lastError = error;
					continue;
				}
				throw error;
			}

			const probability = data.answers?.verify?.noul;
			if (typeof probability === 'number' && probability >= 0 && probability <= 1) {
				return probability > 0.5;
			}
			throw new Error('Ollama returned an unexpected System One decision response.');
		} catch (error) {
			if (isModelMissingError(error) || isUnsupportedDecisionModelError(error)) {
				lastError = error;
				continue;
			}
			console.error(`Request failed: ${error.message}`);
			throw error;
		}
	}

	for (const model of chatCandidates) {
		try {
			const response = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model,
					messages: [{
						role: 'user',
						content: `${context}\n\nInstructions: ${instructions}\n\nCriteria true: ${criteria_true}\n\nCriteria false: ${criteria_false}\n\nReply with only the word true or false.`,
					}],
					stream: false,
				}),
			});

			if (!response.ok) {
				const errorBody = await response.text();
				const error = new Error(`HTTP ${response.status}: ${errorBody}`);
				if (response.status === 404 || /model .* not found/i.test(errorBody)) {
					lastError = error;
					continue;
				}
				throw error;
			}

			const data = await response.json();
			if (data.error) {
				const error = new Error(data.error);
				if (isModelMissingError(error)) {
					lastError = error;
					continue;
				}
				throw error;
			}

			if (typeof data.message?.content !== 'string') {
				throw new Error('Ollama returned an unexpected response.');
			}

			const parsed = parseBooleanText(data.message.content);
			if (parsed !== null) {
				return parsed;
			}
			throw new Error('Ollama returned a non-boolean response.');
		} catch (error) {
			if (isModelMissingError(error)) {
				lastError = error;
				continue;
			}
			console.error(`Request failed: ${error.message}`);
			throw error;
		}
	}

	if (lastError) {
		throw lastError;
	}
	throw new Error('No Ollama model was available for decision-making.');
}
