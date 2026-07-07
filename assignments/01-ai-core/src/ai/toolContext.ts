/**
 * ToolContext — the shared state bundle every tool receives.
 *
 * Instead of threading `data`, `logger`, `user`, `config` through each tool as
 * separate parameters (which duplicates wiring and makes signatures diverge),
 * every tool takes a single `ToolContext`. This is lightweight dependency
 * injection: tools depend on the context interface, not on globals, so they're
 * trivial to unit-test with a fake context.
 */
import type { Logger } from '@flyrank/shared';
import type { AppConfig } from '../config/index.ts';
import rawSampleData from '../data/sampleData.json';

export interface Project {
  id: string;
  name: string;
  status: string;
  owner: string;
  tags: string[];
  createdAt: string;
  description: string;
}

export interface Note {
  id: string;
  projectId: string;
  author: string;
  text: string;
  tags: string[];
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  title: string;
  tag: string;
  content: string;
  updatedAt: string;
}

export interface SampleData {
  projects: Project[];
  notes: Note[];
  documents: DocumentRecord[];
}

/** The authenticated principal on whose behalf tools run. In a real service
 *  this would come from auth middleware; here it's a stub so the shape exists. */
export interface CurrentUser {
  id: string;
  name: string;
  roles: string[];
}

export interface ToolContext {
  data: SampleData;
  logger: Logger;
  user: CurrentUser;
  config: AppConfig;
}

/** Load the bundled dataset once (at startup). Cast is safe: the JSON is the
 *  source of truth for this shape and is validated by the tests that read it. */
export function loadSampleData(): SampleData {
  return rawSampleData as SampleData;
}

export interface CreateToolContextParams {
  data: SampleData;
  logger: Logger;
  user: CurrentUser;
  config: AppConfig;
}

export function createToolContext(params: CreateToolContextParams): ToolContext {
  return { data: params.data, logger: params.logger, user: params.user, config: params.config };
}
