import { type LangfusePersistedProperty } from "./types";

export class LangfuseMemoryStorage {
  private _memoryStorage: { [key: string]: any | undefined } = {};

  getProperty(key: LangfusePersistedProperty): any | undefined {
    return this._memoryStorage[key];
  }

  setProperty(key: LangfusePersistedProperty, value: any | null): void {
    this._memoryStorage[key] = value !== null ? value : undefined;
  }
}
