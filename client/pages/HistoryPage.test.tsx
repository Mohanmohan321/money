// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryPage } from './HistoryPage';

const incomeId = '00000000-0000-4000-8000-000000000009';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HistoryPage Income records', () => {
  it('renders Income semantics, applies the Income filter, and deletes through its resource API', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === 'string'
        ? input
        : input instanceof URL
          ? `${input.pathname}${input.search}`
          : input.url;
      const method = init?.method ?? 'GET';
      calls.push({ path, method });

      if (path.startsWith('/api/history')) {
        return jsonResponse({
          success: true,
          data: {
            items: [{
              id: incomeId,
              type: 'income',
              source: 'Freelance site',
              category: 'freelance',
              amount: '5000.00',
              createdAt: '2026-09-02T12:00:00.000Z',
            }],
            total: 1,
            limit: 50,
            offset: 0,
          },
        });
      }
      if (path === `/api/income/${incomeId}` && method === 'DELETE') {
        return jsonResponse({ success: true, data: { deleted: true } });
      }
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();

    render(<HistoryPage />);

    const article = (await screen.findByText('Freelance site')).closest('article');
    expect(article).not.toBeNull();
    expect(within(article!).getByText('5000.00')).toBeVisible();
    expect(within(article!).getByText(/Income · Freelance ·/)).toBeVisible();
    expect(article!.querySelector('svg.lucide-circle-dollar-sign')).not.toBeNull();

    await user.selectOptions(screen.getByLabelText('Type'), 'income');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        path: '/api/history?limit=50&offset=0&type=income',
        method: 'GET',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Delete Freelance site' }));
    await waitFor(() => {
      expect(calls).toContainEqual({ path: `/api/income/${incomeId}`, method: 'DELETE' });
    });
    expect(screen.queryByText('Freelance site')).not.toBeInTheDocument();
  });
});
