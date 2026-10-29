import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface AdminStats { users: number; owners: number; verifiedOwners: number; openRequests: number; offers: number }
export interface AdminRequest { id: string; tenantId: string; category: string; budgetMin: number; budgetMax: number; moveIn: string; status: string; expiresAt: string; details: string }
export interface AdminUser { id: string; name: string; email: string; role: string; verified: boolean; city: string | null }
export interface AdminVerification { id: string; userId: string; name: string; email: string; status: 'Pending' | 'Approved' | 'Rejected'; reason: string | null; submittedAt: string }
export interface Flag { key: string; enabled: boolean }
export interface AdminLimitRequest { requestId: string; userId: string; userName: string; userEmail: string; status: string; isAutoApproved: boolean; createdAt: string }

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);
  private base = '/api/admin';

  stats() { return this.http.get<AdminStats>(`${this.base}/stats`); }
  requests(status?: string) { return this.http.get<AdminRequest[]>(`${this.base}/requests`, { params: status ? { status } : {} }); }
  closeRequest(id: string) { return this.http.post(`${this.base}/requests/${id}/close`, {}); }
  users(role?: string) { return this.http.get<AdminUser[]>(`${this.base}/users`, { params: role ? { role } : {} }); }
  setVerified(id: string, v: boolean) { return this.http.post(`${this.base}/users/${id}/verified`, v); }
  verifications(status?: string) { return this.http.get<AdminVerification[]>(`${this.base}/verifications`, { params: status ? { status } : {} }); }
  verification(id: string) { return this.http.get<AdminVerification>(`${this.base}/verifications/${id}`); }
  verificationImage(id: string, which: 'front' | 'back' | 'selfie') { return this.http.get(`${this.base}/verifications/${id}/image/${which}`, { responseType: 'blob' }); }
  approveVerification(id: string) { return this.http.post(`${this.base}/verifications/${id}/approve`, {}); }
  rejectVerification(id: string, reason: string) { return this.http.post(`${this.base}/verifications/${id}/reject`, { reason }); }
  flags() { return this.http.get<Flag[]>(`${this.base}/flags`); }
  setFlag(key: string, v: boolean) { return this.http.post(`${this.base}/flags/${key}`, v); }
  limitRequests() { return this.http.get<AdminLimitRequest[]>(`${this.base}/limit-requests`); }
  approveLimit(requestId: string) { return this.http.post<boolean>(`${this.base}/limit-requests/${requestId}/approve`, {}); }
  rejectLimit(requestId: string) { return this.http.post<boolean>(`${this.base}/limit-requests/${requestId}/reject`, {}); }
}
