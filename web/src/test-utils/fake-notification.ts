import { vi } from 'vitest';

/** Notification stand-in: records what the app shows and answers permission requests as told. */
export class FakeNotification {
  static permission: NotificationPermission = 'default';
  /** What the next permission prompt answers. */
  static answer: NotificationPermission = 'granted';
  static instances: FakeNotification[] = [];
  static readonly requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
    FakeNotification.permission = FakeNotification.answer;
    return FakeNotification.permission;
  });

  readonly title: string;
  readonly options: NotificationOptions;
  onclick: ((event: Event) => void) | null = null;
  closed = false;

  constructor(title: string, options: NotificationOptions = {}) {
    this.title = title;
    this.options = options;
    FakeNotification.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  click(): void {
    this.onclick?.(new Event('click'));
  }
}

export function stubNotification(permission: NotificationPermission = 'default'): typeof FakeNotification {
  FakeNotification.permission = permission;
  FakeNotification.answer = 'granted';
  FakeNotification.instances = [];
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
  return FakeNotification;
}

/** Make the page look hidden (another tab or app in front) or visible, and tell listeners. */
export function setPageHidden(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Back to the environment's own visibility. */
export function resetPageVisibility(): void {
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(document, 'hidden');
}
