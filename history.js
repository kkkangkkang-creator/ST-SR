// Read-only DOM viewer. Never assign chat.mes, swipe_id, swipes, or swipe_info.
export function installHistoryViewer({ getContext, format, events, eventTypes, renderPreview }) {
    const root = document.getElementById('chat');
    if (!root) return;
    const views = new Map();
    let queued = false;
    const icon = path => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${path}"/></svg>`;

    function reset(view) {
        view.stopRendering?.();
        view.stopRendering = null;
        view.position = view.selected;
        view.block.classList.remove('sr-history-active');
        view.preview.hidden = true;
        view.preview.replaceChildren();
    }

    function dispose(row, view) {
        reset(view);
        view.bar.remove();
        view.preview.remove();
        row.classList.remove('sr-history-row');
        views.delete(row);
    }

    function show(view) {
        view.stopRendering?.();
        view.stopRendering = null;
        const { message, selected, position } = view;
        const alternate = position !== selected;
        view.label.textContent = alternate
            ? `열람 ${position + 1}/${message.swipes.length} · 채택 ${selected + 1}`
            : `채택 ${selected + 1}/${message.swipes.length}`;
        view.previous.disabled = position <= 0;
        view.next.disabled = position >= message.swipes.length - 1;
        view.close.hidden = !alternate;
        view.block.classList.toggle('sr-history-active', alternate);
        view.preview.hidden = !alternate;
        if (!alternate) { view.preview.replaceChildren(); return; }
        const info = message.swipe_info?.[position]?.extra || {};
        const body = document.createElement('div');
        body.className = 'sr-history-body';
        // -1 avoids the core formatter's special first-message writeback.
        body.innerHTML = format(info.display_text || message.swipes[position], message.name, false, false, -1);
        view.preview.replaceChildren();
        if (info.reasoning_display_text || info.reasoning) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = '이 답변의 추론';
            const reasoning = document.createElement('div');
            reasoning.className = 'sr-history-reasoning';
            reasoning.textContent = info.reasoning_display_text || info.reasoning;
            details.append(summary, reasoning);
            view.preview.append(details);
        }
        view.preview.append(body);
        if (renderPreview) {
            try { view.stopRendering = renderPreview(body, view.messageId); }
            catch (error) { console.warn('[ST-SR] Preview renderer unavailable', error); }
        }
    }

    function create(row, message, selected, text) {
        const block = text.parentElement;
        const bar = document.createElement('div');
        bar.className = 'sr-history-bar';
        bar.setAttribute('aria-label', '지난 답변 열람 (채택 답변은 유지됨)');
        const button = (title, path) => {
            const b = document.createElement('button');
            b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
            b.innerHTML = icon(path); return b;
        };
        const previous = button('이전 후보 열람', 'm15 5-7 7 7 7');
        const next = button('다음 후보 열람', 'm9 5 7 7-7 7');
        const close = button('열람 닫기 · 채택 답변으로 돌아가기', 'm6 6 12 12M18 6 6 18');
        const label = document.createElement('span');
        label.setAttribute('aria-live', 'polite');
        const preview = document.createElement('div');
        preview.className = 'sr-history-preview'; preview.hidden = true;
        const view = { message, messageId: Number(row.getAttribute('mesid')), selected, position: selected, block, bar, preview,
            previous, next, close, label, text, chosenText: message.mes, swipes: message.swipes,
            count: message.swipes.length };
        bar.append(previous, label, next, close);
        for (const [b, delta] of [[previous, -1], [next, 1], [close, 0]]) {
            b.addEventListener('click', event => {
                event.preventDefault(); event.stopPropagation();
                // Check identity/selection again before using a rendered row.
                reconcile();
                if (views.get(row) !== view) return;
                view.position = delta ? Math.max(0, Math.min(message.swipes.length - 1, view.position + delta)) : selected;
                show(view);
            });
        }
        text.before(bar);
        text.after(preview);
        row.classList.add('sr-history-row');
        views.set(row, view);
        show(view);
    }

    function reconcile() {
        queued = false;
        const { chat } = getContext();
        for (const [row, view] of views) {
            if (!root.contains(row)) dispose(row, view);
        }
        for (const row of root.querySelectorAll('.mes[mesid]')) {
            const id = Number(row.getAttribute('mesid'));
            const message = chat[id];
            const text = row.querySelector('.mes_text');
            const eligible = Number.isInteger(id) && id < chat.length - 1 && message &&
                !message.is_user && !message.is_system && message.swipes?.length > 1 && text &&
                !row.querySelector('.edit_textarea');
            let view = views.get(row);
            const selected = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
            if (view && (!eligible || view.message !== message || view.text !== text ||
                view.selected !== selected || view.chosenText !== message.mes ||
                view.swipes !== message.swipes || view.count !== message.swipes.length || !row.contains(view.bar))) {
                dispose(row, view); view = null;
            }
            if (eligible && !view) create(row, message, selected, text);
        }
    }

    function schedule() {
        if (queued) return;
        queued = true;
        setTimeout(reconcile, 60);
    }

    // Restore actual selected display before native editing/copy/message actions.
    root.addEventListener('click', event => {
        if (event.target.closest('.sr-history-bar, .sr-history-preview')) return;
        const view = views.get(event.target.closest('.mes'));
        if (view && event.target.closest('.mes_buttons, .extraMesButtons, .mes_button')) {
            reset(view); show(view);
        }
    }, true);
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['mesid'] });
    if (events && eventTypes) {
        for (const key of ['CHAT_CHANGED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED']) {
            if (eventTypes[key]) events.on(eventTypes[key], schedule);
        }
        if (eventTypes.GENERATION_STARTED) events.on(eventTypes.GENERATION_STARTED, () => {
            for (const view of views.values()) { reset(view); show(view); }
        });
    }
    reconcile();
}
