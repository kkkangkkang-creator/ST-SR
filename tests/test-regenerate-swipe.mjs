import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, finish, merge, candidates } from '../core.mjs';

const message = (text = 'old') => ({ name: 'Character', is_user: false, mes: text,
    send_date: 'date', extra: { reasoning: `thinking-${text}`, model: 'test' } });
const ctx = () => ({ chat: [{ is_user: true, mes: 'request' }, message()],
    characterId: 1, groupId: null, getCurrentChatId: () => 'chat-1' });

test('native regeneration remains responsible for deletion, then history merges', () => {
    const c = ctx(); const t = begin(c);
    assert.equal(c.chat.length, 2); // begin must not mutate the real generation context
    c.chat.pop(); // native regenerate deletion
    assert.deepEqual(c.chat.map(x => x.mes), ['request']);
    c.chat.push(message('new'));
    assert.equal(finish(t, c), 'merged');
    assert.deepEqual(c.chat[1].swipes, ['old', 'new']);
    assert.equal(c.chat[1].swipe_id, 1);
    assert.equal(c.chat[1].swipe_info[0].extra.reasoning, 'thinking-old');
    assert.equal(c.chat[1].swipe_info[1].extra.reasoning, 'thinking-new');
});
test('100 rerolls retain exactly latest 50 answers with matching metadata', () => {
    const c = ctx();
    for (let i = 1; i <= 100; i++) {
        const t = begin(c); c.chat.pop(); c.chat.push(message(String(i))); finish(t, c);
    }
    const m = c.chat[1];
    assert.equal(m.swipes.length, 50);
    assert.equal(m.swipe_info.length, 50);
    assert.equal(m.swipes[0], '51');
    assert.equal(m.swipes[49], '100');
    assert.equal(m.swipe_id, 49);
});
test('edited selected answer replaces stale saved text and reasoning', () => {
    const old = { ...message('edited'), swipes: ['stale', 'other'], swipe_id: 0,
        swipe_info: [{ extra: { reasoning: 'stale' } }, { extra: { reasoning: 'other' } }] };
    const result = merge(old, message('new'));
    assert.deepEqual(result.swipes, ['edited', 'other', 'new']);
    assert.equal(result.swipe_info[0].extra.reasoning, 'thinking-edited');
    result.swipe_info[0].extra.reasoning = 'changed';
    assert.equal(old.extra.reasoning, 'thinking-edited');
});
test('rerolling old candidate at capacity retains that candidate', () => {
    const old = { ...message('first-edited'), swipes: Array.from({ length: 50 }, (_, i) => String(i)), swipe_id: 0 };
    const result = merge(old, message('new'));
    assert.equal(result.swipes.length, 50);
    assert.equal(result.swipes[0], 'first-edited');
    assert.equal(result.swipes.at(-1), 'new');
});
test('no response after native deletion restores entire original message', () => {
    const c = ctx(); const t = begin(c); c.chat.pop();
    assert.equal(finish(t, c), 'restored');
    assert.deepEqual(c.chat[1], t.backup);
});
test('empty/placeholder stream is restored, partial stream is retained', () => {
    for (const text of ['', '...', 'partially generated']) {
        const c = ctx(); const t = begin(c); c.chat.pop(); c.chat.push(message(text));
        const result = finish(t, c);
        assert.equal(result, text === 'partially generated' ? 'merged' : 'restored');
        assert.equal(c.chat[1].mes, text === 'partially generated' ? text : 'old');
    }
});
test('rejection before deletion never creates duplicate swipes', () => {
    const c = ctx(); const t = begin(c);
    assert.equal(finish(t, c), 'unchanged');
    assert.equal(c.chat[1].swipes, undefined);
});
test('chat switch and prefix replacement do not overwrite unrelated content', () => {
    const c = ctx(); const t = begin(c); c.getCurrentChatId = () => 'other';
    assert.throws(() => finish(t, c), /채팅이/);
    c.getCurrentChatId = () => 'chat-1'; c.chat[0] = { is_user: true, mes: 'another' };
    assert.throws(() => finish(t, c), /채팅이/);
    assert.equal(c.chat[0].mes, 'another');
});
test('multiple tool messages are never silently collapsed', () => {
    const c = ctx(); const t = begin(c); c.chat.pop();
    c.chat.push({ is_system: true, mes: 'tool' }, message('new'));
    assert.throws(() => finish(t, c), /구조/);
    assert.equal(c.chat.length, 3);
});
test('multi-response generation preserves new selection and metadata', () => {
    const fresh = { ...message('new-b'), swipes: ['new-a', 'new-b'], swipe_id: 1,
        swipe_info: [{ extra: { reasoning: 'A' } }, {}] };
    merge(message(), fresh);
    assert.deepEqual(fresh.swipes, ['old', 'new-a', 'new-b']);
    assert.equal(fresh.swipe_id, 2);
    assert.equal(fresh.swipe_info[1].extra.reasoning, 'A');
});
test('unsupported group and user-message targets reject before mutation', () => {
    const c = ctx(); c.groupId = 'group'; assert.throws(() => begin(c));
    c.groupId = null; c.chat[1].is_user = true; assert.throws(() => begin(c));
    assert.equal(c.chat.length, 2);
});
test('each candidate keeps its own translation, including updated selected translation', () => {
    const old = { ...message('original B'), swipes: ['original A', 'original B'], swipe_id: 1,
        swipe_info: [{ extra: { display_text: '번역 A' } }, { extra: { display_text: '이전 번역 B' } }],
        extra: { display_text: '수정 번역 B', reasoning_display_text: '번역된 추론 B' } };
    const fresh = { ...message('original C'), extra: { display_text: '번역 C' } };
    merge(old, fresh);
    assert.deepEqual(fresh.swipe_info.map(x => x.extra.display_text), ['번역 A', '수정 번역 B', '번역 C']);
    assert.equal(fresh.swipe_info[1].extra.reasoning_display_text, '번역된 추론 B');
    assert.equal(fresh.mes, 'original C');
});
