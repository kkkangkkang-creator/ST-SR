import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import * as core from '../core.mjs';

async function setup(mode) {
    const elements = new Map();
    class Element {
        constructor(id) { this.id = id; this.attributes = {}; this.handlers = {}; }
        cloneNode() { return new Element(''); }
        removeAttribute(k) { delete this.attributes[k]; }
        setAttribute(k, v) { this.attributes[k] = v; }
        addEventListener(k, fn) { this.handlers[k] = fn; }
        after(item) { elements.set(item.id, item); this.next = item; }
        click() { this.handlers.click?.({ preventDefault() {}, stopPropagation() {} }); }
    }
    elements.set('option_regenerate', new Element('option_regenerate'));
    elements.set('options', new Element('options'));
    elements.set('options_button', new Element('options_button'));
    let lock = false, calls = 0, saves = 0, renders = 0, shows = 0;
    const old = { name: 'Character', mes: 'old', is_user: false, extra: { reasoning: 'old thought' } };
    const chat = [{ is_user: true, mes: 'question' }, old];
    const c = { chat, characterId: 1, groupId: null, onlineStatus: 'connected',
        getCurrentChatId: () => 'chat',
        activateSendButtons: () => { lock = false; },
        saveChat: async () => { saves++; },
        generate: async type => {
            calls++;
            assert.equal(type, 'regenerate'); assert.equal(lock, true);
            assert.equal(chat[1], old); // The wrapper has not swapped in a swipe or injected history.
            chat.pop(); assert.equal(chat.length, 1);
            await new Promise(r => setTimeout(r, 5));
            if (mode === 'fail') throw new Error('API failure');
            if (mode !== 'cancel') chat.push({ name: 'Character', mes: 'new', is_user: false, extra: {} });
            lock = false;
        },
    };
    const st = { isGenerating: () => lock, setSendButtonState: v => { lock = v; },
        redisplayChat: async ({ startIndex }) => { assert.equal(startIndex, 1); renders++; },
        showSwipeButtons: () => { shows++; } };
    const sandbox = vm.createContext({ console: { error() {} }, setTimeout, clearTimeout,
        document: { getElementById: id => elements.get(id), querySelector: () => null },
        getComputedStyle: () => ({ display: 'block' }), MutationObserver: class { observe() {} },
        toastr: { error() {}, warning() {}, info() {} }, structuredClone, Blob, URL });
    const module = new vm.SourceTextModule(await fs.readFile(new URL('../index.js', import.meta.url), 'utf8'), { context: sandbox });
    await module.link(async spec => {
        const exports = spec === '../../../../script.js' ? st : spec === '../../../extensions.js' ? { getContext: () => c } : spec === './history.js' ? { installHistoryViewer() {} } : spec === './render-bridge.mjs' ? { renderPreviewJSR() {} } : core;
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context: sandbox });
    });
    await module.evaluate();
    const item = elements.get('option_regenerate_swipe');
    assert.equal(elements.get('option_regenerate').next, item);
    assert.match(item.innerHTML, /재생성\(스와이프\)/);
    item.click(); item.click(); // double tapping must never launch another generation
    for (let i = 0; i < 100 && item.attributes['aria-disabled']; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(item.attributes['aria-disabled'], undefined);
    assert.equal(calls, 1); assert.equal(saves, 1); assert.equal(renders, 1); assert.equal(shows, 1);
    assert.equal(lock, false);
    return chat[1];
}
test('actual menu adapter invokes native regenerate once and saves merged result', async () => {
    const m = await setup('success'); assert.deepEqual(m.swipes, ['old', 'new']); assert.equal(m.swipe_id, 1);
});
test('actual adapter restores after thrown API error', async () => {
    const m = await setup('fail'); assert.equal(m.mes, 'old'); assert.equal(m.extra.reasoning, 'old thought');
});
test('actual adapter restores after cancellation with no output', async () => {
    const m = await setup('cancel'); assert.equal(m.mes, 'old');
});
