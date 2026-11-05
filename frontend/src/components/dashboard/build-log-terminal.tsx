import React, { useRef, useState, useEffect, useCallback } from "react";
import { Terminal, ChevronDown, Copy, Check, ArrowDown } from "lucide-react";
import { LogLine } from "../../app/dashboard/types";

export function BuildLogTerminal({ logs, isStreaming }: { logs: LogLine[]; isStreaming: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => l.line).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [logs]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  const getLineClass = (line: string): string => {
    if (line.startsWith("  ERROR") || line.includes("✗") || line.includes("FAIL"))
      return "text-destructive";
    if (line.includes("✓") || line.includes("All tests passing") || line.includes("PASS"))
      return "text-primary";
    if (line.startsWith("▶"))
      return "text-primary font-semibold";
    if (line.startsWith("  $"))
      return "text-yellow-300/90";
    if (line.startsWith("  [install]"))
      return "text-blue-300/80";
    if (line.startsWith("  Calling AI") || line.startsWith("  AI response"))
      return "text-violet-300/80";
    if (line.startsWith("  Redirected fix") || line.startsWith("  Applying fix"))
      return "text-orange-300/80";
    if (line.startsWith("  ✓ Fix applied") || line.startsWith("  ✓ committed"))
      return "text-primary font-medium";
    if (line.startsWith("  ✗ Fix failed") || line.startsWith("  ✗ commit"))
      return "text-destructive font-medium";
    return "text-zinc-300";
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-[#0a0a0a] shadow-2xl shadow-black/20">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-border/40 bg-[#111111] px-4 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2.5 group"
        >
          {/* macOS traffic lights */}
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[0_0_4px_rgba(255,95,87,0.4)] transition-all group-hover:brightness-110" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[0_0_4px_rgba(254,188,46,0.4)] transition-all group-hover:brightness-110" />
            <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[0_0_4px_rgba(40,200,64,0.4)] transition-all group-hover:brightness-110" />
          </div>
          <span className="font-mono text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
            Build Logs
          </span>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Live
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {/* Line count */}
          <span className="font-mono text-[10px] text-zinc-600">
            {logs.length} lines
          </span>

          {/* Copy button */}
          {logs.length > 0 && (
            <button
              onClick={handleCopy}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title="Copy all logs"
            >
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}

          {/* Collapse toggle */}
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform cursor-pointer hover:text-zinc-300 ${expanded ? "" : "-rotate-90"}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {/* ── Log content ── */}
      {expanded && (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[28rem] min-h-[12rem] overflow-y-auto p-0 font-mono text-[12.5px] leading-[1.7] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800"
          >
            {logs.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-zinc-600">
                <Terminal className="h-4 w-4" />
                <span>Waiting for build output…</span>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {logs.map((log, i) => (
                    <tr
                      key={i}
                      className="group hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Line number gutter */}
                      <td className="w-[3.5rem] select-none border-r border-zinc-800/50 px-2 text-right align-top font-mono text-[11px] text-zinc-700 group-hover:text-zinc-500">
                        {i + 1}
                      </td>
                      {/* Content */}
                      <td className={`px-2 whitespace-pre-wrap break-all ${getLineClass(log.line)}`}>
                        {log.line || "\u00A0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Blinking cursor */}
            {isStreaming && (
              <div className="flex items-center gap-2 px-4 py-1 text-zinc-600">
                <span className="inline-block h-4 w-[2px] animate-pulse bg-primary/60 rounded-full" />
              </div>
            )}
          </div>

          {/* Scroll to bottom FAB */}
          {!autoScroll && isStreaming && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-border/40 bg-[#1a1a1a] text-zinc-400 shadow-lg transition-all hover:bg-zinc-800 hover:text-white hover:border-primary/30"
              title="Scroll to bottom"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
