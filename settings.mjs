export const DISABLED_REGENERATE_ID = 'sr-native-regenerate-disabled';

export function installSettings({ settings, save, document: doc = globalThis.document }) {
    const key = 'ST_SR';
    settings[key] ??= {};
    const preferences = settings[key];
    const registered = new WeakSet();
    function sync() {
        const disabled = preferences.disableNativeRegenerate === true;
        const native = doc.getElementById('option_regenerate') || doc.getElementById(DISABLED_REGENERATE_ID);
        if (native) {
            // Core's existing menu listener dispatches by the element's current id.
            // Renaming also blocks jQuery-triggered clicks and the native hotkey,
            // without deleting/reordering any handlers owned by SillyTavern.
            native.id = disabled ? DISABLED_REGENERATE_ID : 'option_regenerate';
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
            panel.innerHTML = '<div class="sr-settings-title">재생성(스와이프)</div><div class="sr-settings-row"><span>기존 재생성 버튼 비활성화</span><button type="button" role="switch" aria-label="기존 재생성 버튼 비활성화" class="menu_button sr-native-toggle"></button></div>';
            panel.querySelector('button').addEventListener('click', () => {
                preferences.disableNativeRegenerate = preferences.disableNativeRegenerate !== true;
                save(); sync();
            });
            host.append(panel);
        }
        const toggle = panel?.querySelector('button');
        if (toggle) {
            toggle.setAttribute('aria-checked', String(disabled));
            const label = disabled ? '켜짐' : '꺼짐';
            if (toggle.textContent !== label) toggle.textContent = label;
        }
    }
    sync();
    const observer = new doc.defaultView.MutationObserver(sync);
    observer.observe(doc.getElementById('options') || doc.body, { childList: true, subtree: true });
}
