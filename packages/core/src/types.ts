import { MediaContentType } from "./api/api/index.js";

/** A skill available to an observation. @public */
export type LangfuseSkillReference = {
  /** ID of the managed skill version returned by Langfuse */
  langfuseSkillId?: string | null;
  skillName: string;
  /** Numeric version of the Langfuse-managed skill, when known */
  langfuseSkillVersion?: number | null;
};

export type ParsedMediaReference = {
  mediaId: string;
  source: string;
  contentType: MediaContentType;
};
