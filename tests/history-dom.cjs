const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const wait = () => new Promise(resolve => setTimeout(resolve, 100));
const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};

(async () => {
    const dom = new JSDOM('<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_buttons"><button class="mes_button">Edit</button></div><div class="mes_text"><p>chosen</p></div></div></div><div class="mes" mesid="1"><div class="mes_text">user</div></div><div class="mes" mesid="2"><div class="mes_block"><div class="mes_text">latest</div></div></div></div>', { runScripts: 'outside-only' });
    const { window } = dom;
    try {
        let chat = [freeze({ name: 'Char', mes: 'chosen', swipe_id: 2, swipes: ['older', 'middle', 'chosen'],
            swipe_info: [{ extra: { display_text: '이전 답변 번역', reasoning: 'old reasoning', reasoning_display_text: '이전 추론 번역' } }, {}, {}] }),
            { is_user: true, mes: 'user' }, freeze({ name: 'Char', mes: 'latest', swipe_id: 1, swipes: ['latest-old', 'latest'] })];
        const before = JSON.stringify(chat);
        const events = {};
        const source = fs.readFileSync(path.join(__dirname, '../history.js'), 'utf8').replace('export function', 'function');
        window.eval(source + '\nwindow.startViewer = installHistoryViewer;');
        window.startViewer({ getContext: () => ({ chat }),
            format: (text, name, sys, user, id) => { assert.equal(id, -1); return '<p>' + text + '</p>'; },
            events: { on: (key, fn) => { events[key] = fn; } },
            eventTypes: { GENERATION_STARTED: 'generation', CHAT_CHANGED: 'changed' },
        });
        const doc = window.document;
        const old = doc.querySelector('.mes[mesid="0"]');
        const click = (row, label) => row.querySelector(`button[aria-label="${label}"]`).click();
        assert.equal(doc.querySelectorAll('.sr-history-bar').length, 1);
        click(old, '이전 후보 열람');
        assert.equal(old.querySelector('.sr-history-body').textContent, 'middle');
        assert.equal(old.querySelector('.mes_text').innerHTML, '<p>chosen</p>');
        click(old, '이전 후보 열람');
        assert.equal(old.querySelector('.sr-history-body').textContent, '이전 답변 번역');
        assert.equal(old.querySelector('.sr-history-reasoning').textContent, '이전 추론 번역');
        assert.equal(JSON.stringify(chat), before);
        click(old, '열람 닫기 · 채택 답변으로 돌아가기');
        assert.equal(old.querySelector('.sr-history-preview').hidden, true);
        assert.equal(old.querySelector('.sr-history-active'), null);
        click(old, '이전 후보 열람'); events.generation();
        assert.equal(old.querySelector('.sr-history-preview').hidden, true);
        assert.equal(JSON.stringify(chat), before);
        chat.push({ is_user: true, mes: 'next' });
        doc.querySelector('#chat').insertAdjacentHTML('beforeend', '<div class="mes" mesid="3"><div class="mes_text">next</div></div>');
        await wait();
        assert.equal(doc.querySelectorAll('.sr-history-bar').length, 2);
        click(doc.querySelector('.mes[mesid="2"]'), '이전 후보 열람');
        assert.equal(chat[2].mes, 'latest'); assert.equal(chat[2].swipe_id, 1);
        click(old, '이전 후보 열람'); old.querySelector('.mes_button').click();
        assert.equal(old.querySelector('.sr-history-preview').hidden, true);
        // Deleting the later turn makes the old last answer a native selectable message again.
        chat.pop(); doc.querySelector('.mes[mesid="3"]').remove(); await wait();
        assert.equal(doc.querySelector('.mes[mesid="2"] .sr-history-bar'), null);
        chat = [{ name: 'Other', mes: 'other' }]; events.changed(); await wait();
        assert.equal(doc.querySelectorAll('.sr-history-bar').length, 0);
        assert.equal(doc.querySelectorAll('.sr-history-active').length, 0);
        console.log('PASS: DOM preview, immutable chat, candidate translation, reasoning translation, close, generation, turn advance/delete, editing, chat switch');
    } finally { window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
