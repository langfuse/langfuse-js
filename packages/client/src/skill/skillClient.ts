import { Skill } from "@langfuse/core";
import mustache from "mustache";

mustache.escape = function (text) {
  return text;
};

/**
 * Client for working with skills.
 *
 * Provides access to the fields of a skill and a {@link SkillClient.compile}
 * helper that substitutes `{{variable}}` placeholders in the skill's
 * instructions. Skills have no text/chat split, so a single client class wraps
 * every skill response.
 *
 * @public
 */
export class SkillClient {
  /** The original skill response from the API */
  public readonly skillResponse: Skill;
  /** The name of the skill */
  public readonly name: string;
  /** The version number of the skill */
  public readonly version: number;
  /** Human-readable description of the skill */
  public readonly description: string;
  /** The instructions body of the skill (supports {{variable}} placeholders) */
  public readonly instructions: string;
  /** Arbitrary metadata associated with the skill */
  public readonly metadata: unknown;
  /** Tools the skill is allowed to use */
  public readonly allowedTools: string[];
  /** Labels associated with the skill */
  public readonly labels: string[];
  /** Tags associated with the skill */
  public readonly tags: string[];
  /** Optional commit message for the skill version */
  public readonly commitMessage: string | null | undefined;
  /** Whether this skill client is using fallback content */
  public readonly isFallback: boolean;

  /**
   * Creates a new SkillClient instance.
   *
   * @param skill - The skill data returned from the API
   * @param isFallback - Whether this is fallback content
   * @internal
   */
  constructor(skill: Skill, isFallback = false) {
    this.skillResponse = skill;
    this.name = skill.name;
    this.version = skill.version;
    this.description = skill.description;
    this.instructions = skill.instructions;
    this.metadata = skill.metadata;
    this.allowedTools = skill.allowedTools;
    this.labels = skill.labels;
    this.tags = skill.tags;
    this.commitMessage = skill.commitMessage;
    this.isFallback = isFallback;
  }

  /**
   * Compiles the skill instructions by substituting variables.
   *
   * Uses Mustache templating to replace `{{variable}}` placeholders in the
   * instructions with the provided values.
   *
   * @param variables - Key-value pairs for variable substitution
   * @returns The compiled instructions with variables substituted
   *
   * @example
   * ```typescript
   * const skill = await langfuse.skill.get("my-skill");
   * const compiled = skill.compile({ name: "Alice" });
   * // If instructions are "Hello {{name}}!", result is "Hello Alice!"
   * ```
   */
  compile(variables?: Record<string, string>): string {
    return mustache.render(this.instructions, variables ?? {});
  }

  /**
   * Serializes the skill client to JSON.
   *
   * @returns JSON string representation of the skill
   */
  public toJSON(): string {
    return JSON.stringify({
      name: this.name,
      version: this.version,
      description: this.description,
      instructions: this.instructions,
      metadata: this.metadata,
      allowedTools: this.allowedTools,
      labels: this.labels,
      tags: this.tags,
      commitMessage: this.commitMessage,
      isFallback: this.isFallback,
    });
  }
}
