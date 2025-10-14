import { useState } from 'react';
import Diagram from './components/Diagram.jsx';
import { generateMermaidWithAI, chatRefine, chatRefineStream } from './api/llmClient.js';
import ChatPanel from './components/ChatPanel.jsx';
import './index.css';

const examples = {
	flowchart:
		'flowchart TD\nA[Start] --> B{Condition?}\nB -- Yes --> C[Do X]\nB -- No --> D[Do Y]\nC --> E[End]\nD --> E[End]',
	sequence:
		'sequenceDiagram\nparticipant U as User\nparticipant B as Bot\nU->>B: Ask question\nB-->>U: Answer',
};

function mockLLMToMermaid(input, type) {
	if (type === 'flowchart') {
		const steps = input.split(/\n|->/).map(s => s.trim()).filter(Boolean);
		if (steps.length >= 2) {
			let out = 'flowchart TD\n';
			for (let i = 0; i < steps.length; i++) {
				const label = steps[i].replace(/:/g, '');
				const id = 'N' + i;
				out += `${id}["${label}"]\n`;
				if (i < steps.length - 1) out += `N${i} --> N${i + 1}\n`;
			}
			return out;
		}
		return examples.flowchart;
	}

	if (type === 'sequence') {
		const parts = input.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
		let out = 'sequenceDiagram\nparticipant U as User\nparticipant S as System\n';
		for (const p of parts) {
			out += `U->>S: ${p}\nS-->>U: ok\n`;
		}
		return out || examples.sequence;
	}

	return examples.flowchart;
}

export default function App() {
	const [diagramType, setDiagramType] = useState('flowchart');
	const [input, setInput] = useState('Start -> Validate -> Process -> Save -> End');
	const [code, setCode] = useState(() => mockLLMToMermaid('Start -> Validate -> Process -> Save -> End', 'flowchart'));
	const [activeTab, setActiveTab] = useState('preview');
	const [renderInfo, setRenderInfo] = useState(null);
	const [chatMessages, setChatMessages] = useState([
		{ role: 'assistant', content: "Hello! I'm FlowAI, your intelligent assistant for streamlined workflows. I'll help you refine your process descriptions into clear, actionable specifications for generating beautiful diagrams. What would you like to work on today?" }
	]);
	const [chatStreaming, setChatStreaming] = useState(false);
	const streamAbortRef = { current: null };

	const generate = () => {
		const m = mockLLMToMermaid(input, diagramType);
		setCode(m);
		setActiveTab('preview');
	};

	const generateAI = async () => {
		try {
			const aiCode = await generateMermaidWithAI({ description: input, type: diagramType });
			setCode(aiCode);
			setActiveTab('preview');
		} catch (e) {
			alert('AI generation failed: ' + (e?.message || String(e)));
		}
	};

	const sendChat = async (userText) => {
		// Include current diagram context in the chat
		const contextMessage = `Current diagram description: "${input}"`;
		const newMessages = [...chatMessages, { role: 'system', content: contextMessage }, { role: 'user', content: userText }];
		setChatMessages([...chatMessages, { role: 'user', content: userText }]);
		try {
			const reply = await chatRefine(newMessages);
			setChatMessages(msgs => [...msgs, { role: 'assistant', content: reply }]);
		} catch (e) {
			setChatMessages(msgs => [...msgs, { role: 'assistant', content: 'Error: ' + (e?.message || String(e)) }]);
		}
	};

	const startChatStream = (userText) => {
		const text = userText.trim();
		if (!text || chatStreaming) return;
		// Include current diagram context in the chat
		const contextMessage = `Current diagram description: "${input}"`;
		const base = [...chatMessages, { role: 'system', content: contextMessage }, { role: 'user', content: text }];
		setChatMessages([...chatMessages, { role: 'user', content: text }]);
		setChatStreaming(true);
		let acc = '';
		const stop = chatRefineStream(
			base,
			(chunk) => {
				acc += chunk;
				setChatMessages(msgs => {
					const last = msgs[msgs.length - 1];
					if (last && last.role === 'assistant') {
						const copy = msgs.slice();
						copy[copy.length - 1] = { role: 'assistant', content: acc };
						return copy;
					}
					return [...msgs, { role: 'assistant', content: acc }];
				});
			},
			(finalText) => {
				if (!finalText && acc) finalText = acc;
				setChatStreaming(false);
				streamAbortRef.current = null;
			},
			(errMsg) => {
				setChatStreaming(false);
				streamAbortRef.current = null;
				setChatMessages(msgs => [...msgs, { role: 'assistant', content: 'Error: ' + errMsg }]);
			}
		);
		streamAbortRef.current = stop;
	};

	const stopChatStream = () => {
		if (streamAbortRef.current) {
			try { streamAbortRef.current(); } catch {}
			streamAbortRef.current = null;
		}
		setChatStreaming(false);
	};

	const useAsPrompt = (text) => {
		setInput(text);
	};

	const updateDiagramFromText = async (text) => {
		setInput(text);
		try {
			const aiCode = await generateMermaidWithAI({ description: text, type: diagramType });
			setCode(aiCode);
			setActiveTab('preview');
		} catch (e) {
			alert('AI generation failed: ' + (e?.message || String(e)));
		}
	};

	const downloadSVG = () => {
		if (!renderInfo?.svgText) return;
		const blob = new Blob([renderInfo.svgText], { type: 'image/svg+xml' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'diagram.svg';
		a.click();
		URL.revokeObjectURL(a.href);
	};

	const downloadPNG = async () => {
		if (!renderInfo?.svgEl) return;
		const svgEl = renderInfo.svgEl;
		const xml = new XMLSerializer().serializeToString(svgEl);
		const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

		const img = new Image();
		const scale = 2;

		await new Promise((res, rej) => {
			img.onload = res;
			img.onerror = rej;
			img.src = dataUrl;
		});

		const width = (svgEl.viewBox.baseVal?.width || svgEl.width.baseVal.value) * scale;
		const height = (svgEl.viewBox.baseVal?.height || svgEl.height.baseVal.value) * scale;

		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.floor(width));
		canvas.height = Math.max(1, Math.floor(height));
		const ctx = canvas.getContext('2d');

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		canvas.toBlob(blob => {
			if (!blob) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'diagram.png';
			a.click();
			URL.revokeObjectURL(a.href);
		}, 'image/png');
	};

	return (
		<div className="app">
			<header>
				<h1>Text → Diagram Chatbot</h1>
				<div className="controls">
					<label>
						Diagram type:
						<select value={diagramType} onChange={e => setDiagramType(e.target.value)}>
							<option value="flowchart">Flowchart</option>
							<option value="sequence">Sequence</option>
						</select>
					</label>
					<button onClick={generate}>Generate</button>
					<button onClick={downloadSVG}>Export SVG</button>
					<button onClick={downloadPNG}>Export PNG</button>
					<button onClick={generateAI}>Generate with AI</button>
				</div>
			</header>

			<main>
				<section className="left">
					<label>Description</label>
					<textarea
						value={input}
						onChange={e => setInput(e.target.value)}
						placeholder="Describe steps, e.g. Start -&gt; Validate -&gt; Save -&gt; End"
					/>
					<div className="tips">
						Tip: Use arrows (-&gt;) or new lines to separate steps for the mock generator.
					</div>
				</section>

				<section className="right">
					<div className="tabs">
						<button className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')}>
							Preview
						</button>
					<button className={activeTab === 'code' ? 'active' : ''} onClick={() => setActiveTab('code')}>
							Code
						</button>
					<button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
						Chat
					</button>
					</div>

					{activeTab === 'preview' ? (
						<div className="preview">
							<Diagram code={code} onRender={setRenderInfo} />
						</div>
					) : activeTab === 'code' ? (
						<textarea className="code" value={code} onChange={e => setCode(e.target.value)} />
					) : (
						<div className="preview" style={{ display: 'flex', flexDirection: 'column' }}>
							<ChatPanel
								onSend={sendChat}
								messages={chatMessages}
								onUse={useAsPrompt}
								onUpdate={updateDiagramFromText}
								streaming={chatStreaming}
								onStartStream={startChatStream}
								onStopStream={stopChatStream}
							/>
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
