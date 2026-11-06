"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import type { Repo } from "./types";

/** The signed-in user's GitHub repositories (empty and not loading when signed out). */
export function useGitHubRepos(signedIn: boolean) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    axios
      .get<Repo[]>("/api/github/repos")
      .then(({ data }) => !cancelled && setRepos(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setRepos([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return { repos, loading: signedIn && loading };
}
