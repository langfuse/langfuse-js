import { MediaContentType } from "./api/api/index.js";

/** A skill available to an observation. @public */
export type SkillReference = {
  skillName: string;
  /** Numeric version of the Langfuse-managed skill, when known */
  skillVersion?: number | null | undefined;
};

export type ParsedMediaReference = {
  mediaId: string;
  source: string;
  contentType: MediaContentType;
};
