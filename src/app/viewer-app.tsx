"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MessageView } from "@/features/messages/types";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message: string;
  };
};

type SessionResponse = {
  authenticated: boolean;
};

type MessagesResponse = {
  messages: MessageView[];
};

type MessageResponse = {
  message: MessageView;
};

export default function ViewerApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sharedId, setSharedId] = useState("bbcafe");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MessageView | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedId = selectedMessage?.messageId ?? null;

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

    if (selectedId && !nextMessages.some((message) => message.messageId === selectedId)) {
      setSelectedMessage(null);
    }

    setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    setLoadingMessages(false);
  }, [selectedId]);

  useEffect(() => {
    let active = true;

    fetchJson<SessionResponse>("/api/viewer/session").then((result) => {
      if (!active) {
        return;
      }

      const nextAuthenticated = Boolean(result.data?.authenticated);
      setAuthenticated(nextAuthenticated);
      setCheckingSession(false);

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
    }, 30000);

    return () => window.clearInterval(timer);
  }, [authenticated, loadMessages]);

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

    setPassword("");
    setAuthenticated(true);
    await loadMessages();
  }

  async function handleLogout() {
    await fetchJson("/api/viewer/logout", { method: "POST" });
    setAuthenticated(false);
    setMessages([]);
    setSelectedMessage(null);
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
          <button className="secondary" onClick={() => void loadMessages()} type="button">
            手動更新
          </button>
          <button className="secondary" onClick={() => void handleLogout()} type="button">
            ログアウト
          </button>
        </div>
      </header>

      <section className="toolbar">
        <p className="status-text">
          {loadingMessages ? "更新中です。" : status || "30秒ごとに自動更新します。"}
        </p>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="message-layout">
        <MessageList messages={messages} onSelect={handleSelect} selectedId={selectedId} />
        <MessageDetail message={selectedMessage} />
      </section>
    </main>
  );
}

function MessageList({
  messages,
  onSelect,
  selectedId,
}: {
  messages: MessageView[];
  onSelect: (messageId: string) => void;
  selectedId: null | string;
}) {
  if (!messages.length) {
    return <div className="panel">表示できるメッセージはありません。</div>;
  }

  return (
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
  );
}

function MessageDetail({ message }: { message: MessageView | null }) {
  const source = useMemo(() => (message ? sourceLabel(message) : ""), [message]);

  if (!message) {
    return <aside className="panel message-detail-panel">一覧からメッセージを選択してください。</aside>;
  }

  return (
    <aside className="panel message-detail-panel">
      <div className="message-meta">
        <strong>{message.senderDisplayName}</strong>
        <span>{formatTime(message.sentAt)}</span>
        <span>{source}</span>
      </div>
      <p className="detail-text">{message.text}</p>
    </aside>
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
