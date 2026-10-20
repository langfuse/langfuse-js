import {
  LangfuseSpanProcessor as BaseLangfuseSpanProcessor,
  LangfuseSpanProcessorParams as BaseLangfuseSpanProcessorParams,
} from "../span-processor.js";

import { discoverSkills, DiscoverSkillsOptions } from "./skills.js";

export * from "../index.js";
export { discoverSkills, type DiscoverSkillsOptions } from "./skills.js";

type SkillDiscoveryConfig = DiscoverSkillsOptions & {
  availableSkills?: never;
  /** Attach discovered skills by default; scopes can override with includeDiscoveredSkills. Defaults to false. */
  includeByDefault?: boolean;
};

type AvailableSkillsConfig = NonNullable<
  BaseLangfuseSpanProcessorParams["skills"]
> & {
  dir?: never;
};

type SkillsConfig = SkillDiscoveryConfig | AvailableSkillsConfig;

/** Node.js processor options with local skill discovery. */
export interface LangfuseSpanProcessorParams
  extends Omit<BaseLangfuseSpanProcessorParams, "skills"> {
  /**
   * Discover local skills or provide a catalog. Configure either dir or
   * availableSkills, never both. Enable inclusion with includeByDefault or
   * propagateAttributes({ includeDiscoveredSkills: true }, callback).
   * Spans started before discovery completes have no automatic catalog.
   */
  skills?: SkillsConfig;
}

/** Langfuse span processor with optional local filesystem skill discovery. */
export class LangfuseSpanProcessor extends BaseLangfuseSpanProcessor {
  constructor(params?: LangfuseSpanProcessorParams) {
    const skills = params?.skills;
    if (skills?.dir !== undefined && skills.availableSkills !== undefined) {
      throw new TypeError(
        "Configure either skills.dir or skills.availableSkills, not both.",
      );
    }

    super({
      ...params,
      skills:
        skills?.dir !== undefined
          ? {
              availableSkills: discoverSkills({ dir: skills.dir }),
              includeByDefault: skills.includeByDefault,
            }
          : skills,
    });
  }
}
