import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { db } from '../firebase-config.js';

/**
 * Subscribe to all conversations that include the given user.
 * @param {string} userId Firebase Auth UID of the current user.
 * @param {(conversations: Array<object>) => void} callback Invoked with ordered conversation snapshots.
 * @returns {() => void} Unsubscribe handler.
 */
export function subscribeUserConversations(userId, callback) {
  if (typeof userId !== 'string' || !userId.trim()) {
    console.warn('[messages-service] subscribeUserConversations requires a userId');
    return () => {};
  }
  if (typeof callback !== 'function') {
    console.warn('[messages-service] subscribeUserConversations requires a callback function');
    return () => {};
  }

  const normalizedUid = userId.trim();
  const conversationsRef = collection(db, 'conversations');
  const conversationsQuery = query(
    conversationsRef,
    where('participants', 'array-contains', normalizedUid),
    orderBy('lastMessageAt', 'desc')
  );

  return onSnapshot(
    conversationsQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      callback(items);
    },
    (error) => {
      console.warn('[messages-service] Failed to subscribe to conversations', error);
      callback([]);
    }
  );
}

/**
 * Subscribe to messages inside a conversation ordered by timestamp ascending.
 * @param {string} conversationId Conversation document ID.
 * @param {(messages: Array<object>) => void} callback Invoked with ordered messages.
 * @returns {() => void} Unsubscribe handler.
 */
export function subscribeConversationMessages(conversationId, callback) {
  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    console.warn('[messages-service] subscribeConversationMessages requires a conversationId');
    return () => {};
  }
  if (typeof callback !== 'function') {
    console.warn('[messages-service] subscribeConversationMessages requires a callback function');
    return () => {};
  }

  const messagesRef = collection(db, 'conversations', conversationId.trim(), 'messages');
  const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      callback(items);
    },
    (error) => {
      console.warn('[messages-service] Failed to subscribe to messages', error);
      callback([]);
    }
  );
}

/**
 * Append a chat message to a conversation.
 * @param {string} conversationId Conversation document ID.
 * @param {{ content: string, senderId: string, senderName: string }} payload Message payload.
 * @returns {Promise<string>} Resolves to the new message ID.
 */
export async function sendMessage(conversationId, payload) {
  const convId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!convId) {
    throw new Error('sendMessage requires a conversationId');
  }

  const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
  if (!content) {
    throw new Error('sendMessage requires non-empty content');
  }

  const senderId = typeof payload?.senderId === 'string' ? payload.senderId.trim() : '';
  if (!senderId) {
    throw new Error('sendMessage requires senderId');
  }

  const senderName =
    typeof payload?.senderName === 'string' && payload.senderName.trim()
      ? payload.senderName.trim()
      : 'User';

  try {
    const messagesRef = collection(db, 'conversations', convId, 'messages');
    const docRef = await addDoc(messagesRef, {
      content,
      senderId,
      senderName,
      timestamp: serverTimestamp(),
      system: false,
    });
    return docRef.id;
  } catch (error) {
    console.error('[messages-service] Failed to send message', error);
    throw error;
  }
}

/**
 * Reset the unread counter for the supplied user in a conversation.
 * @param {string} conversationId Conversation document ID.
 * @param {string} userId UID whose unread counter should be cleared.
 * @returns {Promise<void>} Resolves when the update completes.
 */
export async function markConversationRead(conversationId, userId) {
  const convId = typeof conversationId === 'string' ? conversationId.trim() : '';
  const normalizedUid = typeof userId === 'string' ? userId.trim() : '';
  if (!convId || !normalizedUid) {
    throw new Error('markConversationRead requires conversationId and userId');
  }

  try {
    const conversationRef = doc(db, 'conversations', convId);
    await updateDoc(conversationRef, {
      [`unreadCount.${normalizedUid}`]: 0,
    });
  } catch (error) {
    console.warn('[messages-service] Failed to mark conversation read', error);
    throw error;
  }
}
