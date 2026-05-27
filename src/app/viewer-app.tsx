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

type PushPublicKeyResponse = {
  publicKey: string;
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
  const [pushCapabilityChecked, setPushCapabilityChecked] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState("");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushUpdating, setPushUpdating] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const authenticatedRef = useRef(false);
  const loadingMessagesRef = useRef(false);

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
    if (loadingMessagesRef.current) {
      return;
    }

    loadingMessagesRef.current = true;
    setLoadingMessages(true);
    setError("");

    try {
      const result = await fetchJson<MessagesResponse>("/api/messages?limit=100", {
        cache: "no-store",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const nextMessages = result.data?.messages ?? [];
      setMessages(nextMessages);

      setSelectedMessage((current) =>
        current && !nextMessages.some((message) => message.messageId === current.messageId) ? null : current,
      );

      setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingMessagesRef.current = false;
      setLoadingMessages(false);
    }
  }, []);

  const refreshVisibleMessages = useCallback(() => {
    if (authenticatedRef.current) {
      void loadMessages();
    }
  }, [loadMessages]);

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
    authenticatedRef.current = authenticated;
  }, [authenticated]);

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
        refreshVisibleMessages();
      }
    }

    function handleFocus() {
      void checkForAppUpdate();
      refreshVisibleMessages();
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForAppUpdate, refreshVisibleMessages]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    function registerServiceWorker() {
      void ensureServiceWorkerRegistration();
    }

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker, { once: true });

    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    function handleServiceWorkerMessage(event: MessageEvent) {
      if (event.data?.type === "bbcafe:notification-click") {
        refreshVisibleMessages();
      }
    }

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);

    return () => navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }, [refreshVisibleMessages]);

  useEffect(() => {
    if (!authenticated) {
      return undefined;
    }

    let active = true;

    async function detectPushSubscription() {
      if (!isPushNotificationSupported()) {
        if (active) {
          setPushEnabled(false);
          setPushSupported(false);
          setPushCapabilityChecked(true);
        }
        return;
      }

      try {
        const registration = await ensureServiceWorkerRegistration();
        const subscription = await registration.pushManager.getSubscription();

        if (!active) {
          return;
        }

        setPushEnabled(Boolean(subscription));
        setPushSupported(true);
        setPushCapabilityChecked(true);
      } catch {
        if (active) {
          setPushEnabled(false);
          setPushSupported(false);
          setPushCapabilityChecked(true);
        }
      }
    }

    void detectPushSubscription();

    return () => {
      active = false;
    };
  }, [authenticated]);

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

  async function enablePushNotifications() {
    if (!isPushNotificationSupported()) {
      throw new Error("この端末では通知を利用できません。");
    }

    if (Notification.permission === "denied") {
      throw new Error("ブラウザで通知がブロックされています。");
    }

    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("通知が許可されませんでした。");
    }

    const publicKeyResult = await fetchJson<PushPublicKeyResponse>("/api/push/public-key", {
      cache: "no-store",
    });

    if (publicKeyResult.error || !publicKeyResult.data?.publicKey) {
      throw new Error(publicKeyResult.error?.message ?? "通知設定を取得できません。");
    }

    const registration = await ensureServiceWorkerRegistration();
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        applicationServerKey: urlBase64ToUint8Array(publicKeyResult.data.publicKey),
        userVisibleOnly: true,
      }));
    const result = await fetchJson<{ subscribed: boolean }>("/api/push/subscription", {
      body: JSON.stringify({ subscription: subscription.toJSON() }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (result.error) {
      if (!existingSubscription) {
        await subscription.unsubscribe().catch(() => undefined);
      }

      throw new Error(result.error.message);
    }

    setPushEnabled(true);
    setPushStatus("通知を有効にしました。");
  }

  async function disablePushNotifications({ silent = false }: { silent?: boolean } = {}) {
    if (!isPushNotificationSupported()) {
      setPushEnabled(false);
      return;
    }

    const registration = await ensureServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      setPushEnabled(false);
      if (!silent) {
        setPushStatus("通知は停止中です。");
      }
      return;
    }

    const result = await fetchJson<{ subscribed: boolean }>("/api/push/subscription", {
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "DELETE",
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    await subscription.unsubscribe();
    setPushEnabled(false);

    if (!silent) {
      setPushStatus("通知を停止しました。");
    }
  }

  async function handlePushToggle(nextEnabled: boolean) {
    setPushUpdating(true);
    setPushStatus("");
    setError("");

    try {
      if (nextEnabled) {
        await enablePushNotifications();
      } else {
        await disablePushNotifications();
      }
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "通知設定を更新できません。");
    } finally {
      setPushUpdating(false);
    }
  }

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
    if (pushEnabled) {
      await disablePushNotifications({ silent: true }).catch(() => undefined);
    }

    await fetchJson("/api/viewer/logout", { method: "POST" });
    setAuthenticated(false);
    setAccountMenuOpen(false);
    setMessageFilter("all");
    setMessages([]);
    setPushCapabilityChecked(false);
    setPushEnabled(false);
    setPushStatus("");
    setPushSupported(false);
    setPushUpdating(false);
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
                <div className="notification-setting" role="none">
                  <label className="notification-toggle">
                    <span className="notification-toggle-copy">
                      <span className="notification-toggle-title">新着通知</span>
                      <span className="notification-toggle-state">
                        {pushEnabled ? "オン" : "オフ"}
                      </span>
                    </span>
                    <span className="toggle-switch">
                      <input
                        aria-label="新着通知"
                        checked={pushEnabled}
                        disabled={pushUpdating || !pushCapabilityChecked || !pushSupported}
                        onChange={(event) => void handlePushToggle(event.target.checked)}
                        role="switch"
                        type="checkbox"
                      />
                      <span className="toggle-slider" />
                    </span>
                  </label>
                  {pushStatus || (pushCapabilityChecked && !pushSupported) ? (
                    <p aria-live="polite" className="notification-status">
                      {pushStatus || "この端末では通知を利用できません。"}
                    </p>
                  ) : null}
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

function isPushNotificationSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function ensureServiceWorkerRegistration() {
  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));

  await registration.update().catch(() => undefined);

  return registration;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
