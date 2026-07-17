/**
 * Options for compiling a skill's instructions.
 *
 * Keys are variable names and values are the strings substituted for the
 * matching `{{variable}}` placeholders in the skill instructions.
 *
 * @public
 */
export type SkillCompileOptions = Record<string, string>;
