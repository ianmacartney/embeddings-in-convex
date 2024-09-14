/* prettier-ignore-start */

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as comparisons from "../comparisons.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_utils from "../lib/utils.js";
import type * as searches from "../searches.js";
import type * as sources from "../sources.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  comparisons: typeof comparisons;
  "lib/embeddings": typeof lib_embeddings;
  "lib/utils": typeof lib_utils;
  searches: typeof searches;
  sources: typeof sources;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

/* prettier-ignore-end */
