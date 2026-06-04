export class EventsPii {
  private _request: (method: string, path: string, body?: unknown) => Promise<unknown>;

  constructor(request: (method: string, path: string, body?: unknown) => Promise<unknown>) {
    this._request = request;
  }

  async create(sessionId: string, eventId: string, params: { pii_data: string }): Promise<{ message: string }> {
    return this._request("POST", `/sessions/${sessionId}/events/${eventId}/pii`, params) as Promise<{ message: string }>;
  }

  async retrieve(sessionId: string, eventId: string): Promise<{ pii_data: string }> {
    return this._request("GET", `/sessions/${sessionId}/events/${eventId}/pii`) as Promise<{ pii_data: string }>;
  }
}

export class SessionsPii {
  private _request: (method: string, path: string, body?: unknown) => Promise<unknown>;

  constructor(request: (method: string, path: string, body?: unknown) => Promise<unknown>) {
    this._request = request;
  }

  /**
   * Erase all PII records for a session (GDPR right to erasure).
   *
   * **Irreversible.** PII payloads cannot be recovered after deletion.
   * Hash chain integrity is preserved — only the PII payloads are deleted.
   */
  async delete(sessionId: string): Promise<{ message: string; records_erased: number; session_id: string }> {
    return this._request("DELETE", `/sessions/${sessionId}/pii`) as Promise<{
      message: string;
      records_erased: number;
      session_id: string;
    }>;
  }
}
