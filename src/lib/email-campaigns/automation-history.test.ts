import { describe, expect, it } from 'vitest';
import { automationEmailHistory, type AutomationEmailLog } from './automation-history';

describe('automationEmailHistory', () => {
  it('shows successful sends even when the overall run failed and ignores skips and failures', () => {
    const logs: AutomationEmailLog[] = [{
      id: 'log-1',
      automation_id: 'automation-1',
      created_at: '2026-01-01T10:00:00Z',
      steps_executed: [
        { step_id: '1', step_type: 'send_email', status: 'success', detail: 'email sent to old@example.com' },
        { step_id: '2', step_type: 'send_email', status: 'success', detail: 'email skipped: recipient unsubscribed' },
        { step_id: '3', step_type: 'send_email', status: 'failed', detail: 'SMTP failed' },
        {
          step_id: '4', step_type: 'send_email', status: 'success',
          detail: 'email sent to new@example.com',
          email_delivery: { recipient: 'new@example.com', subject: 'Hello', sent_at: '2026-01-02T10:00:00Z' },
        },
      ],
    }];

    expect(automationEmailHistory(logs, new Map([['automation-1', 'Welcome']]))).toEqual([
      {
        id: 'log-1:0', automation_name: 'Welcome', recipient: 'old@example.com',
        subject: null, date: '2026-01-01T10:00:00Z', date_is_run_start: true,
      },
      {
        id: 'log-1:1', automation_name: 'Welcome', recipient: 'new@example.com',
        subject: 'Hello', date: '2026-01-02T10:00:00Z', date_is_run_start: false,
      },
    ]);
  });

  it('does not confuse other step types with sent emails', () => {
    expect(automationEmailHistory([{
      id: 'log', automation_id: 'missing', created_at: '2026-01-01T00:00:00Z',
      steps_executed: [{ step_id: '1', step_type: 'send_message', status: 'success', detail: 'email sent to x@y.com' }],
    }], new Map())).toEqual([]);
  });
});
