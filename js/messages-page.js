import { userService } from './user-service.js';
import {
  subscribeUserConversations,
  subscribeConversationMessages,
  sendMessage,
  markConversationRead,
} from './messages-service.js';

const state = {
  currentUser: null,
  conversations: [],
  selectedConversationId: null,
  pendingConversationId: null,
  unsubscribeConversations: null,
  unsubscribeMessages: null,
};

const elements = {
  conversationsList: document.getElementById('conversationsList'),
  conversationsEmpty: document.getElementById('conversationsEmptyState'),
  conversationsStatus: document.getElementById('conversationsStatus'),
  messagesContainer: document.getElementById('messagesContainer'),
  messageForm: document.getElementById('messageComposer'),
  messageInput: document.getElementById('messageInput'),
  sendButton: document.getElementById('sendMessageButton'),
  chatTitle: document.getElementById('chatTitle'),
  chatSubtitle: document.getElementById('chatSubtitle'),
};

const urlParams = new URLSearchParams(window.location.search);
const initialConversationId = urlParams.get('conv')
  ? urlParams.get('conv').trim()
  : '';
if (initialConversationId) {
  state.pendingConversationId = initialConversationId;
}

if (state.pendingConversationId) {
  elements.chatTitle.textContent = 'Loading conversation…';
  elements.chatSubtitle.textContent = 'Fetching messages for this report.';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  } catch (_error) {
    return '';
  }
}

function getConversationLabel(conversation) {
  if (!conversation) return 'Conversation';
  const { siteName, shiftDate, participants } = conversation;
  if (siteName && shiftDate) {
    return `${siteName} � ${shiftDate}`;
  }
  if (siteName) return siteName;
  if (shiftDate) return shiftDate;

  if (Array.isArray(participants) && state.currentUser?.uid) {
    const others = participants.filter((uid) => uid && uid !== state.currentUser.uid);
    if (others.length) {
      return others.join(', ');
    }
  }
  return 'Conversation';
}

function renderConversations() {
  const { conversationsList, conversationsEmpty } = elements;
  conversationsList.innerHTML = '';

  if (!state.conversations.length) {
    conversationsEmpty.classList.remove('hidden');
    return;
  }

  conversationsEmpty.classList.add('hidden');

  state.conversations.forEach((conversation) => {
    const unread =
      typeof conversation?.unreadCount?.[state.currentUser?.uid] === 'number'
        ? conversation.unreadCount[state.currentUser.uid]
        : 0;

    const isActive = conversation.id === state.selectedConversationId;

    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.conversationId = conversation.id;
    button.className = `w-full rounded-xl border border-transparent px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 hover:bg-neutral-100 ${
      isActive ? 'bg-neutral-100' : 'bg-white'
    }`;
    button.setAttribute('aria-pressed', String(isActive));

    const unreadBadge =
      unread > 0
        ? `<span class="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">${unread}</span>`
        : '';

    button.innerHTML = `
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-neutral-900">${getConversationLabel(conversation)}</p>
          <p class="mt-1 line-clamp-1 text-xs text-neutral-500">
            ${conversation.lastMessagePreview || 'Open to view conversation'}
          </p>
        </div>
        ${unreadBadge}
      </div>
      <p class="mt-2 text-right text-[0.7rem] uppercase tracking-wide text-neutral-400">${formatTimestamp(
        conversation.lastMessageAt
      )}</p>
    `;

    button.addEventListener('click', () => selectConversation(conversation.id));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectConversation(conversation.id);
      }
    });

    item.appendChild(button);
    conversationsList.appendChild(item);
  });
}

function renderMessages(messages) {
  const container = elements.messagesContainer;
  container.innerHTML = '';

  if (!messages || !messages.length) {
    const emptyState = document.createElement('div');
    emptyState.className =
      'rounded-lg bg-white px-4 py-6 text-center text-sm text-neutral-500 shadow-sm';
    emptyState.textContent = 'No messages yet. Start the conversation below.';
    container.appendChild(emptyState);
    return;
  }

  messages.forEach((message) => {
    const isCurrentUser = message.senderId === state.currentUser?.uid;
    const isSystem = Boolean(message.system);

    const row = document.createElement('div');
    row.className = `flex w-full ${isSystem ? 'justify-center' : isCurrentUser ? 'justify-end' : 'justify-start'}`;

    const bubble = document.createElement('div');
    bubble.className = [
      'max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm',
      isSystem
        ? 'bg-neutral-200 text-neutral-600'
        : isCurrentUser
          ? 'bg-blue-600 text-white'
          : 'bg-white text-neutral-900',
    ].join(' ');

    if (!isSystem) {
      const sender = document.createElement('p');
      sender.className = `mb-1 text-xs font-semibold ${
        isCurrentUser ? 'text-white/80' : 'text-neutral-500'
      }`;
      sender.textContent = message.senderName || 'Teammate';
      bubble.appendChild(sender);
    }

    const content = document.createElement('p');
    content.className = 'whitespace-pre-wrap break-words';
    content.textContent = message.content || '';
    bubble.appendChild(content);

    const timestamp = document.createElement('p');
    timestamp.className = `mt-1 text-[0.65rem] ${
      isSystem ? 'text-neutral-500' : isCurrentUser ? 'text-white/70' : 'text-neutral-400'
    }`;
    timestamp.textContent = formatTimestamp(message.timestamp);
    bubble.appendChild(timestamp);

    row.appendChild(bubble);
    container.appendChild(row);
  });

  container.scrollTop = container.scrollHeight;
}

function updateChatHeader(conversation) {
  if (!conversation) {
    elements.chatTitle.textContent = 'Select a conversation';
    elements.chatSubtitle.textContent = 'Choose a conversation to view messages.';
    return;
  }

  elements.chatTitle.textContent = getConversationLabel(conversation);
  const participantSummary = Array.isArray(conversation.participants)
    ? conversation.participants.length === 1
      ? '1 participant'
      : `${conversation.participants.length} participants`
    : '';
  const subtitle = [conversation.shiftDate, participantSummary].filter(Boolean).join(' � ');
  elements.chatSubtitle.textContent = subtitle || 'Conversation details';
}

function detachMessagesSubscription() {
  if (typeof state.unsubscribeMessages === 'function') {
    state.unsubscribeMessages();
  }
  state.unsubscribeMessages = null;
}

function selectConversation(conversationId) {
  if (!conversationId || state.selectedConversationId === conversationId) {
    return;
  }

  state.selectedConversationId = conversationId;
  renderConversations();

  const conversation = state.conversations.find((item) => item.id === conversationId) || null;
  updateChatHeader(conversation);
  renderMessages([]);

  if (!conversation || !state.currentUser?.uid) {
    return;
  }

  markConversationRead(conversationId, state.currentUser.uid).catch((error) => {
    console.warn('[messages-page] Failed to mark conversation read', error);
  });

  detachMessagesSubscription();
  state.unsubscribeMessages = subscribeConversationMessages(conversationId, (messages) => {
    renderMessages(messages);
    if (state.currentUser?.uid) {
      markConversationRead(conversationId, state.currentUser.uid).catch(() => {});
    }
  });
}

function handleConversationsUpdate(conversations) {
  const sorted = Array.isArray(conversations)
    ? [...conversations].sort((a, b) => {
        const aTime = a?.lastMessageAt?.toMillis
          ? a.lastMessageAt.toMillis()
          : a?.lastMessageAt || 0;
        const bTime = b?.lastMessageAt?.toMillis
          ? b.lastMessageAt.toMillis()
          : b?.lastMessageAt || 0;
        return bTime - aTime;
      })
    : [];

  state.conversations = sorted;
  elements.conversationsStatus.textContent = sorted.length
    ? `${sorted.length} conversation${sorted.length === 1 ? '' : 's'}`
    : 'No conversations';

  if (state.selectedConversationId) {
    const exists = sorted.some((item) => item.id === state.selectedConversationId);
    if (!exists) {
      state.selectedConversationId = null;
      updateChatHeader(null);
      renderMessages([]);
      detachMessagesSubscription();
    }
  }

  renderConversations();

  if (state.pendingConversationId) {
    const pendingExists = sorted.some((item) => item.id === state.pendingConversationId);
    if (pendingExists) {
      const pendingId = state.pendingConversationId;
      state.pendingConversationId = null;
      selectConversation(pendingId);
      return;
    }
  }

  if (!state.selectedConversationId && !state.pendingConversationId && sorted.length) {
    selectConversation(sorted[0].id);
  }
}

function handleMessageFormSubmit(event) {
  event.preventDefault();

  if (!state.selectedConversationId || !state.currentUser?.uid) {
    return;
  }

  const content = elements.messageInput.value.trim();
  if (!content) {
    return;
  }

  elements.sendButton.disabled = true;

  const senderName = state.currentUser.displayName || state.currentUser.email || 'You';

  sendMessage(state.selectedConversationId, {
    content,
    senderId: state.currentUser.uid,
    senderName,
  })
    .then(() => {
      elements.messageInput.value = '';
      elements.messageInput.focus();
      updateSendButtonState();
    })
    .catch((error) => {
      console.error('[messages-page] Failed to send message', error);
      elements.conversationsStatus.textContent = 'Failed to send message';
      setTimeout(() => {
        elements.conversationsStatus.textContent = '';
      }, 3000);
    })
    .finally(() => {
      elements.sendButton.disabled = false;
    });
}

function updateSendButtonState() {
  const hasContent = Boolean(elements.messageInput.value.trim());
  elements.sendButton.disabled = !hasContent;
}

function initEventHandlers() {
  elements.messageInput.addEventListener('input', updateSendButtonState);
  elements.messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      elements.messageForm.requestSubmit();
    }
  });
  elements.messageForm.addEventListener('submit', handleMessageFormSubmit);
}

async function initializePage() {
  try {
    const authResult = await userService.initializeAuthGuard();
    if (!authResult.authenticated) {
      elements.conversationsStatus.textContent = 'Redirecting to sign in�';
      return;
    }

    state.currentUser = authResult.user;
    initEventHandlers();
    updateSendButtonState();

    elements.conversationsStatus.textContent = 'Loading conversations…';

    state.unsubscribeConversations = subscribeUserConversations(authResult.user.uid, (items) => {
      handleConversationsUpdate(items);
    });
  } catch (error) {
    console.error('[messages-page] Failed to initialize', error);
    elements.conversationsStatus.textContent = 'Unable to load conversations';
  }
}

function teardown() {
  if (typeof state.unsubscribeConversations === 'function') {
    state.unsubscribeConversations();
  }
  detachMessagesSubscription();
}

document.addEventListener('DOMContentLoaded', initializePage);
window.addEventListener('beforeunload', teardown);
