import axios from "axios";

import { type components } from "../langfuse-core/src/openapi/server";

export const LANFGFUSE_HOST = process.env.LANGFUSE_HOST ?? "http://localhost:3000";
export const LANFGFUSE_PUBLIC_KEY = process.env.LANFGFUSE_PUBLIC_KEY ?? "pk-lf-1234567890";
export const LANFGFUSE_SECRET_KEY = process.env.LANFGFUSE_SECRET_KEY ?? "sk-lf-1234567890";

export const getHeaders = {
  Authorization: "Basic " + Buffer.from(`${LANFGFUSE_PUBLIC_KEY}:${LANFGFUSE_SECRET_KEY}`).toString("base64"),
};

export type TraceAndObservations = components["schemas"]["Trace"] & {
  observations: components["schemas"]["Observation"][];
};

export async function getTraces(traceId: string): Promise<TraceAndObservations> {
  const res = await axios.get<TraceAndObservations>(`${LANFGFUSE_HOST}/api/public/traces/${traceId}`, {
    headers: getHeaders,
  });
  if (res.status !== 200) {
    throw new Error(`Error fetching trace: ${res.status} ${res.statusText}`);
  }
  return res.data;
}
