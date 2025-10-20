import { subscribeUserConversations } from '../js/messages-service.js';
import { userService } from '../js/user-service.js';
import { trapFocus, releaseFocus, closeOnEscape, closeOnOutsideClick } from './a11y-focus.js';

const BUTTON_ID = 'messagesButton';
const MENU_ID = 'messages-menu';
const BADGE_ID = 'messagesUnreadBadge';

let buttonElement = null;
let menuContainer = null;
let badgeElement = null;
let isMenuOpen = false;
let lastFocusedElement = null;
let trapCleanup = null;
let escapeCleanup = null;
let outsideCleanup = null;
let unsubscribeConversations = null;
let unreadTotal = 0;
let panelElement = null;

const MENU_FOCUS_SELECTOR =
  'a[href], button:not([disabled]), [role="menuitem"], [tabindex]:not([tabindex="-1"])';

function updateBadge(count) {
  if (!badgeElement) return;
  if (count > 0) {
    badgeElement.textContent = String(count);
    badgeElement.classList.remove('hidden');
  } else {
    badgeElement.textContent = '';
    badgeElement.classList.add('hidden');
  }
}

function renderMenu() {
  if (!menuContainer) return;
  menuContainer.innerHTML = '';

  const panel = document.createElement('div');
  panelElement = panel;
  panel.className =
    'w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg focus:outline-none';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Messages');
  panel.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'mb-2 flex items-center justify-between';
  const title = document.createElement('p');
  title.className = 'text-sm font-semibold text-neutral-700';
  title.textContent = 'Messages';
  const unread = document.createElement('span');
  unread.className = 'text-xs text-neutral-500';
  unread.textContent = unreadTotal > 0 ? `${unreadTotal} unread` : 'All caught up';
  unread.setAttribute('aria-live', 'polite');
  header.append(title, unread);

  const list = document.createElement('ul');
  list.setAttribute('role', 'none');
  list.className = 'space-y-1';

  const openItem = document.createElement('li');
  openItem.setAttribute('role', 'none');
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.setAttribute('role', 'menuitem');
  openButton.className =
    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
  openButton.textContent = 'Open messages center';
  openButton.addEventListener('click', () => {
    closeMenu({ returnFocus: false });
    window.location.href = 'messages.html';
  });
  openItem.appendChild(openButton);
  list.appendChild(openItem);

  panel.append(header, list);
  menuContainer.appendChild(panel);
}

function getFocusableElements() {
  if (!menuContainer) return [];
  return Array.from(menuContainer.querySelectorAll(MENU_FOCUS_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === panelElement
  );
}

function focusFirstItem() {
  const focusables = getFocusableElements();
  const target = focusables[0] || panelElement || menuContainer;
  if (target) {
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
    }
    target.focus();
  }
}

function openMenu() {
  if (!buttonElement || !menuContainer) return;
  if (isMenuOpen) return;
  isMenuOpen = true;
  lastFocusedElement = document.activeElement;
  renderMenu();
  menuContainer.hidden = false;
  menuContainer.classList.remove('hidden');
  buttonElement.setAttribute('aria-expanded', 'true');
  focusFirstItem();
  trapCleanup = trapFocus(panelElement || menuContainer);
  escapeCleanup = closeOnEscape(menuContainer, () => closeMenu());
  outsideCleanup = closeOnOutsideClick(menuContainer, () => closeMenu(), {
    ignore: [buttonElement],
  });
}

function closeMenu({ returnFocus = true } = {}) {
  if (!buttonElement || !menuContainer) return;
  if (!isMenuOpen) return;
  isMenuOpen = false;
  menuContainer.hidden = true;
  menuContainer.classList.add('hidden');
  buttonElement.setAttribute('aria-expanded', 'false');
  if (typeof trapCleanup === 'function') {
    trapCleanup();
    trapCleanup = null;
  }
  releaseFocus();
  if (typeof escapeCleanup === 'function') {
    escapeCleanup();
    escapeCleanup = null;
  }
  if (typeof outsideCleanup === 'function') {
    outsideCleanup();
    outsideCleanup = null;
  }
  if (returnFocus && buttonElement) {
    buttonElement.focus();
  } else if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function toggleMenu() {
  if (isMenuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

function handleAuthChange(user) {
  const uid = user && typeof user.uid === 'string' ? user.uid : '';
  if (typeof unsubscribeConversations === 'function') {
    unsubscribeConversations();
    unsubscribeConversations = null;
  }
  if (!uid) {
    unreadTotal = 0;
    updateBadge(0);
    if (isMenuOpen) {
      renderMenu();
    }
    return;
  }
  unsubscribeConversations = subscribeUserConversations(uid, (conversations) => {
    const total = Array.isArray(conversations)
      ? conversations.reduce((acc, conversation) => {
          const count = conversation?.unreadCount?.[uid];
          return acc + (typeof count === 'number' ? count : 0);
        }, 0)
      : 0;
    unreadTotal = total;
    updateBadge(unreadTotal);
    if (isMenuOpen) {
      renderMenu();
    }
  });
}

export function initMessagesMenu() {
  if (typeof document === 'undefined') return;

  buttonElement = document.getElementById(BUTTON_ID);
  menuContainer = document.getElementById(MENU_ID);
  badgeElement = document.getElementById(BADGE_ID);

  if (!buttonElement || !menuContainer) {
    return;
  }

  if (buttonElement.dataset.messagesInit === 'true') {
    return;
  }
  buttonElement.dataset.messagesInit = 'true';

  buttonElement.addEventListener('click', () => toggleMenu());
  buttonElement.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu();
    }
  });

  updateBadge(0);

  const previousHandler =
    typeof userService.onAuthStateChange === 'function'
      ? userService.onAuthStateChange.bind(userService)
      : null;

  userService.onAuthStateChange = (user, role, permissions) => {
    if (typeof previousHandler === 'function') {
      try {
        previousHandler(user, role, permissions);
      } catch (error) {
        console.error('[messages-menu] previous auth handler failed', error);
      }
    }
    handleAuthChange(user);
  };

  const current =
    typeof userService.getCurrentUser === 'function' ? userService.getCurrentUser() : null;
  if (current?.isAuthenticated && current.user?.uid) {
    handleAuthChange(current.user);
  }

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribeConversations === 'function') {
      unsubscribeConversations();
      unsubscribeConversations = null;
    }
  });
}
