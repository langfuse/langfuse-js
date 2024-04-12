import { Langfuse } from "../langfuse";

export class LangfuseSingleton {
  private static instance: Langfuse | null = null; // Lazy initialization

  public static getInstance(): Langfuse {
    if (!LangfuseSingleton.instance) {
      LangfuseSingleton.instance = new Langfuse();
    }
    return LangfuseSingleton.instance;
  }
}
