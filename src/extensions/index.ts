/**
 * Extension system public API.
 */

export type {
  Extension,
  ExtensionKind,
  ExtensionAPI,
  ExtensionResources,
  ExtensionEntry,
  ExtensionState,
  ToolbarConfig,
  GlobeDef,
  AISkillDef,
  ComputeBackendDef,
  InferenceJob,
  InferenceResult,
  AIProviderFactory,
} from './types'

export { createExtensionAPI } from './api'

export {
  registerExtension,
  activateExtension,
  deactivateExtension,
  getExtension,
  getExtensions,
  subscribeExtensions,
} from './registry'

export { loadExtensions } from './loader'
