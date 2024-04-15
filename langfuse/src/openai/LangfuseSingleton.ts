import { Langfuse } from "../langfuse";
import type { LangfuseInitParams } from "./types";

/**
 * Represents a singleton instance of the Langfuse client.
 */
export class LangfuseSingleton {
  private static instance: Langfuse | null = null; // Lazy initialization

  /**
   * Returns the singleton instance of the Langfuse client.
   * @param params Optional parameters for initializing the Langfuse instance. Only used for the first call.
   * @returns The singleton instance of the Langfuse client.
   */
  public static getInstance(params?: LangfuseInitParams): Langfuse {
    if (!LangfuseSingleton.instance) {
      LangfuseSingleton.instance = new Langfuse(params);
    }
    return LangfuseSingleton.instance;
  }
}
