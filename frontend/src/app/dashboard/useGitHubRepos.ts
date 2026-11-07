"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import type { Repo } from "./types";

/** The signed-in user's GitHub repositories (empty and not loading when signed out). */
export function useGitHubRepos(signedIn: boolean) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    axios
      .get<Repo[]>("/api/github/repos")
      .then(({ data }) => {
        if (cancelled) return;
        setRepos(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRepos([]);
        setError(
          axios.isAxiosError(err) && err.response?.data?.error
            ? String(err.response.data.error)
            : "Couldn't load your repositories from GitHub."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [signedIn, attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return { repos, loading: signedIn && loading, error, retry };
}
