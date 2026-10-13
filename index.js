import * as ST from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { begin, finish } from './core.mjs';
import { installHistoryViewer } from './history.js';
import { renderPreviewJSR } from './render-bridge.mjs';

const MENU_ID = 'option_regenerate_swipe';
let busy = false;
let recovery = null;
const generating = () => typeof ST.isGenerating === 'function' ? ST.isGenerating() : ST.is_send_press;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function downloadRecovery() {
    if (!recovery) return;
    const blob = new Blob([JSON.stringify({ chat: recovery.key, message: recovery.backup }, null, 2)],
        { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regenerate-swipe-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function run() {
    if (busy || generating()) return;
    // A failed merge must remain recoverable instead of being overwritten by another run.
    if (recovery) {
        downloadRecovery();
        toastr.warning('이전 보관본을 다운로드했습니다. 파일을 확인한 뒤 페이지를 새로고침해 주세요.');
        return;
    }
    const context = getContext();
    if (context.onlineStatus === 'no_connection') {
        toastr.warning('먼저 API에 연결해 주세요.');
        return;
    }
    if (document.querySelector('#chat .edit_textarea')) {
        toastr.warning('메시지 편집을 먼저 완료해 주세요.');
        return;
    }
    let transaction;
    try { transaction = begin(context); }
    catch (error) { toastr.warning(error.message); return; }
    busy = true;
    recovery = transaction;
    document.getElementById(MENU_ID)?.setAttribute('aria-disabled', 'true');
    let generationError;
    try {
        // Same native generation type and send lock as option_regenerate.
        ST.setSendButtonState(true);
        await context.generate('regenerate');
    } catch (error) {
        generationError = error;
        console.error('[Regenerate Swipe] Generation failed', error);
        // Native Generate may throw before reaching its own cleanup handler.
        if (getContext().getCurrentChatId() === transaction.key) context.activateSendButtons();
    }
    try {
        // Native auto-continue may still be running after Generate returns.
        while (generating()) {
            if (getContext().getCurrentChatId() !== transaction.key) break;
            await pause(100);
        }
        const current = getContext();
        const result = finish(transaction, current);
        if (result !== 'unchanged') {
            await current.saveChat();
            if (getContext().getCurrentChatId() !== transaction.key ||
                getContext().characterId !== transaction.character) {
                throw new Error('저장 중 채팅이 바뀌었습니다. 원본 보관본은 유지합니다.');
            }
            // Re-render in memory; don't reload the saved chat or emit a synthetic swipe.
            await ST.redisplayChat({ startIndex: transaction.index });
            ST.showSwipeButtons();
        }
        recovery = null;
        if (result === 'restored') toastr.info('새 답변이 없어 기존 답변을 복원했습니다.');
        else if (generationError) toastr.warning('생성이 중단됐지만 기존 답변은 보존했습니다.');
    } catch (error) {
        console.error('[Regenerate Swipe] Recovery retained', error);
        toastr.error(`${error.message} 이 알림 또는 재생성(스와이프) 메뉴를 누르면 보관본을 다운로드합니다.`,
            '답변 보관본 유지 중', { timeOut: 0, extendedTimeOut: 0, onclick: downloadRecovery });
    } finally {
        busy = false;
        document.getElementById(MENU_ID)?.removeAttribute('aria-disabled');
    }
}

function installMenu() {
    const original = document.getElementById('option_regenerate');
    if (!original || document.getElementById(MENU_ID)) return;
    const item = original.cloneNode(false);
    item.id = MENU_ID;
    item.removeAttribute('data-i18n');
    item.removeAttribute('onclick');
    item.title = '원래 재생성 방식으로 생성하고 이전 답변을 스와이프로 보관 (최대 50개)';
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="flex-shrink:0"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 8a7 7 0 0 1 11.7-3L20 8M4 16l2.8 3A7 7 0 0 0 18.5 16"/></svg><span>재생성(스와이프)</span>';
    item.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        // Close the existing popup through its own toggle, without firing regenerate.
        const options = document.getElementById('options');
        if (options && getComputedStyle(options).display !== 'none') {
            document.getElementById('options_button')?.click();
        }
        void run();
    });
    item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
    });
    original.after(item);
}

if (typeof ST.setSendButtonState !== 'function' || typeof ST.redisplayChat !== 'function') {
    console.error('[Regenerate Swipe] Unsupported SillyTavern version');
    toastr.error('재생성(스와이프): 이 실리태번 버전에는 필요한 확장 API가 없습니다.');
} else {
    installMenu();
    installHistoryViewer({ getContext, format: ST.messageFormatting,
        events: ST.eventSource, eventTypes: ST.event_types, renderPreview: renderPreviewJSR });
    const observer = new MutationObserver(installMenu);
    observer.observe(document.getElementById('options') || document.body, { childList: true, subtree: true });
}
