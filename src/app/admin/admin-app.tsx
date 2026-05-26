"use client";

import { useEffect, useState } from "react";
import type { CronRunView, LineAccountView, MessageView } from "@/features/messages/types";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message: string;
  };
};

type SessionResponse = {
  authenticated: boolean;
};

type SettingsResponse = {
  settings: LineAccountView;
};

type MessagesResponse = {
  messages: MessageView[];
};

type CronRunsResponse = {
  runs: CronRunView[];
};

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminId, setAdminId] = useState("admin");
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState<LineAccountView | null>(null);
  const [viewerPassword, setViewerPassword] = useState("");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [cronRuns, setCronRuns] = useState<CronRunView[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetchJson<SessionResponse>("/api/admin/session").then(async (result) => {
      if (!active) {
        return;
      }

      const nextAuthenticated = Boolean(result.data?.authenticated);
      setAuthenticated(nextAuthenticated);
      setCheckingSession(false);

      if (nextAuthenticated) {
        await loadAdminData();
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function loadAdminData() {
    setError("");
    const [settingsResult, messagesResult, cronRunsResult] = await Promise.all([
      fetchJson<SettingsResponse>("/api/admin/settings"),
      fetchJson<MessagesResponse>("/api/admin/messages?limit=100"),
      fetchJson<CronRunsResponse>("/api/admin/cron-runs"),
    ]);

    if (settingsResult.error || messagesResult.error || cronRunsResult.error) {
      setError(
        settingsResult.error?.message ??
          messagesResult.error?.message ??
          cronRunsResult.error?.message ??
          "管理データを取得できません。",
      );
      return;
    }

    setSettings(settingsResult.data?.settings ?? null);
    setMessages(messagesResult.data?.messages ?? []);
    setCronRuns(cronRunsResult.data?.runs ?? []);
    setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result = await fetchJson<SessionResponse>("/api/admin/login", {
      body: JSON.stringify({ adminId, password }),
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
    await loadAdminData();
  }

  async function handleLogout() {
    await fetchJson("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setSettings(null);
    setMessages([]);
    setCronRuns([]);
  }

  async function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settings) {
      return;
    }

    const result = await fetchJson<SettingsResponse>("/api/admin/settings", {
      body: JSON.stringify({
        displayName: settings.displayName,
        retentionDays: settings.retentionDays,
        viewerPassword,
        viewerSharedId: settings.viewerSharedId,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setSettings(result.data?.settings ?? settings);
    setViewerPassword("");
    setStatus("設定を更新しました。");
  }

  async function handleDelete(message: MessageView) {
    const ok = window.confirm("このメッセージを削除します。");

    if (!ok) {
      return;
    }

    const result = await fetchJson(`/api/admin/messages/${encodeURIComponent(message.messageId)}`, {
      method: "DELETE",
    });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessages((current) => current.filter((item) => item.messageId !== message.messageId));
    setStatus("メッセージを削除しました。");
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
            <h1>管理画面</h1>
            <p>管理者IDとパスワードでログインします。</p>
          </div>
          <form className="form-stack" onSubmit={handleLogin}>
            <label>
              管理者ID
              <input
                autoComplete="username"
                onChange={(event) => setAdminId(event.target.value)}
                value={adminId}
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
          <h1>管理画面</h1>
          <p>LINEメッセージ閲覧設定と削除操作</p>
        </div>
        <div className="admin-actions">
          <button className="secondary" onClick={() => void loadAdminData()} type="button">
            更新
          </button>
          <button className="secondary" onClick={() => void handleLogout()} type="button">
            ログアウト
          </button>
        </div>
      </header>

      {status ? <p className="status-text">{status}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {settings ? (
        <section className="panel">
          <h2>設定</h2>
          <form className="settings-grid" onSubmit={handleSettingsSubmit}>
            <label>
              LINE表示名
              <input
                onChange={(event) =>
                  setSettings((current) =>
                    current ? { ...current, displayName: event.target.value } : current,
                  )
                }
                value={settings.displayName}
              />
            </label>
            <label>
              保存日数
              <input
                min={1}
                onChange={(event) =>
                  setSettings((current) =>
                    current ? { ...current, retentionDays: Number(event.target.value) } : current,
                  )
                }
                type="number"
                value={settings.retentionDays}
              />
            </label>
            <label>
              共有ID
              <input
                onChange={(event) =>
                  setSettings((current) =>
                    current ? { ...current, viewerSharedId: event.target.value } : current,
                  )
                }
                value={settings.viewerSharedId}
              />
            </label>
            <label>
              共有パスワード変更
              <input
                autoComplete="new-password"
                onChange={(event) => setViewerPassword(event.target.value)}
                placeholder="変更する場合のみ入力"
                type="password"
                value={viewerPassword}
              />
            </label>
            <div className="full">
              <button type="submit">設定を保存</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>メッセージ</h2>
        <div className="table-like">
          {messages.length ? (
            messages.map((message) => (
              <div className="message-row" key={message.messageId}>
                <span className="message-meta">
                  <strong>{message.senderDisplayName}</strong>
                  <span>{formatTime(message.sentAt)}</span>
                  <span>{message.sourceType === "group" ? message.sourceGroupName : "個別トーク"}</span>
                </span>
                <span className="message-text">{message.text}</span>
                <div className="admin-actions">
                  <button className="danger" onClick={() => void handleDelete(message)} type="button">
                    削除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="status-text">表示できるメッセージはありません。</p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>自動削除履歴</h2>
        <div className="table-like">
          {cronRuns.length ? (
            cronRuns.map((run) => (
              <div className="message-row" key={run.runId}>
                <span className="message-meta">
                  <strong>{run.status}</strong>
                  <span>{formatTime(run.startedAt)}</span>
                  <span>削除 {run.deletedCount}</span>
                  <span>保護 {run.protectedCount}</span>
                </span>
                {run.skippedReason ? <span className="status-text">{run.skippedReason}</span> : null}
              </div>
            ))
          ) : (
            <p className="status-text">履歴はありません。</p>
          )}
        </div>
      </section>
    </main>
  );
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
