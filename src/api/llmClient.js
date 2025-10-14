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

export async function chatRefine(messages, model) {
	const resp = await fetch('http://localhost:3001/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ messages, model }),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Server error ${resp.status}: ${text}`);
	}
	const data = await resp.json();
	return data.message;
}

export function chatRefineStream(messages, onChunk, onDone, onError, model) {
	const controller = new AbortController();
	
	const streamPromise = fetch('http://localhost:3001/api/chat-stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ messages, model }),
		signal: controller.signal,
	}).then(async resp => {
		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`Server error ${resp.status}: ${text}`);
		}
		
		if (!resp.body) {
			throw new Error('No response body');
		}
		
		const reader = resp.body.getReader();
		const decoder = new TextDecoder('utf-8');
		let buffer = '';
		
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				
				buffer += decoder.decode(value, { stream: true });
				let idx;
				
				while ((idx = buffer.indexOf('\n\n')) !== -1) {
					const rawEvent = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 2);
					const lines = rawEvent.split('\n');
					let event = 'message';
					let data = '';
					
					for (const l of lines) {
						if (l.startsWith('event:')) event = l.slice(6).trim();
						if (l.startsWith('data:')) data += l.slice(5).trim();
					}
					
					try {
						const payload = data ? JSON.parse(data) : {};
						if (event === 'chunk' && onChunk) onChunk(payload.text || '');
						if (event === 'done' && onDone) onDone(payload.text || '');
						if (event === 'error' && onError) onError(payload.message || '');
					} catch (parseErr) {
						console.warn('Failed to parse SSE event:', parseErr);
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}).catch(err => {
		if (err.name === 'AbortError') {
			// Request was aborted, don't call onError
			return;
		}
		if (onError) onError(err?.message || String(err));
	});
	
	return () => {
		controller.abort();
		streamPromise.catch(() => {}); // Suppress unhandled promise rejection
	};
}


