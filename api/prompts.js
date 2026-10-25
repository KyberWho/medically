// Requires Node.js 18+ and a running Ollama server.

const host = process.env.OLLAMA_HOST || 'http://localhost:11434';

export async function text_prompt(prompt) {
		try {
		const response = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
				model: "qwen3:1.7b",
				messages: [{ role: 'user', content: prompt }],
				stream: false,
				}),
		});

		if (!response.ok) {
				throw new Error(
				`Ollama returned HTTP ${response.status}: ${await response.text()}`
				);
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
				`Ensure Ollama is running at ${host}. For a shared deployment, set OLLAMA_HOST to the server URL used by everyone (for example http://10.0.0.12:11434), then run 'ollama pull d3:latest' and 'ollama pull qwen3:1.7b' on that machine.`
		);
		process.exitCode = 1;
		return "";
		}
}

export async function decision_prompt(context, instructions, criteria_true, criteria_false) {
		try {
				const response = await fetch(`${host.replace(/\/$/, '')}/v1/systemone`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
						model: 'd3:2b',
						state: context,
						questions: {
								verify: {
										type: 'noul',
										instructions: instructions,
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
						throw new Error(`HTTP ${response.status}: ${errorBody}`);
				}

				const data = await response.json();
				
				if (data.error) throw new Error(data.error);
				const probability = data.answers?.verify?.noul;
				if (typeof probability !== 'number' || probability < 0 || probability > 1) {
						throw new Error('Ollama returned an unexpected System One decision response.');
				}
				return probability > 0.5;

		} catch (error) {
				console.error(`Request failed: ${error.message}`);
				throw error;
		}
}
