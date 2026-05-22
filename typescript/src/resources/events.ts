import type { ShieldEvent, CreateEventParams } from "../types";
import { EventsPii } from "./pii";

export class Events {
  private _request: (method: string, path: string, body?: unknown) => Promise<unknown>;
  public pii: EventsPii;

  constructor(request: (method: string, path: string, body?: unknown) => Promise<unknown>) {
    this._request = request;
    this.pii = new EventsPii(request);
  }

  async create(params: CreateEventParams): Promise<ShieldEvent> {
    const { session_id, ...body } = params;
    return this._request("POST", `/sessions/${session_id}/events`, body) as Promise<ShieldEvent>;
  }
}
