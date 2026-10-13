export const LIMIT = 50;
export const copy = value => structuredClone(value);

function info(message) {
    return copy({ send_date: message.send_date, gen_started: message.gen_started,
        gen_finished: message.gen_finished, extra: message.extra || {} });
}

export function candidates(message) {
    const texts = message.swipes?.length ? [...message.swipes] : [message.mes];
    const selected = Number.isInteger(message.swipe_id)
        ? Math.max(0, Math.min(message.swipe_id, texts.length - 1)) : 0;
    texts[selected] = message.mes;
    return { selected, items: texts.map((text, i) => ({ text,
        info: i === selected ? info(message) : copy(message.swipe_info?.[i] || { extra: {} }),
    })) };
}

export function merge(oldMessage, newMessage) {
    const old = candidates(oldMessage);
    const fresh = candidates(newMessage);
    // Keep the selected old answer even when the user rerolls an early candidate.
    const room = Math.max(0, LIMIT - Math.min(fresh.items.length, LIMIT));
    let history = old.items.slice(-room);
    if (!room) history = [];
    else if (old.selected < old.items.length - room) {
        history = [old.items[old.selected], ...history.slice(-(room - 1))];
        if (room === 1) history = [old.items[old.selected]];
    }
    let freshStart = Math.max(0, fresh.items.length - LIMIT);
    let recent = fresh.items.slice(freshStart);
    let selected = fresh.selected - freshStart;
    if (selected < 0) {
        recent = [fresh.items[fresh.selected], ...recent.slice(1)];
        selected = 0;
    }
    const all = [...history, ...recent];
    newMessage.swipes = all.map(x => x.text);
    newMessage.swipe_info = all.map(x => x.info);
    newMessage.swipe_id = history.length + selected;
    return newMessage;
}

export function begin(context) {
    const index = context.chat.length - 1;
    const original = context.chat[index];
    if (context.groupId || !original || original.is_user || original.is_system ||
        original.extra?.tool_invocations) {
        throw new Error('1:1 채팅의 마지막 캐릭터 답변에서 사용해 주세요.');
    }
    return { key: context.getCurrentChatId(), character: context.characterId,
        index, original, backup: copy(original), prefix: context.chat.slice(0, index) };
}

// No pre-generation injection: only called AFTER native Generate has settled.
export function finish(transaction, context) {
    const t = transaction;
    if (context.getCurrentChatId() !== t.key || context.characterId !== t.character ||
        context.groupId || t.prefix.some((m, i) => context.chat[i] !== m)) {
        throw new Error('채팅이 바뀌어 자동 복원을 중단했습니다. 보관본을 다운로드해 주세요.');
    }
    if (context.chat.length === t.index + 1 && context.chat[t.index] === t.original) {
        return 'unchanged'; // Rejected before native deletion; do not duplicate.
    }
    if (context.chat.length === t.index) {
        context.chat.push(copy(t.backup));
        return 'restored';
    }
    const replacement = context.chat[t.index];
    if (context.chat.length !== t.index + 1 || !replacement || replacement.is_user ||
        replacement.is_system || replacement.name !== t.backup.name || replacement.extra?.tool_invocations) {
        throw new Error('생성 중 메시지 구조가 바뀌어 자동 병합을 중단했습니다. 보관본을 다운로드해 주세요.');
    }
    const hasContent = (replacement.mes || '').trim() && replacement.mes.trim() !== '...';
    const hasMedia = replacement.extra?.media?.length || replacement.extra?.image;
    if (!hasContent && !hasMedia) {
        context.chat[t.index] = copy(t.backup);
        return 'restored';
    }
    merge(t.backup, replacement);
    return 'merged';
}
