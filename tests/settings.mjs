import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installSettings, DISABLED_REGENERATE_ID } from '../settings.mjs';

test('native regeneration toggle defaults off, blocks clicks, persists, and restores native handler', () => {
    const dom = new JSDOM('<div id="extensions_settings"></div><div id="options"><a id="option_regenerate">Regenerate</a><a id="option_regenerate_swipe">Custom</a></div>');
    try {
        const document = dom.window.document;
        const settings = {};
        let saves = 0, nativeCalls = 0, customCalls = 0;
        const native = document.getElementById('option_regenerate');
        const nativeHandler = () => { if (native.id === 'option_regenerate') nativeCalls++; };
        native.addEventListener('click', nativeHandler);
        document.getElementById('option_regenerate_swipe').addEventListener('click', () => customCalls++);
        installSettings({ document, settings, save: () => saves++ });
        native.click(); assert.equal(nativeCalls, 1);
        const toggle = document.querySelector('#sr-settings button');
        assert.equal(toggle.getAttribute('aria-checked'), 'false');
        toggle.click();
        assert.equal(settings.ST_SR.disableNativeRegenerate, true);
        assert.equal(document.getElementById('option_regenerate'), null);
        assert.equal(native.id, DISABLED_REGENERATE_ID);
        native.click(); nativeHandler(); // Native DOM and jQuery-like direct handler invocation.
        assert.equal(nativeCalls, 1);
        document.getElementById('option_regenerate_swipe').click(); assert.equal(customCalls, 1);
        toggle.click();
        assert.equal(native.id, 'option_regenerate');
        native.click(); assert.equal(nativeCalls, 2);
        assert.equal(saves, 2);
        assert.equal(settings.ST_SR.disableNativeRegenerate, false);
    } finally { dom.window.close(); }
});

test('saved preference applies on initial load and newly rebuilt native menu', async () => {
    const dom = new JSDOM('<div id="extensions_settings"></div><div id="options"><a id="option_regenerate">Regenerate</a></div>');
    try {
        const document = dom.window.document;
        installSettings({ document, settings: { ST_SR: { disableNativeRegenerate: true } }, save() {} });
        assert.equal(document.getElementById(DISABLED_REGENERATE_ID).getAttribute('aria-disabled'), 'true');
        document.getElementById('options').innerHTML = '<a id="option_regenerate">Regenerate</a>';
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(document.getElementById('option_regenerate'), null);
        assert.ok(document.getElementById(DISABLED_REGENERATE_ID));
        assert.equal(document.querySelectorAll('#sr-settings').length, 1);
    } finally { dom.window.close(); }
});

test('replacement options container is blocked immediately and stays disabled after id reset', async () => {
    const dom = new JSDOM('<div id="extensions_settings"></div><div id="options"><a id="option_regenerate">Regenerate</a></div>');
    try {
        const document = dom.window.document;
        installSettings({ document, settings: { ST_SR: { disableNativeRegenerate: true } }, save() {} });
        document.getElementById('options').outerHTML = '<div id="options"><a id="option_regenerate"><span>Regenerate</span></a></div>';
        let calls = 0;
        const native = document.getElementById('option_regenerate');
        native.addEventListener('click', () => calls++);
        native.firstChild.click();
        assert.equal(calls, 0);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(native.id, DISABLED_REGENERATE_ID);
        native.id = 'option_regenerate';
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(native.id, DISABLED_REGENERATE_ID);
        document.querySelector('.sr-native-toggle').click();
        native.firstChild.click();
        assert.equal(calls, 1);
    } finally { dom.window.close(); }
});
