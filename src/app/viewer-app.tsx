"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterMessages,
  matchesMessageFilter,
  MESSAGE_FILTER_OPTIONS,
  type MessageFilter,
} from "@/features/messages/messageFilter";
import type { MessageView } from "@/features/messages/types";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message: string;
  };
};

type SessionResponse = {
  authenticated: boolean;
  viewerSharedId: null | string;
};

type MessagesResponse = {
  messages: MessageView[];
};

type MessageResponse = {
  message: MessageView;
};

type AppVersionResponse = {
  version: string;
};

export default function ViewerApp({ appVersion }: { appVersion: string }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sharedId, setSharedId] = useState("bbcafe");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [selectedMessage, setSelectedMessage] = useState<MessageView | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedId = selectedMessage?.messageId ?? null;
  const filteredMessages = useMemo(() => filterMessages(messages, messageFilter), [messages, messageFilter]);
  const messageListStatus = loadingMessages ? "更新中です。" : status || "60秒ごとに自動更新します。";

  const checkForAppUpdate = useCallback(async () => {
    const result = await fetchJson<AppVersionResponse>("/api/app-version", { cache: "no-store" });
    const latestVersion = result.data?.version?.trim();

    if (latestVersion && latestVersion !== appVersion) {
      window.location.reload();
    }
  }, [appVersion]);

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    setError("");

    const result = await fetchJson<MessagesResponse>("/api/messages?limit=100");

    if (result.error) {
      setError(result.error.message);
      setLoadingMessages(false);
      return;
    }

    const nextMessages = result.data?.messages ?? [];
    setMessages(nextMessages);

    setSelectedMessage((current) =>
      current && !nextMessages.some((message) => message.messageId === current.messageId) ? null : current,
    );

    setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    let active = true;

    fetchJson<SessionResponse>("/api/viewer/session").then((result) => {
      if (!active) {
        return;
      }

      const nextAuthenticated = Boolean(result.data?.authenticated);
      setAuthenticated(nextAuthenticated);
      setCheckingSession(false);

      if (result.data?.viewerSharedId) {
        setSharedId(result.data.viewerSharedId);
      }

      if (nextAuthenticated) {
        void loadMessages();
      }
    });

    return () => {
      active = false;
    };
  }, [loadMessages]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadMessages();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [authenticated, loadMessages]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkForAppUpdate();
      }
    }

    window.addEventListener("focus", checkForAppUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", checkForAppUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForAppUpdate]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!selectedMessage && !accountMenuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setSelectedMessage(null);
      setAccountMenuOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountMenuOpen, selectedMessage]);

  useEffect(() => {
    if (!selectedMessage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedMessage]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");

    const result = await fetchJson<SessionResponse>("/api/viewer/login", {
      body: JSON.stringify({ password, sharedId }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (result.error || !result.data?.authenticated) {
      setError(result.error?.message ?? "ログインできません。");
      return;
    }

    if (result.data.viewerSharedId) {
      setSharedId(result.data.viewerSharedId);
    }

    setPassword("");
    setAuthenticated(true);
    await loadMessages();
  }

  async function handleLogout() {
    await fetchJson("/api/viewer/logout", { method: "POST" });
    setAuthenticated(false);
    setAccountMenuOpen(false);
    setMessageFilter("all");
    setMessages([]);
    setSelectedMessage(null);
  }

  function handleFilterChange(nextFilter: MessageFilter) {
    setMessageFilter(nextFilter);
    setSelectedMessage((current) => (current && !matchesMessageFilter(current, nextFilter) ? null : current));
  }

  async function handleSelect(messageId: string) {
    setError("");
    const result = await fetchJson<MessageResponse>(`/api/messages/${encodeURIComponent(messageId)}`);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setSelectedMessage(result.data?.message ?? null);
  }

  function closeMessageModal() {
    setSelectedMessage(null);
  }

  if (checkingSession) {
    return (
      <main className="app-shell">
        <p className="status-text">セッションを確認しています。</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="app-shell">
        <section className="panel login-panel">
          <div className="app-title">
            <h1>BB Cafe Messages</h1>
            <p>共有IDとパスワードで閲覧します。</p>
          </div>
          <form className="form-stack" onSubmit={handleLogin}>
            <label>
              共有ID
              <input
                autoComplete="username"
                onChange={(event) => setSharedId(event.target.value)}
                value={sharedId}
              />
            </label>
            <label>
              パスワード
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button type="submit">ログイン</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <h1>BB Cafe Messages</h1>
          <p>LINE公式アカウントへ届いたテキストメッセージ</p>
        </div>
        <div className="admin-actions">
          <div className="account-menu" ref={accountMenuRef}>
            <button
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-label="アカウントメニューを開く"
              className={`account-button ${accountMenuOpen ? "active" : ""}`}
              onClick={() => setAccountMenuOpen((current) => !current)}
              type="button"
            >
              <span aria-hidden="true" className="account-icon" />
            </button>
            {accountMenuOpen ? (
              <div className="account-popover" role="menu">
                <div className="account-summary">
                  <span>共有ID</span>
                  <strong>{sharedId}</strong>
                </div>
                <button className="secondary account-logout" onClick={() => void handleLogout()} role="menuitem" type="button">
                  ログアウト
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <section className="toolbar">
          <p className="error-text">{error}</p>
        </section>
      ) : null}

      <section className="message-layout">
        <MessageList
          filter={messageFilter}
          messages={filteredMessages}
          onFilterChange={handleFilterChange}
          onSelect={handleSelect}
          selectedId={selectedId}
          statusText={messageListStatus}
          totalCount={messages.length}
        />
      </section>
      <MessageDetailModal message={selectedMessage} onClose={closeMessageModal} />
    </main>
  );
}

function MessageList({
  filter,
  messages,
  onFilterChange,
  onSelect,
  selectedId,
  statusText,
  totalCount,
}: {
  filter: MessageFilter;
  messages: MessageView[];
  onFilterChange: (filter: MessageFilter) => void;
  onSelect: (messageId: string) => void;
  selectedId: null | string;
  statusText: string;
  totalCount: number;
}) {
  return (
    <>
      <div className="message-list-toolbar">
        <div aria-label="メッセージ種別フィルター" className="message-filter" role="group">
          {MESSAGE_FILTER_OPTIONS.map((option) => (
            <button
              aria-pressed={option.value === filter}
              className={`filter-button ${option.value === filter ? "active" : ""}`}
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="message-list-status status-text">{statusText}</p>
      </div>

      {messages.length ? (
        <div className="message-list">
          {messages.map((message) => (
            <button
              className={`message-row ${message.messageId === selectedId ? "active" : ""}`}
              key={message.messageId}
              onClick={() => onSelect(message.messageId)}
              type="button"
            >
              <span className="message-meta">
                <strong>{message.senderDisplayName}</strong>
                <span>{formatTime(message.sentAt)}</span>
                <span>{sourceLabel(message)}</span>
              </span>
              <span className="message-text">{message.text}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel empty-message-panel">
          {totalCount ? "このフィルターに該当するメッセージはありません。" : "表示できるメッセージはありません。"}
        </div>
      )}
    </>
  );
}

function MessageDetailModal({ message, onClose }: { message: MessageView | null; onClose: () => void }) {
  if (!message) {
    return null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        aria-label="メッセージ全文"
        aria-modal="true"
        className="message-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="閉じる" className="secondary modal-close-button" onClick={onClose} type="button">
          ×
        </button>
        <p className="message-modal-text">{message.text}</p>
      </div>
    </div>
  );
}

function sourceLabel(message: MessageView) {
  if (message.sourceType === "group") {
    return message.sourceGroupName || "ユーザグループ";
  }

  return "個別トーク";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok && !payload.error) {
    return {
      error: {
        message: "通信に失敗しました。",
      },
    };
  }

  return payload;
}
