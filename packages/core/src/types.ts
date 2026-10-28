import { MediaContentType } from "./api/api/index.js";

export type SkillReference = {
  name: string;
  version?: number;
};

export type ParsedMediaReference = {
  mediaId: string;
  source: string;
  contentType: MediaContentType;
};
