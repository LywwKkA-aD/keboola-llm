import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { DEFAULT_SETTINGS, type Settings } from '../../api/types.ts';
import { stubApi, stubEventSource } from '../../test-utils/fake-api.ts';
import { FakeNotification, stubNotification } from '../../test-utils/fake-notification.ts';
import { baseRoutes } from '../../test-utils/fixtures.ts';

const SWITCH = 'Уведомления на рабочем столе';
const BLOCKED = /Браузер блокирует уведомления для этого сайта/;

function openSettings(stored: Partial<Settings> = {}) {
  let current: Settings = { ...DEFAULT_SETTINGS, ...stored };
  const stub = stubApi({
    ...baseRoutes,
    'GET /api/settings': () => current,
    'PUT /api/settings': (body: unknown) => {
      current = { ...current, ...(body as Partial<Settings>) };
      return current;
    },
  });
  window.history.pushState({}, '', '/settings');
  render(<App />);
  return stub;
}

beforeEach(() => {
  stubEventSource();
});

describe('Notifications in Settings', () => {
  it('asks the browser when switched on and saves once it allows', async () => {
    stubNotification('default');
    const { callsTo } = openSettings();
    const toggle = await screen.findByRole('checkbox', { name: SWITCH });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(callsTo('PUT', '/api/settings').map((call) => call.body)).toEqual([{ desktopNotifications: true }]);
    expect(toggle).toBeChecked();
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  });

  it('explains when the browser blocks notifications and keeps the switch off', async () => {
    stubNotification('default');
    FakeNotification.answer = 'denied';
    const { callsTo } = openSettings();
    const toggle = await screen.findByRole('checkbox', { name: SWITCH });
    expect(screen.queryByText(BLOCKED)).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
    expect(callsTo('PUT', '/api/settings')).toHaveLength(0);
  });

  it('shows the switch off with the explanation when the setting is on but this browser blocks it', async () => {
    stubNotification('denied');
    openSettings({ desktopNotifications: true });
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: SWITCH })).not.toBeChecked();
  });

  it('switches off without asking the browser', async () => {
    stubNotification('granted');
    const { callsTo } = openSettings({ desktopNotifications: true });
    const toggle = await screen.findByRole('checkbox', { name: SWITCH });
    await vi.waitFor(() => expect(toggle).toBeChecked());

    await userEvent.click(toggle);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(callsTo('PUT', '/api/settings').map((call) => call.body)).toEqual([{ desktopNotifications: false }]);
    expect(toggle).not.toBeChecked();
  });

  it('says so when the browser cannot show notifications', async () => {
    vi.stubGlobal('Notification', undefined);
    openSettings();
    expect(await screen.findByRole('checkbox', { name: SWITCH })).toBeDisabled();
    expect(screen.getByText('Этот браузер не умеет показывать уведомления.')).toBeInTheDocument();
  });
});
