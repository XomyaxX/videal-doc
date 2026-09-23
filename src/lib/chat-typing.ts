const TTL_MS = 4000;
const typing = new Map<string, Map<string, number>>();

export function setTyping(chatId: string, userId: string) {
  let room = typing.get(chatId);
  if (!room) {
    room = new Map();
    typing.set(chatId, room);
  }
  room.set(userId, Date.now() + TTL_MS);
}

export function typingUserIds(chatId: string, exceptUserId: string) {
  const room = typing.get(chatId);
  if (!room) return [];
  const now = Date.now();
  const ids: string[] = [];
  for (const [id, exp] of room) {
    if (exp < now) room.delete(id);
    else if (id !== exceptUserId) ids.push(id);
  }
  if (!room.size) typing.delete(chatId);
  return ids;
}
