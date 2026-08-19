/**
 * Names shared by the backend and the frontend that carry no schema with them.
 *
 * Kept apart from `contract.ts` on purpose: the contract imports the SDK's
 * `defineRpcContract` at runtime, and the app bundle only ever imports the
 * contract's *types*. A value imported from there would drag the backend SDK
 * into the frontend build.
 */

/** Realtime channel: published whenever a project's icon record changes. */
export const ICONS_CHANNEL = "icons";
