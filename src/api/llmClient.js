export async function generateMermaidWithAI({ description, type }) {
	const resp = await fetch('http://localhost:3001/api/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ description, type }),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Server error ${resp.status}: ${text}`);
	}
	const data = await resp.json();
	return data.code;
}


