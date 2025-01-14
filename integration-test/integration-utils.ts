import axios, { type AxiosResponse } from "axios";
import fs from "fs/promises";

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

export async function getTrace(traceId: string): Promise<TraceAndObservations> {
  sleep(2000);
  const res = await axios.get<TraceAndObservations>(`${LANGFUSE_BASEURL}/api/public/traces/${traceId}`, {
    headers: getHeaders(),
  });
  if (res.status !== 200) {
    throw new Error(`Error fetching trace: ${res.status} ${res.statusText}`);
  }
  return res.data;
}

export const fetchTraceById = async (id: string): Promise<AxiosResponse<any, any>> => {
  const url = `${LANGFUSE_BASEURL}/api/public/traces/${id}`;
  const res = await axios.get(url, {
    headers: getHeaders(),
  });
  return res;
};

export const encodeFile = async (filePath: string): Promise<string> => {
  const file = await fs.readFile(filePath);
  const encoded = Buffer.from(file).toString("base64");

  return encoded;
};

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAxiosClient() {
  await sleep(2000);

  return axios;
}
