import type { AutomationLogStepResult } from '@/types';

export interface AutomationEmailLog {
  id: string;
  automation_id: string;
  created_at: string;
  steps_executed: AutomationLogStepResult[];
}

export function automationEmailHistory(
  logs: AutomationEmailLog[],
  automationNames: Map<string, string>
) {
  return logs.flatMap((log) =>
    (Array.isArray(log.steps_executed) ? log.steps_executed : [])
      .filter(
        (step) =>
          step.step_type === 'send_email' &&
          step.status === 'success' &&
          typeof step.detail === 'string' &&
          step.detail.startsWith('email sent to ')
      )
      .map((step, index) => ({
        id: `${log.id}:${index}`,
        automation_name: automationNames.get(log.automation_id) ?? null,
        recipient: step.email_delivery?.recipient ?? step.detail!.slice('email sent to '.length),
        subject: step.email_delivery?.subject ?? null,
        date: step.email_delivery?.sent_at ?? log.created_at,
        date_is_run_start: !step.email_delivery?.sent_at,
      }))
  );
}
