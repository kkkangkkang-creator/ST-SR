import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderPreviewJSR } from '../render-bridge.mjs';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

function fixture() {
    const dom = new JSDOM('<div id="tavern_helper"></div><div id="native"></div><div id="preview"><pre><code>&lt;html&gt;&lt;body&gt;Saved translation&lt;/body&gt;&lt;/html&gt;</code></pre><pre><code>ordinary code</code></pre></div>');
    const document = dom.window.document;
    const native = document.getElementById('native');
    const renderer = { runtimes: [{ message_id: 3, reload_memo: 'original', elements: [native] }] };
    const settings = { enabled: true, allow_streaming: true, depth: 0 };
    document.getElementById('tavern_helper').__vue_app__ = {
        config: { globalProperties: { $pinia: { _s: new Map([
            ['message_iframe_runtimes', renderer], ['global_settings', { settings: { render: settings } }],
        ]) } } },
    };
    return { dom, document, native, renderer, settings, body: document.getElementById('preview') };
}

test('register preview with JSR while keeping native rendering and settings intact', async () => {
    const f = fixture();
    try {
        const settings = JSON.stringify(f.settings);
        const clean = renderPreviewJSR(f.body, 3, f);
        await tick();
        assert.equal(f.renderer.runtimes.length, 1);
        assert.equal(f.renderer.runtimes[0].elements.length, 2);
        assert.equal(f.renderer.runtimes[0].elements[0], f.native);
        assert.equal(f.renderer.runtimes[0].reload_memo, 'original');
        assert.equal(f.body.querySelectorAll('.TH-render').length, 1);
        assert.match(f.renderer.runtimes[0].elements[1].textContent, /Saved translation/);
        assert.equal(JSON.stringify(f.settings), settings);
        clean();
        assert.deepEqual(f.renderer.runtimes[0].elements, [f.native]);
        assert.equal(f.renderer.runtimes[0].reload_memo, 'original');
    } finally { f.dom.window.close(); }
});
test('rapid switching or closing cancels pending iframe registration', async () => {
    const f = fixture();
    try {
        const clean = renderPreviewJSR(f.body, 3, f);
        clean(); await tick();
        assert.deepEqual(f.renderer.runtimes[0].elements, [f.native]);
        assert.equal(f.body.querySelector('.TH-render'), null);
        const clean2 = renderPreviewJSR(f.body, 3, f);
        f.body.remove(); await tick();
        assert.deepEqual(f.renderer.runtimes[0].elements, [f.native]);
        clean2();
    } finally { f.dom.window.close(); }
});
test('preview-only runtime is removed on close; disabled renderer is respected', async () => {
    const f = fixture();
    try {
        const clean = renderPreviewJSR(f.body, 8, f); await tick();
        assert.equal(f.renderer.runtimes.length, 2);
        clean(); assert.equal(f.renderer.runtimes.length, 1);
        f.settings.enabled = false;
        renderPreviewJSR(f.body, 8, f); await tick();
        assert.equal(f.renderer.runtimes.length, 1);
        delete f.document.getElementById('tavern_helper').__vue_app__;
        assert.doesNotThrow(() => renderPreviewJSR(f.body, 8, f)());
    } finally { f.dom.window.close(); }
});
