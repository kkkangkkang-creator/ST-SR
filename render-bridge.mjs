// JS-Slash-Runner 4.x adapter: register only preview DOM with its existing renderer.
// No chat events, refreshOneMessage(), message rewrites, or renderer setting changes.
export function renderPreviewJSR(body, messageId, { document: doc = globalThis.document } = {}) {
    const app = doc.getElementById('tavern_helper')?.__vue_app__;
    const stores = app?.config?.globalProperties?.$pinia?._s;
    const settings = stores?.get('global_settings')?.settings?.render;
    const renderer = stores?.get('message_iframe_runtimes');
    if (!settings?.enabled || !Array.isArray(renderer?.runtimes)) return () => {};

    const targets = [...body.querySelectorAll('pre')].filter(pre => {
        const code = pre.querySelector('code');
        return code && /html>|<head>|<body/i.test(code.textContent || '');
    });
    if (!targets.length) return () => {};

    let disposed = false;
    let owned = [];
    // Let Vue unmount the previous candidate before reusing a runtime's indices.
    const timer = setTimeout(() => {
        if (disposed || !body.isConnected || !settings.enabled) return;
        owned = targets.filter(pre => body.contains(pre)).map(pre => {
            const existing = pre.parentElement;
            if (existing?.classList.contains('TH-render')) return existing;
            const wrapper = doc.createElement('div');
            wrapper.className = 'TH-render';
            pre.before(wrapper);
            wrapper.append(pre);
            return wrapper;
        });
        if (!owned.length) return;
        // Preserve native targets and reload_memo so selected-answer iframes stay mounted.
        const runtime = renderer.runtimes.find(item => item.message_id === messageId);
        if (runtime) {
            runtime.elements = [...runtime.elements, ...owned.filter(el => !runtime.elements.includes(el))];
        } else {
            renderer.runtimes.push({ message_id: messageId,
                reload_memo: `st-sr-${Date.now()}-${Math.random().toString(36).slice(2)}`, elements: owned });
        }
    }, 0);

    return () => {
        disposed = true;
        clearTimeout(timer);
        if (!owned.length) return;
        renderer.runtimes = renderer.runtimes.flatMap(runtime => {
            if (!runtime.elements?.some(el => owned.includes(el))) return [runtime];
            const elements = runtime.elements.filter(el => !owned.includes(el));
            return elements.length ? [{ ...runtime, elements }] : [];
        });
        owned = [];
    };
}
