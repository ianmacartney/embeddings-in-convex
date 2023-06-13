import { crud } from "./lib/crud";

export const { getAll, insertBatch } = crud("chunks");
