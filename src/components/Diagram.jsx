import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

export default function Diagram({ code, onRender }) {
	const containerRef = useRef(null);

	useEffect(() => {
		let cancelled = false;

		async function render() {
			if (!code || !containerRef.current) return;
			try {
				const id = 'diagram-' + Math.random().toString(36).slice(2);
				const { svg } = await mermaid.render(id, code);
				if (!cancelled && containerRef.current) {
					containerRef.current.innerHTML = svg;
					if (onRender) {
						const svgEl = containerRef.current.querySelector('svg');
						onRender({ svgEl, svgText: svg });
					}
				}
			} catch (err) {
				if (containerRef.current) {
					containerRef.current.textContent = `Render error: ${err?.message || String(err)}`;
				}
			}
		}

		render();
		return () => { cancelled = true; };
	}, [code]);

	return <div ref={containerRef} />;
}


