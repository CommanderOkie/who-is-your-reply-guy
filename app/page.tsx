"use client";

import { useState, useRef, useEffect } from "react";
import ResultCard from "./components/ResultCard";
import { AnalyzeResult } from "@/lib/twitter";

const LOADING_STEPS = [
  { text: "Scanning replies... 👀", icon: "👀" },
];

const EXAMPLE_ACCOUNTS = ["sama", "naval", "paulg", "levelsio", "piratewires"];

export default function Home() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Cycle loading messages while analyzing
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const id = setInterval(() => {
      setLoadingStep((p) => (p < LOADING_STEPS.length - 1 ? p + 1 : p));
    }, 2800);
    return () => clearInterval(id);
  }, [loading]);

  const handleAnalyze = async (overrideUsername?: string) => {
    const raw = (overrideUsername ?? username).replace(/^@/, "").trim();
    if (!raw) return;
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(raw)) {
      setError("Invalid username. Only letters, numbers, and underscores allowed.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: raw }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setResult(data as AnalyzeResult);
      setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100
      );
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const tryExample = (handle: string) => {
    setUsername(handle);
    handleAnalyze(handle);
  };

  return (
    <main>
      {/* Animated background */}
      <div className="bg-grid" aria-hidden />
      <div className="bg-orb bg-orb-1" aria-hidden />
      <div className="bg-orb bg-orb-2" aria-hidden />

      {/* ── Hero ── */}
      <header className="header">
        <div className="header-tag">
          <span>✦</span>
          <span>Twitter / X Analytics</span>
        </div>

        <h1 className="header-title">
          Who Is Your{" "}
          <span className="gradient-text">Reply Guy?</span>
        </h1>

        <p className="header-sub">
          Drop any public X username and we{"'"}ll expose who{"'"}s living rent-free in their replies. 👀
        </p>
      </header>

      {/* ── Input ── */}
      <section className="input-section" aria-label="Username input">
        <div className="input-wrapper">
          <input
            id="username-input"
            className="username-input"
            type="text"
            placeholder="@elonmusk"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            disabled={loading}
            aria-label="Twitter/X username to analyze"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
          <button
            id="analyze-btn"
            className="analyze-btn"
            onClick={() => handleAnalyze()}
            disabled={loading || !username.trim()}
          >
            {loading ? (
              <>
                <span
                  style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}
                >
                  ⟳
                </span>
                Analyzing…
              </>
            ) : (
              <>
                <span>🔍</span> Analyze
              </>
            )}
          </button>
        </div>

        {/* Example quick-picks */}
        {!loading && !result && (
          <div className="example-row" aria-label="Try an example">
            <span className="example-label">Try:</span>
            {EXAMPLE_ACCOUNTS.map((handle) => (
              <button
                key={handle}
                className="example-chip"
                onClick={() => tryExample(handle)}
                type="button"
              >
                @{handle}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Loading ── */}
      {loading && (
        <section className="loading-state" aria-live="polite" aria-label="Analyzing">
          <div className="loading-spinner" />
          <p className="loading-text">{LOADING_STEPS[loadingStep].text}</p>
          <p className="loading-sub">Scraping X replies — takes ~8–15s ⚡</p>
          <div className="loading-steps">
            {LOADING_STEPS.slice(0, loadingStep + 1).map((step, i) => (
              <div
                key={i}
                className={`loading-step ${
                  i === loadingStep ? "step-active" : "step-done"
                }`}
              >
                <span className="loading-step-icon">{step.icon}</span>
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && error && (
        <section className="error-state" aria-live="polite">
          <div className="error-card">
            <div className="error-header">
              <span>{error.includes("rate") ? "🚦" : "🚫"}</span>
              <span>{error.includes("rate") ? "Slow Down!" : "Analysis Failed"}</span>
            </div>
            <p className="error-message">{error}</p>
            <button
              onClick={() => handleAnalyze()}
              style={{
                marginTop: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontSize: "0.82rem",
                fontFamily: "Inter, sans-serif",
                padding: "7px 16px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ↺ Try again
            </button>
          </div>
        </section>
      )}

      {!loading && result && (
        <div ref={resultsRef}>
          {result.cached && (
            <p style={{
              textAlign: "center", fontSize: "0.72rem",
              color: "var(--text-muted)", marginBottom: 8,
            }}>
              ⚡ Showing cached results &middot; <button
                onClick={() => {
                  // Clear cache by re-running (server cache busted on next cold start)
                  handleAnalyze(result.username);
                }}
                style={{ background: "none", border: "none", color: "var(--accent-violet)",
                  fontSize: "inherit", cursor: "pointer", fontFamily: "Inter, sans-serif" }}
              >Refresh</button>
            </p>
          )}
          <ResultCard result={result} />
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="site-footer">
        Not affiliated with X / Twitter &middot; For entertainment only<br />
        <span style={{ opacity: 0.7, marginTop: "8px", display: "inline-block" }}>Made by Avee</span>
      </footer>
    </main>
  );
}
