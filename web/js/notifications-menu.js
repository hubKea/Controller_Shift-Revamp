// TODO: integrate end-to-end test once test:e2e is added to package.json

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { coerceDate, formatRelativeTime } from './notifications-utils.js';
import { trapFocus, releaseFocus, closeOnEscape, closeOnOutsideClick } from './a11y-focus.js';

const MENU_ID = 'notifications-menu';
const BUTTON_ID = 'btn-notifications';
const BADGE_ID = 'notifications-unread-badge';

let cachedAuth = null;
let cachedDb = null;
let unsubscribeNotifications = null;
let currentUid = null;
let isMenuOpen = false;
let lastFocusedElement = null;
let focusableItems = [];
let buttonElement = null;
let menuContainer = null;
let badgeElement = null;
let snapshotItems = [];
let panelElement = null;
let trapCleanup = null;
let escapeCleanup = null;
let outsideCleanup = null;

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

function clearMenuContent() {
  if (!menuContainer) return;
  menuContainer.innerHTML = '';
}

function getFocusableMenuItems() {
  if (!menuContainer) return [];
  return Array.from(menuContainer.querySelectorAll('[role="menuitem"]'));
}

function openMenu() {
  if (!menuContainer || !buttonElement) return;
  if (isMenuOpen) return;
  isMenuOpen = true;
  lastFocusedElement = document.activeElement;
  renderNotifications(snapshotItems);
  menuContainer.hidden = false;
  menuContainer.classList.remove('hidden');
  buttonElement.setAttribute('aria-expanded', 'true');
  focusableItems = getFocusableMenuItems();
  const focusTarget = focusableItems.length ? focusableItems[0] : panelElement || menuContainer;
  if (focusTarget) {
    if (!focusTarget.hasAttribute('tabindex')) {
      focusTarget.tabIndex = -1;
    }
    focusTarget.focus();
  }
  trapCleanup = trapFocus(panelElement || menuContainer);
  escapeCleanup = closeOnEscape(menuContainer, () => closeMenu());
  outsideCleanup = closeOnOutsideClick(menuContainer, () => closeMenu(), {
    ignore: [buttonElement],
  });
}

function closeMenu({ returnFocus = true } = {}) {
  if (!menuContainer || !buttonElement) return;
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
  panelElement = null;
  focusableItems = [];
  if (returnFocus && buttonElement) {
    buttonElement.focus();
  } else if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function handleItemActivation(item) {
  if (!cachedDb || !currentUid || !item) return;

  const navigateToHref = typeof item.href === 'string' && item.href;
  const markReadPromise =
    item.unread && item.id
      ? updateDoc(doc(cachedDb, 'inboxes', currentUid, 'items', item.id), { unread: false })
      : Promise.resolve();

  markReadPromise
    .catch((error) => {
      console.error('Failed to mark notification as read:', error);
    })
    .finally(() => {
      closeMenu({ returnFocus: !navigateToHref });
      if (navigateToHref) {
        window.location.href = navigateToHref;
      }
    });
}

function renderNotifications(items) {
  if (!menuContainer) return;
  clearMenuContent();

  const panel = document.createElement('div');
  panelElement = panel;
  panel.className =
    'max-h-96 w-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg focus:outline-none';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Notifications');
  panel.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-2 pb-2';
  const heading = document.createElement('p');
  heading.className = 'text-sm font-semibold text-neutral-700';
  heading.textContent = 'Notifications';
  header.appendChild(heading);

  panel.appendChild(header);

  if (!items.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'px-3 py-6 text-center text-sm text-neutral-500';
    emptyState.textContent = "You're all caught up!";
    panel.appendChild(emptyState);
    menuContainer.appendChild(panel);
    focusableItems = [];
    if (isMenuOpen) {
      if (typeof trapCleanup === 'function') {
        trapCleanup();
      }
      trapCleanup = trapFocus(panelElement || menuContainer);
    }
    return;
  }

  const list = document.createElement('ul');
  list.setAttribute('role', 'none');
  list.className = 'space-y-1';

  items.forEach((item) => {
    const listItem = document.createElement('li');
    listItem.setAttribute('role', 'none');

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    button.className = [
      'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
      item.unread
        ? 'bg-blue-50 text-neutral-900 font-semibold'
        : 'text-neutral-600 hover:bg-neutral-50',
    ].join(' ');

    button.addEventListener('click', () => handleItemActivation(item));

    const dot = document.createElement('span');
    dot.className = [
      'mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full',
      item.unread ? 'bg-blue-500' : 'border border-neutral-300 bg-transparent',
    ].join(' ');
    dot.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    content.className = 'flex flex-col gap-1';

    const title = document.createElement('span');
    title.className = 'text-sm leading-5';
    title.textContent = item.title || item.body || 'Notification';

    const secondary = document.createElement('span');
    secondary.className = 'text-xs text-neutral-500';
    secondary.textContent = formatRelativeTime(item.createdAt);

    if (item.title && item.body && item.body !== item.title) {
      const body = document.createElement('span');
      body.className = 'text-sm font-normal text-neutral-600';
      body.textContent = item.body;
      content.append(title, body, secondary);
    } else {
      content.append(title, secondary);
    }

    button.append(dot, content);
    listItem.appendChild(button);
    list.appendChild(listItem);
  });

  panel.appendChild(list);
  menuContainer.appendChild(panel);
  focusableItems = getFocusableMenuItems();
  if (isMenuOpen) {
    const nextFocusTarget = focusableItems.length
      ? focusableItems[0]
      : panelElement || menuContainer;
    if (nextFocusTarget) {
      if (!nextFocusTarget.hasAttribute('tabindex')) {
        nextFocusTarget.tabIndex = -1;
      }
      nextFocusTarget.focus();
    }
    if (typeof trapCleanup === 'function') {
      trapCleanup();
    }
    trapCleanup = trapFocus(panelElement || menuContainer);
  }
}

function transformSnapshot(snapshot) {
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      ref: docSnap.ref,
      title: typeof data.title === 'string' ? data.title : null,
      body: typeof data.body === 'string' ? data.body : null,
      unread: data.unread !== false,
      createdAt: coerceDate(data.createdAt),
      href: typeof data.href === 'string' ? data.href : '',
      type: data.type || 'notification',
    };
  });
}

function handleSnapshot(snapshot) {
  snapshotItems = transformSnapshot(snapshot);
  renderNotifications(snapshotItems);
  const unreadCount = snapshotItems.filter((item) => item.unread).length;
  updateBadge(unreadCount);
}

function handleSnapshotError(error) {
  console.error('Failed to load notifications:', error);
  snapshotItems = [];
  renderNotifications([]);
  updateBadge(0);
}

function detachInboxListener() {
  if (unsubscribeNotifications) {
    unsubscribeNotifications();
    unsubscribeNotifications = null;
  }
}

function attachInboxListener(uid) {
  if (!cachedDb || !uid) return;
  detachInboxListener();
  const itemsRef = collection(cachedDb, 'inboxes', uid, 'items');
  const inboxQuery = query(itemsRef, orderBy('createdAt', 'desc'), limit(10));
  unsubscribeNotifications = onSnapshot(inboxQuery, handleSnapshot, handleSnapshotError);
}

function resetInterface() {
  snapshotItems = [];
  renderNotifications([]);
  updateBadge(0);
  closeMenu({ returnFocus: false });
}

export function initNotificationsMenu(auth, db) {
  if (typeof document === 'undefined') {
    return;
  }

  buttonElement = document.getElementById(BUTTON_ID);
  menuContainer = document.getElementById(MENU_ID);
  badgeElement = document.getElementById(BADGE_ID);

  if (!buttonElement || !menuContainer) {
    return;
  }

  if (buttonElement.dataset.notificationsInit === 'true') {
    return;
  }
  buttonElement.dataset.notificationsInit = 'true';

  cachedAuth = auth || null;
  cachedDb = db || null;

  const toggleMenu = () => {
    if (isMenuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  buttonElement.addEventListener('click', () => toggleMenu());
  buttonElement.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu();
    }
  });

  resetInterface();

  if (!cachedAuth) {
    console.warn('Notifications menu requires a Firebase Auth instance.');
    return;
  }

  cachedAuth.onAuthStateChanged((user) => {
    detachInboxListener();
    currentUid = user && typeof user.uid === 'string' ? user.uid : null;
    if (!currentUid) {
      resetInterface();
      return;
    }
    attachInboxListener(currentUid);
  });
}

export { formatRelativeTime };
