const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let activeTrapCleanup = null;

function isVisible(element) {
  return (
    element &&
    typeof element.getClientRects === 'function' &&
    element.getClientRects().length > 0 &&
    window.getComputedStyle(element).visibility !== 'hidden'
  );
}

export function trapFocus(containerEl) {
  if (!containerEl) {
    return () => {};
  }

  const focusable = Array.from(containerEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) =>
    isVisible(el)
  );

  const first = focusable[0] || containerEl;
  const last = focusable[focusable.length - 1] || containerEl;

  function handleKeydown(event) {
    if (event.key !== 'Tab') {
      return;
    }

    if (focusable.length === 0) {
      event.preventDefault();
      containerEl.focus();
      return;
    }

    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === containerEl) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (typeof activeTrapCleanup === 'function') {
    activeTrapCleanup();
  }

  containerEl.addEventListener('keydown', handleKeydown);

  const cleanup = () => {
    containerEl.removeEventListener('keydown', handleKeydown);
    if (activeTrapCleanup === cleanup) {
      activeTrapCleanup = null;
    }
  };

  activeTrapCleanup = cleanup;

  return cleanup;
}

export function releaseFocus() {
  if (typeof activeTrapCleanup === 'function') {
    activeTrapCleanup();
    activeTrapCleanup = null;
  }
}

export function closeOnEscape(containerEl, onClose) {
  if (!containerEl || typeof onClose !== 'function') {
    return () => {};
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    if (
      containerEl.contains(event.target) ||
      containerEl === event.target ||
      containerEl.contains(document.activeElement)
    ) {
      event.preventDefault();
      onClose();
    }
  }

  document.addEventListener('keydown', handleKeydown, true);

  return () => {
    document.removeEventListener('keydown', handleKeydown, true);
  };
}

export function closeOnOutsideClick(containerEl, onClose, { ignore = [] } = {}) {
  if (!containerEl || typeof onClose !== 'function') {
    return () => {};
  }

  const ignoreElements = Array.isArray(ignore) ? ignore : [ignore].filter(Boolean);

  function handler(event) {
    const target = event.target;
    const isIgnored = ignoreElements.some((el) => el && (el === target || el.contains(target)));
    if (isIgnored) {
      return;
    }

    if (!containerEl.contains(target)) {
      onClose();
    }
  }

  document.addEventListener('mousedown', handler, true);
  document.addEventListener('touchstart', handler, true);

  return () => {
    document.removeEventListener('mousedown', handler, true);
    document.removeEventListener('touchstart', handler, true);
  };
}
