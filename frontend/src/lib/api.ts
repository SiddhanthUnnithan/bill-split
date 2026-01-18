const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface BillCreateResponse {
  id: string;
  creator_token: string;
  share_token: string;
}

export interface Bill {
  id: string;
  creator_token: string;
  share_token: string;
  status: 'editing' | 'active' | 'complete';
  image_url: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
}

export async function uploadBill(file: File): Promise<BillCreateResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/bills/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to upload bill');
  }

  return response.json();
}

export async function getBillByCreatorToken(creatorToken: string): Promise<Bill> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch bill');
  }

  return response.json();
}

export interface BillItem {
  id: string;
  bill_id: string;
  name: string;
  price: number;
}

export interface ParsedBillResponse {
  items: BillItem[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
}

export interface BillWithItems extends Bill {
  items: BillItem[];
}

export async function parseBill(creatorToken: string): Promise<ParsedBillResponse> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/parse`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to parse bill');
  }

  return response.json();
}

export async function getBillWithItems(creatorToken: string): Promise<BillWithItems> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/full`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch bill');
  }

  return response.json();
}

export async function updateItem(
  creatorToken: string,
  itemId: string,
  data: { name: string; price: number }
): Promise<BillItem> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update item');
  }

  return response.json();
}

export async function deleteItem(creatorToken: string, itemId: string): Promise<void> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/items/${itemId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete item');
  }
}

export async function updateBillTotals(
  creatorToken: string,
  data: { subtotal: number | null; tax: number | null; tip: number | null }
): Promise<Bill> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/totals`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update totals');
  }

  return response.json();
}

export interface ConfirmBillResponse {
  bill: Bill;
  participant_token: string;
}

export async function confirmBill(creatorToken: string): Promise<ConfirmBillResponse> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/confirm`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to confirm bill');
  }

  return response.json();
}

// ============ Participant API ============

export interface ItemWithClaims {
  id: string;
  name: string;
  price: number;
  claimed_by: string[];
}

export interface ParticipantBill {
  id: string;
  share_token: string;
  status: 'editing' | 'active' | 'complete';
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  items: ItemWithClaims[];
  participants: { id: string; name: string | null; status: string }[];
}

export interface ParticipantSession {
  participant_id: string;
  participant_token: string;
}

export interface MyClaimsResponse {
  participant_id: string;
  name: string | null;
  status: string;
  claimed_item_ids: string[];
}

export async function getBillByShareToken(shareToken: string): Promise<ParticipantBill> {
  const response = await fetch(`${API_URL}/bills/share/${shareToken}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch bill');
  }

  return response.json();
}

export async function joinBill(shareToken: string): Promise<ParticipantSession> {
  const response = await fetch(`${API_URL}/bills/share/${shareToken}/join`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to join bill');
  }

  return response.json();
}

export async function updateClaims(
  shareToken: string,
  participantToken: string,
  itemIds: string[]
): Promise<void> {
  const response = await fetch(
    `${API_URL}/bills/share/${shareToken}/participant/${participantToken}/claims`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update claims');
  }
}

export async function getMyClaims(
  shareToken: string,
  participantToken: string
): Promise<MyClaimsResponse> {
  const response = await fetch(
    `${API_URL}/bills/share/${shareToken}/participant/${participantToken}/claims`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch claims');
  }

  return response.json();
}

export async function submitParticipant(
  shareToken: string,
  participantToken: string,
  name: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/bills/share/${shareToken}/participant/${participantToken}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to submit');
  }
}

// ============ Creator Dashboard & Completion ============

export interface ParticipantSummary {
  id: string;
  name: string | null;
  status: string;
  items_total: number;
  claimed_items: string[];
}

export interface CreatorDashboard {
  bill: Bill;
  items: BillItem[];
  participants: ParticipantSummary[];
}

export interface FinalSplit {
  name: string;
  items_total: number;
  tax_share: number;
  tip_share: number;
  final_total: number;
}

export interface FinalResults {
  status: string;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  venmo_handle: string | null;
  zelle_handle: string | null;
  cashapp_handle: string | null;
  splits: FinalSplit[];
}

export async function getCreatorDashboard(creatorToken: string): Promise<CreatorDashboard> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/dashboard`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch dashboard');
  }

  return response.json();
}

export async function completeBill(
  creatorToken: string,
  paymentHandles: {
    venmo_handle?: string;
    zelle_handle?: string;
    cashapp_handle?: string;
  }
): Promise<Bill> {
  const response = await fetch(`${API_URL}/bills/creator/${creatorToken}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentHandles),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to complete bill');
  }

  return response.json();
}

export async function getFinalResults(shareToken: string): Promise<FinalResults> {
  const response = await fetch(`${API_URL}/bills/share/${shareToken}/final`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch final results');
  }

  return response.json();
}
