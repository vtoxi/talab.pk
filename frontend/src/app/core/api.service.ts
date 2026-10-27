import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface LatLng { lat: number; lng: number }
export interface NewRequest { category: string; details: string; budgetMin: number; budgetMax: number; moveIn: string; area: LatLng[] }
export interface MyRequest { id: string; category: string; details: string; budgetMin: number; budgetMax: number; moveIn: string; expiresAt: string; area?: LatLng[] }
export interface MatchedRequest { id: string; category: string; details: string; budgetMin: number; budgetMax: number; moveIn: string; matchedPlace: string | null; offerId: string | null }
export interface OfferSummary { id: string; requestId: string; otherParty: string; rent: number; advance: number; availableFrom: string; note: string | null; status: 'Pending' | 'Accepted' | 'Rejected' | 'Withdrawn'; createdAt: string; lat?: number; lng?: number; placeName?: string | null }
export interface Msg { id: string; mine: boolean; kind: 'Text' | 'Counter'; text: string; rent: number | null; advance: number | null; at: string; seen: boolean }
export interface Thread { offer: OfferSummary; isTenant: boolean; budgetMin: number; budgetMax: number; requestDetails: string; requestMoveIn: string; placeName: string | null; messages: Msg[] }
export interface NewOffer { rent: number; advance: number; availableFrom: string; note: string | null }
export interface VerificationStatus { status: 'None' | 'Pending' | 'Approved' | 'Rejected'; reason: string | null; submittedAt: string | null }
export interface Notice { id: string; type: 'NewRequest' | 'NewOffer' | 'NewMessage' | 'OfferUpdate' | 'Verification'; title: string; body: string; titleTemplate: string; bodyTemplate: string; args: Record<string, string>; link: string; read: boolean; createdAt: string }
export interface Inbox { unread: number; items: Notice[] }
export interface Pin { id: string; name: string; lat: number; lng: number; imageUrl?: string }
export interface SuggestedPlace { pinId: string; name: string; lat: number; lng: number; ownerName: string; imageUrl?: string | null; contacted?: boolean }

export interface AdLimitPendingDto {
  requestId: string;
  status: 'Reviewing' | 'PendingAdmin';
  createdAt: string;
  reviewDurationSeconds: number;
  secondsElapsed: number;
}

export interface AdLimitStatus {
  currentOpenCount: number;
  allowedLimit: number;
  canPost: boolean;
  autoApprovedCount: number;
  maxAutoApprovals: number;
  pendingRequest?: AdLimitPendingDto | null;
}

export interface Party { fullName: string; fatherName: string; cnic: string; address: string; phone: string }
export interface Terms { city: string; propertyAddress: string; propertyDetails: string; startDate: string | null; termMonths: number; annualIncreasePercent: number; noticeDays: number; utilitiesNote: string }
export interface AgreementDraft { offerId: string; type: string; isOwner: boolean; rent: number; advance: number; me: Party | null; otherName: string; other: Party | null; terms: Terms | null; missing: string[]; ready: boolean }

export interface RequestRevision {
  revision: number;
  createdAt: string;
  category?: string;
  type?: string;
  propertyWorth?: number;
  budgetMin: number;
  budgetMax: number;
  moveIn: string;
  note?: string;
}

/** Capitalised type for display, e.g. "Flat". */
export function typeLabel(details: string): string {
  const t = requestType(details);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** details is a JSON string such as {"type":"flat"}. */
export function requestType(details: string): string {
  try { return JSON.parse(details).type ?? 'property'; } catch { return 'property'; }
}

/** Extract all revisions from request details JSON */
export function getRequestRevisions(details: string): RequestRevision[] {
  try {
    const obj = JSON.parse(details);
    return Array.isArray(obj.revisions) ? obj.revisions : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // tenant
  createRequest(r: NewRequest) { return this.http.post('/api/requests', r); }
  updateRequest(r: Partial<NewRequest>) { return this.http.put<boolean>('/api/requests/mine', r); }
  myRequest() { return this.http.get<MyRequest | null>('/api/requests/mine'); }
  markFound() { return this.http.post('/api/requests/mine/found', {}); }

  tenantOffers() { return this.http.get<OfferSummary[]>('/api/requests/mine/offers'); }
  tenantSuggestedPlaces() { return this.http.get<SuggestedPlace[]>('/api/requests/mine/suggestions'); }
  myRequestsAll() { return this.http.get<MyRequest[]>('/api/requests/mine/all'); }
  limitStatus() { return this.http.get<AdLimitStatus>('/api/requests/limit-status'); }
  requestLimit() { return this.http.post<AdLimitStatus>('/api/requests/request-limit', {}); }
  claimApprovedLimit(expedite = false) { return this.http.post<AdLimitStatus>('/api/requests/claim-approved-limit?expedite=' + expedite, {}); }
  nudgeOwner(pinId: string) { return this.http.post<boolean>(`/api/requests/mine/nudge/${pinId}`, {}); }

  // offers + negotiation (both sides)
  createOffer(requestId: string, o: NewOffer) { return this.http.post<{ id: string }>(`/api/owner/requests/${requestId}/offer`, o); }
  ownerOffers() { return this.http.get<OfferSummary[]>('/api/owner/offers'); }
  thread(id: string) { return this.http.get<Thread>(`/api/offers/${id}`); }
  sendMessage(id: string, body: string) { return this.http.post(`/api/offers/${id}/messages`, { body }); }
  counter(id: string, rent: number, advance: number) { return this.http.post(`/api/offers/${id}/counter`, { rent, advance }); }
  decide(id: string, action: 'accept' | 'reject' | 'withdraw') { return this.http.post(`/api/offers/${id}/${action}`, {}); }

  // rental agreement
  agreement(id: string) { return this.http.get<AgreementDraft>(`/api/offers/${id}/agreement`); }
  saveParty(id: string, p: Party) { return this.http.put(`/api/offers/${id}/agreement/party`, p); }
  saveTerms(id: string, t: Terms) { return this.http.put(`/api/offers/${id}/agreement/terms`, t); }
  agreementPdf(id: string) { return this.http.get(`/api/offers/${id}/agreement/pdf`, { responseType: 'blob' }); }

  // notifications
  inbox() { return this.http.get<Inbox>('/api/notifications'); }
  unreadCount() { return this.http.get<number>('/api/notifications/unread-count'); }
  markRead(id: string) { return this.http.post(`/api/notifications/${id}/read`, {}); }
  markAllRead() { return this.http.post('/api/notifications/read-all', {}); }
  emailPref() { return this.http.get<boolean>('/api/notifications/email'); }
  setEmailPref(on: boolean) { return this.http.put<boolean>('/api/notifications/email', on); }

  // owner
  verificationStatus() { return this.http.get<VerificationStatus>('/api/owner/verification'); }
  submitVerification(fd: FormData) { return this.http.post('/api/owner/verification', fd); }
  feed() { return this.http.get<MatchedRequest[]>('/api/owner/feed'); }
  pins() { return this.http.get<Pin[]>('/api/owner/pins'); }
  addPin(name: string, lat: number, lng: number) { return this.http.post<{ id: string }>('/api/owner/pins', { name, lat, lng }); }
  deletePin(id: string) { return this.http.delete(`/api/owner/pins/${id}`); }
  uploadPinImage(pinId: string, file: Blob) {
    const fd = new FormData();
    fd.append('file', file, 'property.jpg');
    return this.http.post<{ url: string }>(`/api/properties/${pinId}/image`, fd);
  }
}
