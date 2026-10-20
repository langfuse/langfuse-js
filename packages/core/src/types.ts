import { MediaContentType } from "./api/api/index.js";

/** A skill available to an observation. @public */
export type PropagatedSkillInput = {
  name: string;
  /** Numeric version of the Langfuse-managed skill, when known */
  version?: number;
};

export type ParsedMediaReference = {
  mediaId: string;
  source: string;
  contentType: MediaContentType;
};
