"use client";

import { useRef, useState, useEffect } from "react";
import { AnalyzeResult, ReplyGuy } from "@/lib/twitter";

const RANK_MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

interface Props {
  result: AnalyzeResult;
}

export default function ResultCard({ result }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [animateBars, setAnimateBars] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimateBars(true), 300);
    return () => clearTimeout(t);
  }, []);

  const downloadCard = async () => {
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      if (!cardRef.current) return;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#111124",
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      const link = document.createElement("a");
      link.download = `reply-guy-${result.username}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("Download failed. Try the copy button instead.");
    } finally {
      setDownloading(false);
    }
  };

  const copyCard = async () => {
    setCopying(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      if (!cardRef.current) return;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#111124",
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        alert("✅ Card copied to clipboard!");
      }, "image/png");
    } catch (e) {
      console.error(e);
      alert("Copy failed. Try downloading instead.");
    } finally {
      setCopying(false);
    }
  };

  const shareOnX = () => {
    const top = result.top_reply_guys[0];
    const text = top
      ? `I just exposed my reply guy 💀\n\n👑 @${top.user} replies to EVERYTHING I tweet\n(${top.loyaltyScore}% loyalty is insane 😭)\n\nCheck yours 👇`
      : `Who's living rent-free in @${result.username}'s replies? 👀 I just checked! 👇`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const copySavageMode = () => {
    const top = result.top_reply_guys[0];
    if (!top) return;
    const text = `@${top.user} you need to get a job bro 💀\nYou replied to ${top.loyaltyScore}% of my tweets 😭`;
    navigator.clipboard.writeText(text);
    alert("🔥 Savage version copied to clipboard!");
  };

  const { top_reply_guys, username, displayName, avatarUrl, total_replies_analyzed, tweets_analyzed, disclaimer } = result;

  return (
    <section className="results-section" aria-label="Analysis results">
      <div className="card-wrapper">
        {/* The card */}
        <div className="result-card" ref={cardRef} id="result-card">
          {/* Header */}
          <div className="card-header">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarUrl}
                alt={`@${username} avatar`}
                className="card-header-avatar"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="card-header-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
                👤
              </div>
            )}
            <div className="card-header-info">
              <div className="card-header-title">Reply guys for</div>
              <div className="card-header-user">{displayName || `@${username}`}</div>
              <div className="card-header-handle">@{username}</div>
            </div>
            <div className="card-header-icon">👇</div>
          </div>

          {/* Reply guys list */}
          {top_reply_guys.length === 0 ? (
            <div className="no-results">
              <span className="no-results-emoji">🦗</span>
              <p>No reply guys found. Either this account has no replies or they{"'"}re all too shy.</p>
            </div>
          ) : (
            <>
              <ul className="reply-guys-list" role="list" aria-label="Top reply guys">
                {top_reply_guys.map((rg, idx) => (
                  <ReplyGuyRow key={rg.user} rg={rg} rank={idx} />
                ))}
              </ul>

              {/* Dominance bars */}
              <div className="dominance-bars">
                <div className="dominance-title">Reply Dominance</div>
                {top_reply_guys.map((rg) => (
                  <div key={rg.user} className="dominance-row">
                    <span className="dominance-user">@{rg.user}</span>
                    <div className="dominance-bar-track">
                      <div
                        className="dominance-bar-fill"
                        style={{
                          width: animateBars ? `${rg.dominance}%` : "0%",
                          background: rg.color
                            ? `linear-gradient(90deg, ${rg.color}, ${rg.color}88)`
                            : "var(--gradient-accent)",
                        }}
                      />
                    </div>
                    <span className="dominance-pct">{rg.dominance}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer stats */}
          <div className="card-footer">
            <div className="card-stats">
              <div className="card-stat">
                <div className="card-stat-num">{total_replies_analyzed}</div>
                <div className="card-stat-label">Replies</div>
              </div>
              <div className="card-stat">
                <div className="card-stat-num">{tweets_analyzed}</div>
                <div className="card-stat-label">Tweets</div>
              </div>
              <div className="card-stat">
                <div className="card-stat-num">{top_reply_guys.length}</div>
                <div className="card-stat-label">Reply Guys</div>
              </div>
            </div>
            <p className="card-disclaimer">{disclaimer}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="action-buttons" role="group" aria-label="Share options">
          <button
            id="download-card-btn"
            className="action-btn action-btn-primary"
            onClick={downloadCard}
            disabled={downloading}
          >
            {downloading ? "⏳ Saving…" : "⬇️ Download Card"}
          </button>
          <button
            id="copy-card-btn"
            className="action-btn action-btn-secondary"
            onClick={copyCard}
            disabled={copying}
          >
            {copying ? "⏳ Copying…" : "📋 Copy as Image"}
          </button>
          {result.top_reply_guys.length > 0 && (
            <button
              id="expose-mode-btn"
              className="action-btn action-btn-expose"
              onClick={copySavageMode}
            >
              🔥 Copy Savage Version
            </button>
          )}
          <button
            id="share-x-btn"
            className="action-btn action-btn-x"
            onClick={shareOnX}
          >
            𝕏 Share on X
          </button>
        </div>
        
        <div className="cta-loop">
           Now check your friends 👇
        </div>
      </div>
    </section>
  );
}

// ─── Individual reply guy row ───────────────────────────────────────────────
function ReplyGuyRow({ rg, rank }: { rg: ReplyGuy; rank: number }) {
  const loyaltyPct = rg.loyaltyScore;
  
  // Apply specific UI roles
  const isHero = rank === 0;
  const isMedium = rank === 1 || rank === 2;
  const isCompact = rank === 3 || rank === 4;

  let displayEmoji = rg.badgeEmoji;
  let displayBadge = rg.badge;

  if (isHero) {
    displayEmoji = "👑";
    displayBadge = "Certified Reply Guy";
  } else if (rank === 1) {
    displayEmoji = "💀";
    displayBadge = "Reply Demon";
  } else if (rank === 2) {
    displayEmoji = "🪖";
    displayBadge = "Loyal Soldier";
  }

  // Savage Line Generator for #1
  let savageLine = "Trying to get noticed";
  if (rg.dominance > 50) savageLine = "This guy replies before you even finish tweeting 💀";
  else if (rg.dominance > 30) savageLine = "Bro is basically on your payroll at this point";
  else if (loyaltyPct > 60) savageLine = "Loyal soldier reporting for duty 🪖";
  else if (rg.replies >= 3) savageLine = "Always lurking… always replying 👀";

  // Addiction Score for #1 (cap at 100)
  const addictionScore = Math.min(100, Math.round((rg.dominance * 0.4) + (loyaltyPct * 0.6) + (rg.replies * 2)));

  const animationDelay = `${0 + (rank * 0.15)}s`;

  return (
    <li 
      className={`reply-guy-item animate-reveal ${isHero ? "hero-reply-card" : ""} ${isMedium ? "medium-reply-card" : ""} ${isCompact ? "compact-reply-card" : ""}`} 
      aria-label={`Rank ${rank + 1}: @${rg.user}`}
      style={{ animationDelay }}
    >
      <span className="reply-guy-rank" aria-hidden>
        {RANK_MEDALS[rank] ?? `#${rank + 1}`}
      </span>

      <div className="reply-guy-main">
        <div className="reply-guy-user">
          <span className="reply-guy-handle">@{rg.user}</span>
          {!isCompact && (
            <span
              className="reply-guy-badge"
              style={{ color: rg.color, borderColor: isHero ? "transparent" : `${rg.color}55` }}
            >
              {displayEmoji} {displayBadge}
            </span>
          )}
        </div>
        
        {isHero && (
          <div className="savage-line">
            "{savageLine}"
          </div>
        )}

        <div className="reply-guy-meta">
          <span>{rg.replies} replies across {rg.tweets_replied} tweet{rg.tweets_replied !== 1 ? "s" : ""} ({loyaltyPct}% loyalty)</span>
        </div>
      </div>

      <div className="reply-guy-end">
         {isHero && (
           <div className="addiction-score">
             <div className="addiction-num">{addictionScore}/100</div>
             <div className="addiction-label">Addiction Score</div>
           </div>
         )}
      </div>
    </li>
  );
}
