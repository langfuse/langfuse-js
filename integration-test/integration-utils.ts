import axios from "axios";

import { type components } from "../langfuse-core/src/openapi/server";

export const LANGFUSE_BASEURL = String(process.env.LANGFUSE_BASEURL);
export const LANGFUSE_PUBLIC_KEY = String(process.env.LANGFUSE_PUBLIC_KEY);
export const LANGFUSE_SECRET_KEY = String(process.env.LANGFUSE_SECRET_KEY);

export const getHeaders = (
  pk: string = LANGFUSE_PUBLIC_KEY,
  sk: string = LANGFUSE_SECRET_KEY
): Record<string, string> => {
  return { Authorization: "Basic " + Buffer.from(`${pk}:${sk}`).toString("base64") };
};

export type TraceAndObservations = components["schemas"]["Trace"] & {
  observations: components["schemas"]["Observation"][];
};

export async function getTraces(traceId: string): Promise<TraceAndObservations> {
  const res = await axios.get<TraceAndObservations>(`${LANGFUSE_BASEURL}/api/public/traces/${traceId}`, {
    headers: getHeaders(),
  });
  if (res.status !== 200) {
    throw new Error(`Error fetching trace: ${res.status} ${res.statusText}`);
  }
  return res.data;
}
