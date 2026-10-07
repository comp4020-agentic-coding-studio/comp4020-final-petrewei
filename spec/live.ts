import { inject } from "vitest";

// True when the checks run against the deployed app. Tests that change the
// door (move, hold or take a word, write a poem) skip it there: real visitors
// share that door, and a test's word, hold or theft notice would land on them.
// CI and local runs use a throwaway copy, where every test runs.
export const live = new URL(inject("baseUrl")).hostname.endsWith(".fly.dev");
