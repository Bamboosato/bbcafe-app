"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterMessages,
  matchesMessageFilter,
  MESSAGE_FILTER_OPTIONS,
  type MessageFilter,
} from "@/features/messages/messageFilter";
import type {
  AutomationSettingsView,
  MessageView,
  SendRunView,
  UserInfoView,
} from "@/features/messages/types";

type ViewerView = "generated-message" | "messages" | "sent" | "users";

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

type UsersResponse = {
  users: UserInfoView[];
};

type UserResponse = {
  user: UserInfoView;
};

type MessageResponse = {
  message: MessageView;
};

type SentRunsResponse = {
  runs: SendRunView[];
};

type AutomationSettingsResponse = {
  settings: AutomationSettingsView;
};

type AppVersionResponse = {
  version: string;
};

type PushPublicKeyResponse = {
  publicKey: string;
};

type GenerateMessageResponse = {
  location: string;
  message: string;
  warning?: string;
};

type SendGeneratedMessageResponse = {
  failedCount: number;
  run?: SendRunView | null;
  sentCount: number;
  totalCount: number;
};

export default function ViewerApp({
  appVersion,
  initialView = "messages",
}: {
  appVersion: string;
  initialView?: ViewerView;
}) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sharedId, setSharedId] = useState("bbcafe");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [sentRuns, setSentRuns] = useState<SendRunView[]>([]);
  const [users, setUsers] = useState<UserInfoView[]>([]);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [selectedMessage, setSelectedMessage] = useState<MessageView | null>(null);
  const [selectedSendRun, setSelectedSendRun] = useState<SendRunView | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [generatedMessageLocation, setGeneratedMessageLocation] = useState("");
  const [generatedMessageStatus, setGeneratedMessageStatus] = useState("");
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [sendingGeneratedMessage, setSendingGeneratedMessage] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<AutomationSettingsView | null>(null);
  const [savingAutomationSettings, setSavingAutomationSettings] = useState(false);
  const [pushCapabilityChecked, setPushCapabilityChecked] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState("");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushUpdating, setPushUpdating] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingSentRuns, setLoadingSentRuns] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const authenticatedRef = useRef(false);
  const loadingMessagesRef = useRef(false);
  const loadingSentRunsRef = useRef(false);
  const loadingUsersRef = useRef(false);

  const selectedId = selectedMessage?.messageId ?? null;
  const filteredMessages = useMemo(() => filterMessages(messages, messageFilter), [messages, messageFilter]);
  const selectedUsers = useMemo(
    () => users.filter((user) => user.broadcastSelected),
    [users],
  );
  const selectedUserIds = useMemo(() => selectedUsers.map((user) => user.userId), [selectedUsers]);
  const currentView = initialView;
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

  const loadUsers = useCallback(async () => {
    if (loadingUsersRef.current) {
      return;
    }

    loadingUsersRef.current = true;
    setLoadingUsers(true);
    setError("");

    try {
      const result = await fetchJson<UsersResponse>("/api/users", {
        cache: "no-store",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setUsers(result.data?.users ?? []);
      setStatus(`ユーザ情報の最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingUsersRef.current = false;
      setLoadingUsers(false);
    }
  }, []);

  const loadSentRuns = useCallback(async () => {
    if (loadingSentRunsRef.current) {
      return;
    }

    loadingSentRunsRef.current = true;
    setLoadingSentRuns(true);
    setError("");

    try {
      const result = await fetchJson<SentRunsResponse>("/api/sent-messages?limit=100", {
        cache: "no-store",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const nextRuns = result.data?.runs ?? [];
      setSentRuns(nextRuns);
      setSelectedSendRun((current) =>
        current && !nextRuns.some((run) => run.runId === current.runId) ? null : current,
      );
      setStatus(`送信履歴の最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingSentRunsRef.current = false;
      setLoadingSentRuns(false);
    }
  }, []);

  const loadAutomationSettings = useCallback(async () => {
    setError("");

    const result = await fetchJson<AutomationSettingsResponse>("/api/message-assistant/automation-settings", {
      cache: "no-store",
    });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setAutomationSettings(result.data?.settings ?? null);
  }, []);

  function navigateToView(view: ViewerView) {
    setAccountMenuOpen(false);
    setNavMenuOpen(false);
    setSelectedMessage(null);
    setSelectedSendRun(null);
    router.push(routeForView(view));
  }

  function showUserInfoView() {
    navigateToView("users");
  }

  function showGeneratedMessageView() {
    navigateToView("generated-message");
  }

  function showMessageView() {
    navigateToView("messages");
  }

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
    if (!authenticated) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (currentView === "users") {
        void loadUsers();
      }

      if (currentView === "generated-message") {
        if (users.length === 0) {
          void loadUsers();
        }
        void loadAutomationSettings();
      }

      if (currentView === "sent") {
        void loadSentRuns();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authenticated, currentView, loadAutomationSettings, loadSentRuns, loadUsers, users.length]);

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
        if (event.data?.url === "/sent") {
          void loadSentRuns();
          return;
        }

        refreshVisibleMessages();
      }
    }

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);

    return () => navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }, [loadSentRuns, refreshVisibleMessages]);

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
    if (!accountMenuOpen && !navMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        accountMenuRef.current?.contains(event.target as Node) ||
        navMenuRef.current?.contains(event.target as Node)
      ) {
        return;
      }

      setAccountMenuOpen(false);
      setNavMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [accountMenuOpen, navMenuOpen]);

  useEffect(() => {
    if (!selectedMessage && !selectedSendRun && !accountMenuOpen && !navMenuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setSelectedMessage(null);
      setSelectedSendRun(null);
      setAccountMenuOpen(false);
      setNavMenuOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountMenuOpen, navMenuOpen, selectedMessage, selectedSendRun]);

  useEffect(() => {
    if (!selectedMessage && !selectedSendRun) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedMessage, selectedSendRun]);

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
    if (currentView === "messages") {
      await loadMessages();
    } else if (currentView === "users") {
      await loadUsers();
    } else if (currentView === "sent") {
      await loadSentRuns();
    } else {
      await Promise.all([loadUsers(), loadAutomationSettings()]);
    }
  }

  async function handleLogout() {
    if (pushEnabled) {
      await disablePushNotifications({ silent: true }).catch(() => undefined);
    }

    await fetchJson("/api/viewer/logout", { method: "POST" });
    setAuthenticated(false);
    setAccountMenuOpen(false);
    setNavMenuOpen(false);
    setMessageFilter("all");
    setMessages([]);
    setSentRuns([]);
    setUsers([]);
    setSelectedSendRun(null);
    setAutomationSettings(null);
    setGeneratedMessage("");
    setGeneratedMessageLocation("");
    setGeneratedMessageStatus("");
    setPushCapabilityChecked(false);
    setPushEnabled(false);
    setPushStatus("");
    setPushSupported(false);
    setPushUpdating(false);
    setSelectedMessage(null);
    router.push("/");
  }

  function handleFilterChange(nextFilter: MessageFilter) {
    setMessageFilter(nextFilter);
    setSelectedMessage((current) => (current && !matchesMessageFilter(current, nextFilter) ? null : current));
  }

  async function handleUserSelectionChange(userId: string, selected: boolean) {
    const previousUsers = users;

    setError("");
    setUsers((current) =>
      current.map((user) => (user.userId === userId ? { ...user, broadcastSelected: selected } : user)),
    );

    const result = await fetchJson<UserResponse>(`/api/users/${encodeURIComponent(userId)}`, {
      body: JSON.stringify({ selected }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    if (result.error || !result.data?.user) {
      setUsers(previousUsers);
      setError(result.error?.message ?? "ユーザ情報を更新できません。");
      return;
    }

    setUsers((current) =>
      current.map((user) => (user.userId === userId ? result.data?.user ?? user : user)),
    );
  }

  async function handleGenerateMessage() {
    setError("");
    setGeneratedMessageStatus("");
    setGeneratingMessage(true);

    try {
      const result = await fetchJson<GenerateMessageResponse>("/api/message-assistant/generate", {
        method: "POST",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setGeneratedMessage(result.data?.message ?? "");
      setGeneratedMessageLocation(result.data?.location ?? "");
      setGeneratedMessageStatus(result.data?.warning ?? "メッセージを作成しました。");
    } finally {
      setGeneratingMessage(false);
    }
  }

  async function handleSendGeneratedMessage() {
    setError("");
    setGeneratedMessageStatus("");
    setSendingGeneratedMessage(true);

    try {
      const result = await fetchJson<SendGeneratedMessageResponse>("/api/message-assistant/send", {
        body: JSON.stringify({
          message: generatedMessage,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const sentCount = result.data?.sentCount ?? 0;
      const failedCount = result.data?.failedCount ?? 0;
      setGeneratedMessageStatus(
        failedCount > 0
          ? `${sentCount}件送信しました。${failedCount}件は送信できませんでした。`
          : `${sentCount}件のユーザに送信しました。`,
      );
      void loadSentRuns();
    } finally {
      setSendingGeneratedMessage(false);
    }
  }

  async function handleAutomationEnabledChange(enabled: boolean) {
    const previousSettings = automationSettings;

    setSavingAutomationSettings(true);
    setError("");
    setAutomationSettings((current) => (current ? { ...current, enabled } : current));

    try {
      const result = await fetchJson<AutomationSettingsResponse>("/api/message-assistant/automation-settings", {
        body: JSON.stringify({ enabled }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (result.error || !result.data?.settings) {
        setAutomationSettings(previousSettings);
        setError(result.error?.message ?? "自動送信設定を更新できません。");
        return;
      }

      setAutomationSettings(result.data.settings);
      setGeneratedMessageStatus(enabled ? "自動送信を有効にしました。" : "自動送信を停止しました。");
    } finally {
      setSavingAutomationSettings(false);
    }
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
          <div className="nav-menu" ref={navMenuRef}>
            <button
              aria-expanded={navMenuOpen}
              aria-haspopup="menu"
              aria-label="メニューを開く"
              className={`hamburger-button ${navMenuOpen ? "active" : ""}`}
              onClick={() => setNavMenuOpen((current) => !current)}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
            {navMenuOpen ? (
              <div className="nav-popover" role="menu">
                <NavMenuItems currentView={currentView} onNavigate={navigateToView} />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <AppTabs currentView={currentView} />

      {error ? (
        <section className="toolbar">
          <p className="error-text">{error}</p>
        </section>
      ) : null}

      {currentView === "messages" ? (
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
      ) : null}

      {currentView === "users" ? (
        <UserInfoScreen
          loading={loadingUsers}
          onBack={showMessageView}
          onRefresh={() => void loadUsers()}
          onSelectionChange={handleUserSelectionChange}
          selectedUserIds={selectedUserIds}
          statusText={status || "取得済みのユーザ情報を表示します。"}
          users={users}
        />
      ) : null}

      {currentView === "sent" ? (
        <SentHistoryScreen
          loading={loadingSentRuns}
          onRefresh={() => void loadSentRuns()}
          onSelect={setSelectedSendRun}
          runs={sentRuns}
          statusText={status || "送信履歴を表示します。"}
        />
      ) : null}

      {currentView === "generated-message" ? (
        <GeneratedMessageScreen
          automationSettings={automationSettings}
          generating={generatingMessage}
          loadingUsers={loadingUsers}
          message={generatedMessage}
          location={generatedMessageLocation}
          onAutomationEnabledChange={(enabled) => void handleAutomationEnabledChange(enabled)}
          onBack={showMessageView}
          onGenerate={() => void handleGenerateMessage()}
          onMessageChange={setGeneratedMessage}
          onOpenUsers={showUserInfoView}
          onSend={() => void handleSendGeneratedMessage()}
          selectedUsers={selectedUsers}
          savingAutomationSettings={savingAutomationSettings}
          sending={sendingGeneratedMessage}
          statusText={generatedMessageStatus}
        />
      ) : null}
      <MessageDetailModal message={selectedMessage} onClose={closeMessageModal} />
      <SendRunDetailModal run={selectedSendRun} onClose={() => setSelectedSendRun(null)} />
    </main>
  );
}

const VIEW_ITEMS: Array<{ label: string; view: ViewerView }> = [
  { label: "受信履歴", view: "messages" },
  { label: "送信履歴", view: "sent" },
  { label: "ユーザ情報", view: "users" },
  { label: "メッセージ送信", view: "generated-message" },
];

function AppTabs({ currentView }: { currentView: ViewerView }) {
  return (
    <nav aria-label="画面切り替え" className="app-tabs">
      {VIEW_ITEMS.map((item) => (
        <Link
          aria-current={item.view === currentView ? "page" : undefined}
          className={`app-tab ${item.view === currentView ? "active" : ""}`}
          href={routeForView(item.view)}
          key={item.view}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function NavMenuItems({
  currentView,
  onNavigate,
}: {
  currentView: ViewerView;
  onNavigate: (view: ViewerView) => void;
}) {
  return (
    <>
      {VIEW_ITEMS.map((item) => (
        <button
          aria-current={item.view === currentView ? "page" : undefined}
          className={`secondary nav-menu-item ${item.view === currentView ? "active" : ""}`}
          key={item.view}
          onClick={() => onNavigate(item.view)}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </>
  );
}

function routeForView(view: ViewerView) {
  if (view === "sent") {
    return "/sent";
  }

  if (view === "users") {
    return "/users";
  }

  if (view === "generated-message") {
    return "/send";
  }

  return "/";
}

function UserInfoScreen({
  loading,
  onBack,
  onRefresh,
  onSelectionChange,
  selectedUserIds,
  statusText,
  users,
}: {
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSelectionChange: (userId: string, selected: boolean) => void;
  selectedUserIds: string[];
  statusText: string;
  users: UserInfoView[];
}) {
  return (
    <section className="user-info-screen">
      <div className="user-info-header">
        <div>
          <h2>ユーザ情報</h2>
          <p className="status-text">{loading ? "ユーザ情報を更新中です。" : statusText}</p>
        </div>
        <div className="user-info-actions">
          <button className="secondary" onClick={onBack} type="button">
            メッセージへ戻る
          </button>
          <button onClick={onRefresh} type="button" disabled={loading}>
            更新
          </button>
        </div>
      </div>

      {users.length ? (
        <div className="user-info-list" role="list">
          {users.map((user) => (
            <article className="user-info-card" key={user.userId} role="listitem">
              <label className="user-info-checkbox" aria-label={`${user.userName}を選択`}>
                <input
                  checked={selectedUserIds.includes(user.userId)}
                  onChange={(event) => onSelectionChange(user.userId, event.target.checked)}
                  type="checkbox"
                />
              </label>
              <dl className="user-info-details">
                <div>
                  <dt>アカウント名</dt>
                  <dd>{user.userName}</dd>
                </div>
                <div>
                  <dt>USER ID</dt>
                  <dd>{user.userId}</dd>
                </div>
                <div>
                  <dt>初回保存日時</dt>
                  <dd>{formatTime(user.firstSeenAt)}</dd>
                </div>
                <div>
                  <dt>最終確認日時</dt>
                  <dd>{formatTime(user.lastSeenAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel empty-message-panel">
          {loading ? "ユーザ情報を読み込んでいます。" : "表示できるユーザ情報はありません。"}
        </div>
      )}
    </section>
  );
}

function SentHistoryScreen({
  loading,
  onRefresh,
  onSelect,
  runs,
  statusText,
}: {
  loading: boolean;
  onRefresh: () => void;
  onSelect: (run: SendRunView) => void;
  runs: SendRunView[];
  statusText: string;
}) {
  return (
    <section className="sent-history-screen">
      <div className="sent-history-header">
        <div>
          <h2>送信履歴</h2>
          <p className="status-text">{loading ? "送信履歴を更新中です。" : statusText}</p>
        </div>
        <button onClick={onRefresh} type="button" disabled={loading}>
          更新
        </button>
      </div>

      {runs.length ? (
        <div className="sent-run-list">
          {runs.map((run) => (
            <button className="sent-run-row" key={run.runId} onClick={() => onSelect(run)} type="button">
              <span className="message-meta">
                <strong>{formatSendRunMode(run.mode)}</strong>
                <span>{formatTime(run.sentAt)}</span>
                <span>{formatSendRunStatus(run.status)}</span>
                <span>対象 {run.targetCount}</span>
                <span>成功 {run.successCount}</span>
                <span>失敗 {run.failedCount}</span>
              </span>
              <span className="message-text">{run.messageText || "本文は保存されていません。"}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel empty-message-panel">送信履歴はありません。</div>
      )}
    </section>
  );
}


function GeneratedMessageScreen({
  automationSettings,
  generating,
  loadingUsers,
  location,
  message,
  onAutomationEnabledChange,
  onBack,
  onGenerate,
  onMessageChange,
  onOpenUsers,
  onSend,
  selectedUsers,
  savingAutomationSettings,
  sending,
  statusText,
}: {
  automationSettings: AutomationSettingsView | null;
  generating: boolean;
  loadingUsers: boolean;
  location: string;
  message: string;
  onAutomationEnabledChange: (enabled: boolean) => void;
  onBack: () => void;
  onGenerate: () => void;
  onMessageChange: (message: string) => void;
  onOpenUsers: () => void;
  onSend: () => void;
  selectedUsers: UserInfoView[];
  savingAutomationSettings: boolean;
  sending: boolean;
  statusText: string;
}) {
  const selectedUserNames = selectedUsers.map((user) => user.userName).join("、");

  return (
    <section className="generated-message-screen">
      <div className="generated-message-header">
        <div>
          <h2>メッセージ</h2>
          <p className="status-text">
            作成ボタンで今日の一言メッセージを自動生成し、選択中のユーザへ送信します。
          </p>
        </div>
        <div className="generated-message-actions">
          <button className="secondary" onClick={onBack} type="button">
            メッセージへ戻る
          </button>
          <button className="secondary" disabled={loadingUsers} onClick={onOpenUsers} type="button">
            {loadingUsers ? "ユーザ情報を読込中..." : "ユーザ情報を選択"}
          </button>
        </div>
      </div>

      <div className="panel generated-message-panel">
        <div className="generated-message-toolbar">
          <button disabled={generating || sending} onClick={onGenerate} type="button">
            {generating ? "作成中..." : "作成"}
          </button>
          <button
            disabled={!message.trim() || selectedUsers.length === 0 || generating || sending}
            onClick={onSend}
            type="button"
          >
            {sending ? "送信中..." : "送信"}
          </button>
        </div>

        <div className="generated-message-targets">
          <span>送信先</span>
          <strong>{selectedUsers.length ? `${selectedUsers.length}名：${selectedUserNames}` : "未選択"}</strong>
        </div>

        {location ? <p className="status-text">対象地域: {location}</p> : null}
        {statusText ? <p aria-live="polite" className="status-text">{statusText}</p> : null}

        <label>
          メッセージ本文
          <textarea
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="作成ボタンを押すと、ここにメッセージが表示されます。"
            rows={8}
            value={message}
          />
        </label>
      </div>

      <section className="panel automation-settings-panel">
        <div className="automation-settings-header">
          <div>
            <h3>自動送信設定</h3>
            <p className="status-text">毎朝の自動送信は選択中のユーザに送信されます。</p>
          </div>
          <label className="notification-toggle automation-toggle">
            <span className="notification-toggle-copy">
              <span className="notification-toggle-title">自動送信</span>
              <span className="notification-toggle-state">
                {automationSettings?.enabled ? "オン" : "オフ"}
              </span>
            </span>
            <span className="toggle-switch">
              <input
                aria-label="自動送信"
                checked={Boolean(automationSettings?.enabled)}
                disabled={!automationSettings || savingAutomationSettings}
                onChange={(event) => onAutomationEnabledChange(event.target.checked)}
                role="switch"
                type="checkbox"
              />
              <span className="toggle-slider" />
            </span>
          </label>
        </div>
        <dl className="automation-settings-grid">
          <div>
            <dt>送信時刻</dt>
            <dd>{automationSettings?.sendTimeJst ?? "07:00"}</dd>
          </div>
          <div>
            <dt>タイムゾーン</dt>
            <dd>日本時間</dd>
          </div>
          <div>
            <dt>送信履歴保存期間</dt>
            <dd>{automationSettings?.historyRetentionDays ?? 180}日</dd>
          </div>
        </dl>
      </section>
    </section>
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

function SendRunDetailModal({ run, onClose }: { run: SendRunView | null; onClose: () => void }) {
  if (!run) {
    return null;
  }

  const failedTargets = run.targets.filter((target) => target.status === "failed");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        aria-label="送信履歴詳細"
        aria-modal="true"
        className="message-modal send-run-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="閉じる" className="secondary modal-close-button" onClick={onClose} type="button">
          ×
        </button>
        <dl className="send-run-detail-meta">
          <div>
            <dt>送信種別</dt>
            <dd>{formatSendRunMode(run.mode)}</dd>
          </div>
          <div>
            <dt>送信日時</dt>
            <dd>{formatTime(run.sentAt)}</dd>
          </div>
          <div>
            <dt>ステータス</dt>
            <dd>{formatSendRunStatus(run.status)}</dd>
          </div>
          <div>
            <dt>結果</dt>
            <dd>
              対象 {run.targetCount} / 成功 {run.successCount} / 失敗 {run.failedCount}
            </dd>
          </div>
        </dl>
        <div className="send-run-detail-section">
          <h3>本文</h3>
          <p className="message-modal-text">{run.messageText || "本文は保存されていません。"}</p>
        </div>
        <div className="send-run-detail-section">
          <h3>失敗ユーザ</h3>
          {failedTargets.length ? (
            <div className="failed-target-list">
              {failedTargets.map((target) => (
                <div className="failed-target-row" key={target.userId}>
                  <strong>{target.userName}</strong>
                  <span>{target.userId}</span>
                  <span>{target.errorCode ?? "送信失敗"}</span>
                  {typeof target.httpStatus === "number" ? <span>HTTP {target.httpStatus}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="status-text">失敗ユーザはありません。</p>
          )}
        </div>
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

function formatSendRunMode(mode: SendRunView["mode"]) {
  return mode === "auto" ? "自動" : "手動";
}

function formatSendRunStatus(status: SendRunView["status"]) {
  if (status === "success") {
    return "成功";
  }

  if (status === "partial_failed") {
    return "一部失敗";
  }

  return "失敗";
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
