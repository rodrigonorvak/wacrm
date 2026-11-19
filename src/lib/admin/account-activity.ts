export interface ActivityContact {
  account_id: string;
  /** True when the contact carries the Anúncio label. */
  ad?: boolean;
}

export interface ActivityDeal {
  account_id: string;
  value: number;
  stage: string;
}

export interface ActivityBroadcast {
  account_id: string;
  sent_count: number;
}

export interface AccountActivity {
  leads: number;
  leads_ad: number;
  leads_organic: number;
  appointments: number;
  broadcasts: number;
  emails: number;
  deal_value: number;
  stages: Array<{ name: string; count: number; value: number }>;
}

export interface ActivityInput {
  contacts: ActivityContact[];
  deals: ActivityDeal[];
  appointments: ActivityContact[];
  broadcasts: ActivityBroadcast[];
  emails: ActivityContact[];
}

export function summarizeAccountActivity(accountId: string, input: ActivityInput): AccountActivity {
  const deals = input.deals.filter((deal) => deal.account_id === accountId);
  const stages = new Map<string, { count: number; value: number }>();
  for (const deal of deals) {
    const current = stages.get(deal.stage) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += deal.value;
    stages.set(deal.stage, current);
  }

  const contacts = input.contacts.filter((row) => row.account_id === accountId);
  const leadsAd = contacts.filter((row) => row.ad).length;

  return {
    leads: contacts.length,
    leads_ad: leadsAd,
    leads_organic: contacts.length - leadsAd,
    appointments: input.appointments.filter((row) => row.account_id === accountId).length,
    broadcasts: input.broadcasts
      .filter((row) => row.account_id === accountId)
      .reduce((total, row) => total + row.sent_count, 0),
    emails: input.emails.filter((row) => row.account_id === accountId).length,
    deal_value: deals.reduce((total, deal) => total + deal.value, 0),
    stages: [...stages.entries()].map(([name, stats]) => ({ name, count: stats.count, value: stats.value })),
  };
}
