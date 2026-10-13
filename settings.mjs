export const DISABLED_REGENERATE_ID = 'sr-native-regenerate-disabled';

export function installSettings({ settings, save, document: doc = globalThis.document }) {
    const key = 'ST_SR';
    settings[key] ??= {};
    const preferences = settings[key];
    const registered = new WeakSet();
    // Menus can be replaced by the host or theme. Block the event before it
    // reaches a newly created item, even before the observer has run.
    doc.addEventListener('click', event => {
        if (preferences.disableNativeRegenerate !== true) return;
        if (event.target?.closest?.(`#option_regenerate, #${DISABLED_REGENERATE_ID}`)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
    function sync() {
        const disabled = preferences.disableNativeRegenerate === true;
        const native = doc.getElementById('option_regenerate') || doc.getElementById(DISABLED_REGENERATE_ID);
        if (native) {
            // Core's existing menu listener dispatches by the element's current id.
            // Renaming also blocks jQuery-triggered clicks and the native hotkey,
            // without deleting/reordering any handlers owned by SillyTavern.
            const targetId = disabled ? DISABLED_REGENERATE_ID : 'option_regenerate';
            if (native.id !== targetId) native.id = targetId;
            native.classList.toggle('sr-native-disabled', disabled);
            native.setAttribute('aria-disabled', String(disabled));
            if (!registered.has(native)) {
                native.addEventListener('click', event => {
                    if (preferences.disableNativeRegenerate === true) {
                        event.preventDefault(); event.stopImmediatePropagation();
                    }
                }, true);
                registered.add(native);
            }
        }
        let panel = doc.getElementById('sr-settings');
        const host = doc.getElementById('extensions_settings');
        if (!panel && host) {
            panel = doc.createElement('div');
            panel.id = 'sr-settings';
            panel.className = 'extension_container';
            panel.innerHTML = '<details class="sr-settings-drawer"><summary class="sr-settings-title"><span>재생성(스와이프)</span><span class="sr-settings-chevron" aria-hidden="true"></span></summary><div class="sr-settings-row"><span id="sr-native-toggle-label">기존 재생성 버튼 비활성화</span><button type="button" role="switch" aria-labelledby="sr-native-toggle-label" class="sr-native-toggle"><span class="sr-toggle-thumb" aria-hidden="true"></span></button></div></details>';
            panel.querySelector('button').addEventListener('click', () => {
                preferences.disableNativeRegenerate = preferences.disableNativeRegenerate !== true;
                sync(); save();
            });
            host.append(panel);
        }
        const toggle = panel?.querySelector('button');
        if (toggle) {
            toggle.setAttribute('aria-checked', String(disabled));
        }
    }
    sync();
    const observer = new doc.defaultView.MutationObserver(sync);
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
}
