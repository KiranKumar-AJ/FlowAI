import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ onSend, messages, onUse, onUpdate, streaming = false, onStartStream, onStopStream }) {
	const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

	const handleSend = async () => {
		const text = input.trim();
		if (!text) return;
		setInput('');
		onSend(text);
	};

	const onKeyDown = (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (!streaming) handleSend();
		}
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<div style={{ width: 8, height: 8, borderRadius: 999, background: streaming ? '#22c55e' : '#64748b' }} />
				<div style={{ fontSize: 13, color: 'var(--muted)' }}>{streaming ? 'Streaming...' : 'Ready'}</div>
			</div>
			<div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 12, background: '#0b0d12', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 10px 24px rgba(0,0,0,0.25)' }}>
				{messages.map((m, i) => {
					const isAssistant = m.role === 'assistant';
					return (
						<div key={i} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: isAssistant ? 'flex-start' : 'flex-end' }}>
							<div style={{ maxWidth: '85%', background: isAssistant ? '#0f1320' : '#1b1f2a', border: '1px solid var(--border)', borderRadius: 12, padding: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
								<div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: isAssistant ? '#a5b4fc' : '#94a3b8', marginBottom: 4 }}>{m.role}</div>
								<div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{m.content}</div>
								{isAssistant && (
									<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
										<button onClick={() => onUse(m.content)}>Use as prompt</button>
										<button onClick={() => onUpdate(m.content)}>Update diagram</button>
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
				<textarea
					value={input}
					onChange={e => setInput(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder="Describe a change or ask a question... (Press Enter to send)"
					style={{ flex: 1, minHeight: 60, borderRadius: 12 }}
					disabled={streaming}
				/>
				<div style={{ display: 'flex', gap: 8 }}>
					{streaming ? (
						<button onClick={onStopStream}>Stop</button>
					) : (
						<button onClick={handleSend} disabled={!input.trim()}>Send</button>
					)}
				</div>
			</div>
		</div>
	);
}


