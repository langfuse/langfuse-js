import { MediaContentType } from "./api/api/index.js";

export type ParsedMediaReference = {
  mediaId: string;
  source: string;
  contentType: MediaContentType;
};
