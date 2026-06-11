"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  filterMessages,
  matchesMessageFilter,
  MESSAGE_FILTER_OPTIONS,
  type MessageFilter,
} from "@/features/messages/messageFilter";
import {
  filterSendRuns,
  SEND_RUN_FILTER_OPTIONS,
  type SendRunFilter,
} from "@/features/messages/sendRunFilter";
import { getClientAuth } from "@/lib/firebaseClient";
import type {
  AutomationSettingsView,
  CalendarEventView,
  CommonSettingsView,
  CronHistoryItemView,
  MessageView,
  SendRunView,
  UserInfoView,
} from "@/features/messages/types";

type ViewerView = "calendar" | "cron-runs" | "generated-message" | "home" | "messages" | "sent" | "settings" | "users";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message: string;
  };
};

type SessionResponse = {
  authenticated: boolean;
  displayName: null | string;
  email: null | string;
  lineAccountId: null | string;
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

type CalendarEventsResponse = {
  events: CalendarEventView[];
  todayEvents: CalendarEventView[];
};

type CalendarEventResponse = {
  event: CalendarEventView;
};

type CalendarEventDraft = {
  enabled: boolean;
  eventText: string;
  monthDay: string;
};

type MessageResponse = {
  message: MessageView;
};

type SentRunsResponse = {
  runs: SendRunView[];
};

type SentRunResponse = {
  run: SendRunView;
};

type AutomationSettingsResponse = {
  settings: AutomationSettingsView;
};

type CommonSettingsResponse = {
  settings: CommonSettingsView;
};

type CronHistoryResponse = {
  items: CronHistoryItemView[];
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

type HomeConfirmationTarget = {
  confirmationStatus: NonNullable<SendRunView["targets"][number]["confirmationStatus"]>;
  reminderSentAt: null | string;
  runId: string;
  sentAt: string;
  userId: string;
  userName: string;
};

export default function ViewerApp({
  appVersion,
  initialView = "home",
}: {
  appVersion: string;
  initialView?: ViewerView;
}) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [accountEmail, setAccountEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [sentRuns, setSentRuns] = useState<SendRunView[]>([]);
  const [users, setUsers] = useState<UserInfoView[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventView[]>([]);
  const [todayCalendarEvents, setTodayCalendarEvents] = useState<CalendarEventView[]>([]);
  const [commonSettings, setCommonSettings] = useState<CommonSettingsView | null>(null);
  const [commonSettingsChannelAccessToken, setCommonSettingsChannelAccessToken] = useState("");
  const [commonSettingsChannelSecret, setCommonSettingsChannelSecret] = useState("");
  const [cronHistoryItems, setCronHistoryItems] = useState<CronHistoryItemView[]>([]);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [sendRunFilter, setSendRunFilter] = useState<SendRunFilter>("all");
  const [selectedMessage, setSelectedMessage] = useState<MessageView | null>(null);
  const [selectedSendRun, setSelectedSendRun] = useState<SendRunView | null>(null);
  const [manualSendUserIds, setManualSendUserIds] = useState<string[]>([]);
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
  const [loadingCalendarEvents, setLoadingCalendarEvents] = useState(false);
  const [loadingCommonSettings, setLoadingCommonSettings] = useState(false);
  const [loadingCronHistory, setLoadingCronHistory] = useState(false);
  const [savingCommonSettings, setSavingCommonSettings] = useState(false);
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [submittingReset, setSubmittingReset] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const authenticatedRef = useRef(false);
  const loadingMessagesRef = useRef(false);
  const loadingSentRunsRef = useRef(false);
  const loadingUsersRef = useRef(false);
  const loadingCalendarEventsRef = useRef(false);
  const loadingCommonSettingsRef = useRef(false);
  const loadingCronHistoryRef = useRef(false);
  const selectableManualSendUserIdsRef = useRef<string[]>([]);

  const selectedId = selectedMessage?.messageId ?? null;
  const filteredMessages = useMemo(() => filterMessages(messages, messageFilter), [messages, messageFilter]);
  const filteredSentRuns = useMemo(() => filterSendRuns(sentRuns, sendRunFilter), [sentRuns, sendRunFilter]);
  const selectedUsers = useMemo(
    () => users.filter((user) => user.broadcastSelected),
    [users],
  );
  const selectedUserIds = useMemo(() => selectedUsers.map((user) => user.userId), [selectedUsers]);
  const manualSendUsers = useMemo(() => {
    const manualSendUserIdSet = new Set(manualSendUserIds);

    return selectedUsers.filter((user) => manualSendUserIdSet.has(user.userId));
  }, [manualSendUserIds, selectedUsers]);
  const currentView = initialView;
  const viewItems = VIEW_ITEMS;
  const messageListStatus = loadingMessages ? "更新中です。" : status || "更新ボタンで最新の受信履歴を取得します。";

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
      setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingUsersRef.current = false;
      setLoadingUsers(false);
    }
  }, []);

  const loadCalendarEvents = useCallback(async () => {
    if (loadingCalendarEventsRef.current) {
      return;
    }

    loadingCalendarEventsRef.current = true;
    setLoadingCalendarEvents(true);
    setError("");

    try {
      const result = await fetchJson<CalendarEventsResponse>("/api/calendar-events", {
        cache: "no-store",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setCalendarEvents(result.data?.events ?? []);
      setTodayCalendarEvents(result.data?.todayEvents ?? []);
      setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingCalendarEventsRef.current = false;
      setLoadingCalendarEvents(false);
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
      setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
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

  const loadCommonSettings = useCallback(async () => {
    if (loadingCommonSettingsRef.current) {
      return;
    }

    loadingCommonSettingsRef.current = true;
    setLoadingCommonSettings(true);
    setError("");

    try {
      const result = await fetchJson<CommonSettingsResponse>("/api/admin/common-settings", {
        cache: "no-store",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const nextSettings = result.data?.settings ?? null;
      setCommonSettings(nextSettings);

      setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingCommonSettingsRef.current = false;
      setLoadingCommonSettings(false);
    }
  }, []);

  const loadCronHistory = useCallback(async () => {
    if (loadingCronHistoryRef.current) {
      return;
    }

    loadingCronHistoryRef.current = true;
    setLoadingCronHistory(true);
    setError("");

    try {
      const result = await fetchJson<CronHistoryResponse>("/api/admin/cron-history?limit=20", {
        cache: "no-store",
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setCronHistoryItems(result.data?.items ?? []);
      setStatus(`最終更新: ${formatTime(new Date().toISOString())}`);
    } finally {
      loadingCronHistoryRef.current = false;
      setLoadingCronHistory(false);
    }
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

  const refreshVisibleMessages = useCallback(() => {
    if (authenticatedRef.current && currentView === "messages") {
      void loadMessages();
    }
  }, [currentView, loadMessages]);

  const establishSession = useCallback(async (idToken: string) => {
    const result = await fetchJson<SessionResponse>("/api/auth/login", {
      body: JSON.stringify({ idToken }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (result.error || !result.data?.authenticated) {
      throw new Error(result.error?.message ?? "ログインできません。");
    }

    setAccountEmail(result.data.email ?? "");
    setAuthenticated(true);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;

    try {
      const auth = getClientAuth();

      unsubscribe = onAuthStateChanged(auth, (user) => {
        void (async () => {
          if (!active) {
            return;
          }

          if (!user) {
            await fetchJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
            setAuthenticated(false);
            setAccountEmail("");
            setCheckingSession(false);
            return;
          }

          try {
            await establishSession(await user.getIdToken());
          } catch (error) {
            setAuthenticated(false);
            setAccountEmail("");
            setError(error instanceof Error ? error.message : "ログインできません。");
          } finally {
            if (active) {
              setCheckingSession(false);
            }
          }
        })();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firebase Authの設定が不足しています。";

      window.setTimeout(() => {
        if (!active) {
          return;
        }

        setAuthenticated(false);
        setError(message);
        setCheckingSession(false);
      }, 0);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [establishSession]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (currentView === "messages") {
        void loadMessages();
      }

      if (currentView === "home") {
        void loadSentRuns();
        void loadUsers();
        void loadCalendarEvents();
        void loadCronHistory();
      }

      if (currentView === "users") {
        void loadUsers();
      }

      if (currentView === "generated-message") {
        if (users.length === 0) {
          void loadUsers();
        }
        void loadAutomationSettings();
        void loadCalendarEvents();
      }

      if (currentView === "sent") {
        void loadSentRuns();
      }

      if (currentView === "settings") {
        void loadCommonSettings();
      }

      if (currentView === "cron-runs") {
        void loadCronHistory();
      }

      if (currentView === "calendar") {
        void loadCalendarEvents();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    authenticated,
    currentView,
    loadAutomationSettings,
    loadCalendarEvents,
    loadCommonSettings,
    loadCronHistory,
    loadMessages,
    loadSentRuns,
    loadUsers,
    users.length,
  ]);

  useEffect(() => {
    authenticatedRef.current = authenticated;
  }, [authenticated]);

  useEffect(() => {
    const previousSelectableIds = selectableManualSendUserIdsRef.current;
    const previousSelectableIdSet = new Set(previousSelectableIds);
    const nextSelectableIdSet = new Set(selectedUserIds);

    setManualSendUserIds((current) => {
      const retainedIds = current.filter((userId) => nextSelectableIdSet.has(userId));
      const addedIds = selectedUserIds.filter((userId) => !previousSelectableIdSet.has(userId));

      return [...retainedIds, ...addedIds];
    });
    selectableManualSendUserIdsRef.current = selectedUserIds;
  }, [selectedUserIds]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkForAppUpdate();
      }
    }

    function handleFocus() {
      void checkForAppUpdate();
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForAppUpdate]);

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
    setSubmittingLogin(true);

    try {
      const auth = getClientAuth();
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await establishSession(await credential.user.getIdToken());
      setPassword("");
    } catch (error) {
      setError(error instanceof Error ? "メールアドレスまたはパスワードが正しくありません。" : "ログインできません。");
    } finally {
      setSubmittingLogin(false);
    }
  }

  async function handleLogout() {
    if (pushEnabled) {
      await disablePushNotifications({ silent: true }).catch(() => undefined);
    }

    await fetchJson("/api/auth/logout", { method: "POST" });
    await signOut(getClientAuth()).catch(() => undefined);
    setAuthenticated(false);
    setAccountEmail("");
    setAccountMenuOpen(false);
    setNavMenuOpen(false);
    setMessageFilter("all");
    setMessages([]);
    setSentRuns([]);
    setUsers([]);
    setManualSendUserIds([]);
    selectableManualSendUserIdsRef.current = [];
    setCalendarEvents([]);
    setTodayCalendarEvents([]);
    setCommonSettings(null);
    setCommonSettingsChannelAccessToken("");
    setCommonSettingsChannelSecret("");
    setCronHistoryItems([]);
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

  function handleManualSendUserSelectionChange(userId: string, selected: boolean) {
    setManualSendUserIds((current) => {
      if (selected) {
        return current.includes(userId) ? current : [...current, userId];
      }

      return current.filter((currentUserId) => currentUserId !== userId);
    });
  }

  async function handleCreateCalendarEvent(input: CalendarEventDraft) {
    setError("");

    const result = await fetchJson<CalendarEventResponse>("/api/calendar-events", {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (result.error || !result.data?.event) {
      throw new Error(result.error?.message ?? "カレンダー情報を保存できません。");
    }

    applyCalendarEvents([result.data.event, ...calendarEvents]);
    setStatus("カレンダー情報を追加しました。");
  }

  async function handleUpdateCalendarEvent(eventId: string, input: CalendarEventDraft) {
    setError("");

    const result = await fetchJson<CalendarEventResponse>(`/api/calendar-events/${encodeURIComponent(eventId)}`, {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    if (result.error || !result.data?.event) {
      throw new Error(result.error?.message ?? "カレンダー情報を更新できません。");
    }

    applyCalendarEvents(
      calendarEvents.map((event) => (event.eventId === eventId ? result.data?.event ?? event : event)),
    );
    setStatus("カレンダー情報を更新しました。");
  }

  async function handleDeleteCalendarEvent(eventId: string) {
    setError("");

    const result = await fetchJson<{ deleted: boolean }>(`/api/calendar-events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    });

    if (result.error || !result.data?.deleted) {
      throw new Error(result.error?.message ?? "カレンダー情報を削除できません。");
    }

    applyCalendarEvents(calendarEvents.filter((event) => event.eventId !== eventId));
    setStatus("カレンダー情報を削除しました。");
  }

  function applyCalendarEvents(events: CalendarEventView[]) {
    const sortedEvents = sortCalendarEventsForDisplay(events);

    setCalendarEvents(sortedEvents);
    setTodayCalendarEvents(getTodayCalendarEventsForDisplay(sortedEvents));
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
          userIds: manualSendUserIds,
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

  function handleCommonSettingsChange<K extends keyof CommonSettingsView>(
    key: K,
    value: CommonSettingsView[K],
  ) {
    setCommonSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleCommonSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!commonSettings) {
      return;
    }

    setSavingCommonSettings(true);
    setError("");

    try {
      const result = await fetchJson<CommonSettingsResponse>("/api/admin/common-settings", {
        body: JSON.stringify({
          channelAccessToken: commonSettingsChannelAccessToken.trim() || undefined,
          channelId: commonSettings.channelId,
          channelSecret: commonSettingsChannelSecret.trim() || undefined,
          receivedRetentionDays: commonSettings.receivedRetentionDays,
          sentRetentionDays: commonSettings.sentRetentionDays,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (result.error || !result.data?.settings) {
        setError(result.error?.message ?? "共通設定を更新できません。");
        return;
      }

      setCommonSettings(result.data.settings);
      setCommonSettingsChannelAccessToken("");
      setCommonSettingsChannelSecret("");
      setAutomationSettings((current) =>
        current ? { ...current, historyRetentionDays: result.data?.settings.sentRetentionDays ?? current.historyRetentionDays } : current,
      );
      setStatus("共通設定を更新しました。");
    } finally {
      setSavingCommonSettings(false);
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

  async function handleSelectSendRun(run: SendRunView) {
    setError("");
    const result = await fetchJson<SentRunResponse>(`/api/sent-messages/${encodeURIComponent(run.runId)}`, {
      cache: "no-store",
    });

    if (result.error || !result.data?.run) {
      setError(result.error?.message ?? "送信履歴を取得できません。");
      return;
    }

    setSelectedSendRun(result.data.run);
  }

  function closeMessageModal() {
    setSelectedMessage(null);
  }

  async function handlePasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setSubmittingReset(true);

    try {
      await sendPasswordResetEmail(getClientAuth(), email.trim());
    } catch {
      // Do not reveal whether the email exists.
    } finally {
      setSubmittingReset(false);
      setStatus("登録済みのメールアドレスであれば、パスワード再設定メールを送信しました。");
    }
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
            <p>メールアドレスとパスワードでログインします。</p>
          </div>
          <form className="form-stack" onSubmit={resetMode ? handlePasswordReset : handleLogin}>
            <label>
              メールアドレス
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            {resetMode ? null : (
              <label>
                パスワード
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </label>
            )}
            {error ? <p className="error-text">{error}</p> : null}
            {status ? <p className="status-text">{status}</p> : null}
            <button disabled={resetMode ? submittingReset : submittingLogin} type="submit">
              {resetMode ? (submittingReset ? "送信中..." : "再設定メールを送信") : submittingLogin ? "ログイン中..." : "ログイン"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setError("");
                setStatus("");
                setResetMode((current) => !current);
              }}
              type="button"
            >
              {resetMode ? "ログインへ戻る" : "パスワードをお忘れですか？"}
            </button>
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
          <p>LINE公式アカウントのメッセージ履歴と配信管理</p>
        </div>
        <div className="admin-actions">
          {accountEmail ? <span className="account-email-label">{formatAccountEmailLocalPart(accountEmail)}</span> : null}
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
                  <span>メールアドレス</span>
                  <strong>{accountEmail}</strong>
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
                <NavMenuItems currentView={currentView} items={viewItems} onNavigate={navigateToView} />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <AppTabs currentView={currentView} items={viewItems} />

      {error ? (
        <section className="toolbar">
          <p className="error-text">{error}</p>
        </section>
      ) : null}

      {currentView === "messages" ? (
        <section className="message-layout">
          <MessageList
            filter={messageFilter}
            loading={loadingMessages}
            messages={filteredMessages}
            onFilterChange={handleFilterChange}
            onRefresh={() => void loadMessages()}
            onSelect={handleSelect}
            selectedId={selectedId}
            statusText={messageListStatus}
            totalCount={messages.length}
          />
        </section>
      ) : null}

      {currentView === "home" ? (
        <HomeScreen
          cronHistoryItems={cronHistoryItems}
          loading={loadingSentRuns || loadingUsers || loadingCalendarEvents || loadingCronHistory}
          onOpenCalendar={() => navigateToView("calendar")}
          onOpenCron={() => navigateToView("cron-runs")}
          onOpenGeneratedMessage={showGeneratedMessageView}
          onOpenMessages={() => navigateToView("messages")}
          onOpenSent={() => navigateToView("sent")}
          onOpenSettings={() => navigateToView("settings")}
          onOpenUsers={showUserInfoView}
          sentRuns={sentRuns}
          todayCalendarEvents={todayCalendarEvents}
          users={users}
        />
      ) : null}

      {currentView === "users" ? (
        <UserInfoScreen
          loading={loadingUsers}
          onRefresh={() => void loadUsers()}
          onSelectionChange={handleUserSelectionChange}
          selectedUserIds={selectedUserIds}
          statusText={status || "取得済みのユーザ情報を表示します。"}
          users={users}
        />
      ) : null}

      {currentView === "calendar" ? (
        <CalendarEventsScreen
          events={calendarEvents}
          loading={loadingCalendarEvents}
          onCreate={(input) => handleCreateCalendarEvent(input)}
          onDelete={(eventId) => handleDeleteCalendarEvent(eventId)}
          onRefresh={() => void loadCalendarEvents()}
          onUpdate={(eventId, input) => handleUpdateCalendarEvent(eventId, input)}
          statusText={status || "登録済みのカレンダー情報を表示します。"}
          todayEvents={todayCalendarEvents}
        />
      ) : null}

      {currentView === "sent" ? (
        <SentHistoryScreen
          filter={sendRunFilter}
          loading={loadingSentRuns}
          onFilterChange={setSendRunFilter}
          onRefresh={() => void loadSentRuns()}
          onSelect={(run) => void handleSelectSendRun(run)}
          runs={filteredSentRuns}
          statusText={status || "送信履歴を表示します。"}
          totalCount={sentRuns.length}
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
          onGenerate={() => void handleGenerateMessage()}
          onManualSendUserSelectionChange={handleManualSendUserSelectionChange}
          onMessageChange={setGeneratedMessage}
          onOpenUsers={showUserInfoView}
          onSend={() => void handleSendGeneratedMessage()}
          manualSendUserIds={manualSendUserIds}
          manualSendUsers={manualSendUsers}
          selectedUsers={selectedUsers}
          savingAutomationSettings={savingAutomationSettings}
          sending={sendingGeneratedMessage}
          statusText={generatedMessageStatus}
        />
      ) : null}
      {currentView === "settings" ? (
        <CommonSettingsScreen
          channelAccessToken={commonSettingsChannelAccessToken}
          channelSecret={commonSettingsChannelSecret}
          loading={loadingCommonSettings}
          onChange={handleCommonSettingsChange}
          onChannelAccessTokenChange={setCommonSettingsChannelAccessToken}
          onChannelSecretChange={setCommonSettingsChannelSecret}
          onSubmit={(event) => void handleCommonSettingsSubmit(event)}
          saving={savingCommonSettings}
          settings={commonSettings}
          statusText={status || "管理画面を表示します。"}
        />
      ) : null}
      {currentView === "cron-runs" ? (
        <CronHistoryScreen
          items={cronHistoryItems}
          loading={loadingCronHistory}
          onRefresh={() => void loadCronHistory()}
          statusText={status || "Cron履歴を表示します。"}
        />
      ) : null}
      <MessageDetailModal message={selectedMessage} onClose={closeMessageModal} />
      <SendRunDetailModal run={selectedSendRun} onClose={() => setSelectedSendRun(null)} />
    </main>
  );
}

const VIEW_ITEMS: Array<{ label: string; view: ViewerView }> = [
  { label: "ホーム", view: "home" },
  { label: "受信履歴", view: "messages" },
  { label: "送信履歴", view: "sent" },
  { label: "Cron履歴", view: "cron-runs" },
  { label: "ユーザ情報", view: "users" },
  { label: "メッセージ送信", view: "generated-message" },
  { label: "カレンダー情報", view: "calendar" },
  { label: "管理画面", view: "settings" },
];

function AppTabs({
  currentView,
  items,
}: {
  currentView: ViewerView;
  items: typeof VIEW_ITEMS;
}) {
  return (
    <nav aria-label="画面切り替え" className="app-tabs">
      {items.map((item) => (
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
  items,
  onNavigate,
}: {
  currentView: ViewerView;
  items: typeof VIEW_ITEMS;
  onNavigate: (view: ViewerView) => void;
}) {
  return (
    <>
      {items.map((item) => (
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
  if (view === "home") {
    return "/";
  }

  if (view === "settings") {
    return "/settings";
  }

  if (view === "cron-runs") {
    return "/cron-runs";
  }

  if (view === "sent") {
    return "/sent";
  }

  if (view === "users") {
    return "/users";
  }

  if (view === "generated-message") {
    return "/send";
  }

  if (view === "calendar") {
    return "/calendar";
  }

  return "/messages";
}

function HomeScreen({
  cronHistoryItems,
  loading,
  onOpenCalendar,
  onOpenCron,
  onOpenGeneratedMessage,
  onOpenMessages,
  onOpenSent,
  onOpenSettings,
  onOpenUsers,
  sentRuns,
  todayCalendarEvents,
  users,
}: {
  cronHistoryItems: CronHistoryItemView[];
  loading: boolean;
  onOpenCalendar: () => void;
  onOpenCron: () => void;
  onOpenGeneratedMessage: () => void;
  onOpenMessages: () => void;
  onOpenSent: () => void;
  onOpenSettings: () => void;
  onOpenUsers: () => void;
  sentRuns: SendRunView[];
  todayCalendarEvents: CalendarEventView[];
  users: UserInfoView[];
}) {
  const latestConfirmationTargets = buildLatestHomeConfirmationTargets(sentRuns);
  const unconfirmedTargets = latestConfirmationTargets.filter(isHomeUnconfirmedTarget);
  const latestConfirmationCheck = cronHistoryItems.find((item) => item.kind === "check_unconfirmed_messages");
  const latestCronIssue = cronHistoryItems.find((item) => item.status === "failed" || item.status === "partial_failed");
  const todayAutoRun = sentRuns.find((run) => run.mode === "auto" && isSameDateInJapan(run.sentAt, new Date()));
  const recentSendRuns = sentRuns.slice(0, 2);
  const selectedUserCount = users.filter((user) => user.broadcastSelected).length;
  const notifiedUnconfirmedCount = unconfirmedTargets.filter(
    (target) => target.confirmationStatus === "reminded" || Boolean(target.reminderSentAt),
  ).length;
  const todayEventsText = formatCalendarEventsText(todayCalendarEvents);
  const hasUnconfirmed = unconfirmedTargets.length > 0;
  const homeHeroClassName = `home-hero ${hasUnconfirmed ? "has-unconfirmed" : ""}`;

  return (
    <section className="home-screen">
      <div className={homeHeroClassName}>
        <div className="home-title">
          <h2>ホーム</h2>
          <p className="status-text">
            未確認メッセージを最優先でフォローし、今日の運用状況を確認します。
          </p>
          {loading ? <p className="status-text">ホームを更新中です。</p> : null}
        </div>

        {hasUnconfirmed ? (
          <section className="home-unconfirmed-card" aria-label="未確認メッセージ">
            <div className="home-unconfirmed-heading">
              <span aria-hidden="true" className="home-warning-mark">!</span>
              <div>
                <h3>未確認メッセージがあります</h3>
                <div className="home-unconfirmed-count">
                  <strong>{unconfirmedTargets.length}名</strong>
                  <span>確認ボタンが押されていない送信先</span>
                </div>
              </div>
            </div>
            <dl className="home-unconfirmed-details">
              <div>
                <dt>対象</dt>
                <dd>{formatHomeTargetNames(unconfirmedTargets)}</dd>
              </div>
              <div>
                <dt>最終確認チェック</dt>
                <dd>
                  {latestConfirmationCheck
                    ? `${formatTime(latestConfirmationCheck.startedAt)} / 通知済み ${notifiedUnconfirmedCount}名`
                    : `未実行 / 通知済み ${notifiedUnconfirmedCount}名`}
                </dd>
              </div>
            </dl>
            <div className="home-unconfirmed-actions">
              <button onClick={onOpenSent} type="button">
                送信履歴で確認
              </button>
              <button className="secondary" onClick={onOpenCron} type="button">
                Cron履歴
              </button>
            </div>
          </section>
        ) : null}

        <div className="home-shortcut-actions">
          <button onClick={onOpenGeneratedMessage} type="button">
            メッセージ作成
          </button>
          <button className="secondary" onClick={onOpenMessages} type="button">
            受信履歴を確認
          </button>
        </div>
      </div>

      <section className="home-status-grid" aria-label="今日の状況">
        <HomeStatusCard
          badge={todayAutoRun ? formatTimeOnly(todayAutoRun.sentAt) : "未実行"}
          description={
            todayAutoRun
              ? `対象 ${todayAutoRun.targetCount} / 成功 ${todayAutoRun.successCount} / 失敗 ${todayAutoRun.failedCount}`
              : "今日の自動送信履歴はまだありません。"
          }
          label="今日の自動送信"
          tone={todayAutoRun?.status === "failed" || todayAutoRun?.status === "partial_failed" ? "warning" : "normal"}
          value={todayAutoRun ? formatSendRunStatus(todayAutoRun.status) : "未実行"}
        />
        <HomeStatusCard
          badge={hasUnconfirmed ? `${notifiedUnconfirmedCount}名通知済み` : "0件"}
          description={hasUnconfirmed ? "未確認者のフォロー状況を確認してください。" : "確認待ちはありません。"}
          label="未確認フォロー"
          tone={hasUnconfirmed ? "warning" : "normal"}
          value={hasUnconfirmed ? `${unconfirmedTargets.length}名` : "なし"}
        />
        <HomeStatusCard
          badge={todayEventsText ? "予定あり" : "通常運用"}
          description={todayEventsText || "登録がある日は挨拶文の最優先ネタです。"}
          label="今日のカレンダー情報"
          tone="normal"
          value={todayEventsText ? "あり" : "なし"}
        />
        <HomeStatusCard
          badge={latestCronIssue ? formatCronHistoryKind(latestCronIssue.kind) : hasUnconfirmed ? `未確認 ${unconfirmedTargets.length}名` : "失敗なし"}
          description={latestCronIssue ? "直近のCron履歴を確認してください。" : "送信失敗はありません。"}
          label="Cron履歴"
          tone={latestCronIssue || hasUnconfirmed ? "warning" : "normal"}
          value={latestCronIssue || hasUnconfirmed ? "注意あり" : "正常"}
        />
      </section>

      <section className={`home-content-grid ${hasUnconfirmed ? "" : "without-unconfirmed"}`}>
        {hasUnconfirmed ? (
          <section className="panel home-target-panel">
            <div className="home-panel-header">
              <h3>未確認の対象</h3>
              <button className="secondary" onClick={onOpenSent} type="button">
                送信履歴
              </button>
            </div>
            <div className="home-target-list">
              {unconfirmedTargets.map((target) => (
                <div className="home-target-row" key={target.userId}>
                  <strong>{target.userName}</strong>
                  <span>{formatTime(target.sentAt)} 送信分 / {formatConfirmationStatus(target.confirmationStatus)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel home-recent-send-panel">
          <div className="home-panel-header">
            <h3>直近の送信</h3>
            <button className="secondary" onClick={onOpenSent} type="button">
              送信履歴
            </button>
          </div>
          {recentSendRuns.length ? (
            <div className="home-recent-send-list">
              {recentSendRuns.map((run) => (
                <div className="home-recent-send-row" key={run.runId}>
                  <span className="message-meta">
                    <strong>{formatSendRunMode(run.mode)}</strong>
                    <span>{formatTime(run.sentAt)}</span>
                    <span>{formatSendRunStatus(run.status)}</span>
                  </span>
                  <p>{run.messageText || "本文は保存されていません。"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="status-text">送信履歴はありません。</p>
          )}
        </section>

        <section className="panel home-shortcut-panel">
          <div className="home-panel-header">
            <h3>よく使う画面</h3>
          </div>
          <div className="home-secondary-actions">
            <button className="secondary" onClick={onOpenUsers} type="button">
              ユーザ情報
            </button>
            <button className="secondary" onClick={onOpenCalendar} type="button">
              カレンダー情報
            </button>
            <button className="secondary" onClick={onOpenSettings} type="button">
              管理画面
            </button>
          </div>
          <p className="status-text">現在の送信対象ユーザは{selectedUserCount}名です。</p>
        </section>
      </section>
    </section>
  );
}

function HomeStatusCard({
  badge,
  description,
  label,
  tone,
  value,
}: {
  badge: string;
  description: string;
  label: string;
  tone: "normal" | "warning";
  value: string;
}) {
  return (
    <article className={`home-status-card ${tone === "warning" ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{badge}</em>
      <p>{description}</p>
    </article>
  );
}

function CommonSettingsScreen({
  channelAccessToken,
  channelSecret,
  loading,
  onChange,
  onChannelAccessTokenChange,
  onChannelSecretChange,
  onSubmit,
  saving,
  settings,
  statusText,
}: {
  channelAccessToken: string;
  channelSecret: string;
  loading: boolean;
  onChange: <K extends keyof CommonSettingsView>(key: K, value: CommonSettingsView[K]) => void;
  onChannelAccessTokenChange: (value: string) => void;
  onChannelSecretChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  settings: CommonSettingsView | null;
  statusText: string;
}) {
  const channelSecretPlaceholder = settings?.channelSecretConfigured ? "****" : "未設定";
  const channelAccessTokenPlaceholder = settings?.channelAccessTokenConfigured ? "****" : "未設定";

  return (
    <section className="settings-screen">
      <div className="settings-header">
        <div>
          <h2>管理画面</h2>
          <p className="status-text">LINE連携情報と履歴保存期間を管理します。</p>
        </div>
        {settings ? (
          <div className="settings-actions">
            <p className="status-text">{loading ? "管理画面を更新中です。" : statusText}</p>
            <button aria-busy={saving} disabled={saving} form="common-settings-form" type="submit">
              保存
            </button>
          </div>
        ) : null}
      </div>

      {settings ? (
        <section className="panel">
          <form className="settings-grid" id="common-settings-form" onSubmit={onSubmit}>
            <label>
              保存期間（受信）
              <input
                min={1}
                onChange={(event) => onChange("receivedRetentionDays", Number(event.target.value))}
                type="number"
                value={settings.receivedRetentionDays}
              />
            </label>
            <label>
              保存期間（送信）
              <input
                min={1}
                onChange={(event) => onChange("sentRetentionDays", Number(event.target.value))}
                type="number"
                value={settings.sentRetentionDays}
              />
            </label>
            <details className="full settings-disclosure">
              <summary>LINE連携情報</summary>
              <div className="line-settings-grid">
                <label>
                  チャンネルID
                  <input
                    onChange={(event) => onChange("channelId", event.target.value)}
                    placeholder="LINE DevelopersのチャンネルID"
                    value={settings.channelId}
                  />
                </label>
                <label>
                  チャンネル名
                  <span className="readonly-value">{settings.displayName || "未取得"}</span>
                </label>
                <label>
                  Webhook URL
                  <span className="readonly-value">{settings.webhookUrlPath}</span>
                </label>
                <label>
                  Channel Secret（変更する場合のみ入力）
                  <input
                    autoComplete="off"
                    onChange={(event) => onChannelSecretChange(event.target.value)}
                    placeholder={channelSecretPlaceholder}
                    type="password"
                    value={channelSecret}
                  />
                </label>
                <label>
                  Channel Access Token（変更する場合のみ入力）
                  <input
                    autoComplete="off"
                    onChange={(event) => onChannelAccessTokenChange(event.target.value)}
                    placeholder={channelAccessTokenPlaceholder}
                    type="password"
                    value={channelAccessToken}
                  />
                </label>
              </div>
            </details>
          </form>
        </section>
      ) : (
        <div className="panel empty-message-panel">
          {loading ? "管理画面を読み込んでいます。" : "管理画面を表示できません。"}
        </div>
      )}
    </section>
  );
}

function CronHistoryScreen({
  items,
  loading,
  onRefresh,
  statusText,
}: {
  items: CronHistoryItemView[];
  loading: boolean;
  onRefresh: () => void;
  statusText: string;
}) {
  return (
    <section className="cron-history-screen">
      <div className="cron-history-header">
        <div>
          <h2>Cron履歴</h2>
        </div>
        <div className="cron-history-actions">
          <p className="status-text">{loading ? "Cron履歴を更新中です。" : statusText}</p>
          <button onClick={onRefresh} type="button" disabled={loading}>
            更新
          </button>
        </div>
      </div>

      {items.length ? (
        <div className="sent-run-list">
          {items.map((item) => (
            <div className="sent-run-row" key={`${item.kind}:${item.id}`}>
              <span className="message-meta">
                <strong>{formatCronHistoryKind(item.kind)}</strong>
                <span>{formatTime(item.startedAt)}</span>
                <span>{formatCronHistoryStatus(item.status)}</span>
              </span>
              <span className="message-text">{item.summary}</span>
              {item.kind === "check_unconfirmed_messages" ? (
                <div className="cron-confirmation-details">
                  <div>
                    <span>確認済み</span>
                    <strong>{formatCronConfirmationTargets(item.confirmedTargets)}</strong>
                  </div>
                  <div>
                    <span>未確認</span>
                    <strong>{formatCronConfirmationTargets(item.unconfirmedTargets)}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="panel empty-message-panel">Cron履歴はありません。</div>
      )}
    </section>
  );
}

function UserInfoScreen({
  loading,
  onRefresh,
  onSelectionChange,
  selectedUserIds,
  statusText,
  users,
}: {
  loading: boolean;
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
          <p className="status-text">自動送信と手動送信の送信対象を管理します。</p>
        </div>
        <div className="user-info-actions">
          <p className="status-text">{loading ? "ユーザ情報を更新中です。" : statusText}</p>
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

function CalendarEventsScreen({
  events,
  loading,
  onCreate,
  onDelete,
  onRefresh,
  onUpdate,
  statusText,
  todayEvents,
}: {
  events: CalendarEventView[];
  loading: boolean;
  onCreate: (input: CalendarEventDraft) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  onRefresh: () => void;
  onUpdate: (eventId: string, input: CalendarEventDraft) => Promise<void>;
  statusText: string;
  todayEvents: CalendarEventView[];
}) {
  const [draft, setDraft] = useState<CalendarEventDraft | null>(null);
  const [editingId, setEditingId] = useState<null | string>(null);
  const [editDraft, setEditDraft] = useState<CalendarEventDraft | null>(null);
  const [rowError, setRowError] = useState("");
  const [savingId, setSavingId] = useState<null | string>(null);
  const todayText = formatCalendarEventsText(todayEvents);

  function startEdit(event: CalendarEventView) {
    setDraft(null);
    setRowError("");
    setEditingId(event.eventId);
    setEditDraft(toCalendarEventDraft(event));
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft) {
      return;
    }

    setSavingId("new");
    setRowError("");

    try {
      await onCreate(draft);
      setDraft(null);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "カレンダー情報を保存できません。");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdateSubmit(event: React.FormEvent<HTMLFormElement>, eventId: string) {
    event.preventDefault();

    if (!editDraft) {
      return;
    }

    setSavingId(eventId);
    setRowError("");

    try {
      await onUpdate(eventId, editDraft);
      setEditingId(null);
      setEditDraft(null);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "カレンダー情報を更新できません。");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(eventId: string) {
    if (!window.confirm("このカレンダー情報を削除しますか？")) {
      return;
    }

    setSavingId(eventId);
    setRowError("");

    try {
      await onDelete(eventId);
      if (editingId === eventId) {
        setEditingId(null);
        setEditDraft(null);
      }
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "カレンダー情報を削除できません。");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="calendar-events-screen">
      <div className="calendar-events-header">
        <div>
          <h2>カレンダー情報</h2>
          <p className="status-text">挨拶文に使う誕生日や記念日を、月日ごとに登録します。</p>
        </div>
        <div className="calendar-events-actions">
          <p className="status-text">{loading ? "カレンダー情報を更新中です。" : statusText}</p>
          <button onClick={onRefresh} type="button" disabled={loading}>
            更新
          </button>
        </div>
      </div>

      <section className="calendar-today-panel">
        <span>今日の予定</span>
        <strong>{todayText || "ありません"}</strong>
      </section>

      {rowError ? <p className="error-text">{rowError}</p> : null}

      {events.length || draft ? (
        <div className="calendar-event-list" role="list">
          <div aria-hidden="true" className="calendar-event-row calendar-event-list-header">
            <span>月日</span>
            <span>イベント</span>
            <span>状態</span>
            <span>操作</span>
          </div>

          {events.map((event) =>
            editingId === event.eventId && editDraft ? (
              <form
                className="calendar-event-row calendar-event-edit-row"
                key={event.eventId}
                onSubmit={(submitEvent) => void handleUpdateSubmit(submitEvent, event.eventId)}
                role="listitem"
              >
                <CalendarEventDraftFields
                  draft={editDraft}
                  disabled={Boolean(savingId)}
                  inputIdPrefix={`calendar-event-${event.eventId}`}
                  onChange={setEditDraft}
                />
                <div className="calendar-event-actions">
                  <button disabled={Boolean(savingId)} type="submit">
                    保存
                  </button>
                  <button
                    className="secondary"
                    disabled={Boolean(savingId)}
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft(null);
                      setRowError("");
                    }}
                    type="button"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            ) : (
              <article className="calendar-event-row" key={event.eventId} role="listitem">
                <span className="calendar-event-date">{formatCalendarMonthDayForDisplay(event.monthDay)}</span>
                <span className="calendar-event-text">{event.eventText}</span>
                <span className="calendar-event-state">{event.enabled ? "有効" : "無効"}</span>
                <div className="calendar-event-actions">
                  <button
                    className="secondary"
                    disabled={Boolean(savingId)}
                    onClick={() => startEdit(event)}
                    type="button"
                  >
                    編集
                  </button>
                  <button
                    className="danger"
                    disabled={Boolean(savingId)}
                    onClick={() => void handleDelete(event.eventId)}
                    type="button"
                  >
                    削除
                  </button>
                </div>
              </article>
            ),
          )}

          {draft ? (
            <form
              className="calendar-event-row calendar-event-edit-row"
              onSubmit={(event) => void handleCreateSubmit(event)}
              role="listitem"
            >
              <CalendarEventDraftFields
                draft={draft}
                disabled={Boolean(savingId)}
                inputIdPrefix="calendar-event-new"
                onChange={setDraft}
              />
              <div className="calendar-event-actions">
                <button disabled={Boolean(savingId)} type="submit">
                  保存
                </button>
                <button
                  className="secondary"
                  disabled={Boolean(savingId)}
                  onClick={() => {
                    setDraft(null);
                    setRowError("");
                  }}
                  type="button"
                >
                  キャンセル
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="panel empty-message-panel">
          {loading ? "カレンダー情報を読み込んでいます。" : "登録済みのカレンダー情報はありません。"}
        </div>
      )}

      <button
        aria-label="カレンダー情報を追加"
        className="secondary calendar-add-button"
        disabled={Boolean(draft) || Boolean(savingId)}
        onClick={() => {
          setEditingId(null);
          setEditDraft(null);
          setRowError("");
          setDraft({ enabled: true, eventText: "", monthDay: "" });
        }}
        title="カレンダー情報を追加"
        type="button"
      >
        ＋
      </button>
    </section>
  );
}

function CalendarEventDraftFields({
  disabled,
  draft,
  inputIdPrefix,
  onChange,
}: {
  disabled: boolean;
  draft: CalendarEventDraft;
  inputIdPrefix: string;
  onChange: (draft: CalendarEventDraft) => void;
}) {
  return (
    <>
      <label className="calendar-event-field calendar-event-month-day-field" htmlFor={`${inputIdPrefix}-month-day`}>
        <span>月日</span>
        <input
          autoComplete="off"
          disabled={disabled}
          id={`${inputIdPrefix}-month-day`}
          inputMode="numeric"
          onChange={(event) => onChange({ ...draft, monthDay: event.target.value })}
          placeholder="07/29"
          value={draft.monthDay}
        />
      </label>
      <label className="calendar-event-field" htmlFor={`${inputIdPrefix}-text`}>
        <span>イベント</span>
        <input
          autoComplete="off"
          disabled={disabled}
          id={`${inputIdPrefix}-text`}
          maxLength={40}
          onChange={(event) => onChange({ ...draft, eventText: event.target.value })}
          placeholder="○○○の誕生日"
          value={draft.eventText}
        />
      </label>
      <label className="calendar-event-enabled-field">
        <input
          checked={draft.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          type="checkbox"
        />
        <span>有効</span>
      </label>
    </>
  );
}

function SentHistoryScreen({
  filter,
  loading,
  onFilterChange,
  onRefresh,
  onSelect,
  runs,
  statusText,
  totalCount,
}: {
  filter: SendRunFilter;
  loading: boolean;
  onFilterChange: (filter: SendRunFilter) => void;
  onRefresh: () => void;
  onSelect: (run: SendRunView) => void;
  runs: SendRunView[];
  statusText: string;
  totalCount: number;
}) {
  return (
    <section aria-label="送信履歴" className="sent-history-screen">
      <div className="message-list-toolbar">
        <div aria-label="送信種別フィルター" className="message-filter" role="group">
          {SEND_RUN_FILTER_OPTIONS.map((option) => (
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
        <div className="sent-history-actions">
          <p className="status-text">{loading ? "送信履歴を更新中です。" : statusText}</p>
          <button onClick={onRefresh} type="button" disabled={loading}>
            更新
          </button>
        </div>
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
        <div className="panel empty-message-panel">
          {totalCount ? "このフィルターに該当する送信履歴はありません。" : "送信履歴はありません。"}
        </div>
      )}
    </section>
  );
}


function GeneratedMessageScreen({
  automationSettings,
  generating,
  loadingUsers,
  location,
  manualSendUserIds,
  manualSendUsers,
  message,
  onAutomationEnabledChange,
  onGenerate,
  onManualSendUserSelectionChange,
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
  manualSendUserIds: string[];
  manualSendUsers: UserInfoView[];
  message: string;
  onAutomationEnabledChange: (enabled: boolean) => void;
  onGenerate: () => void;
  onManualSendUserSelectionChange: (userId: string, selected: boolean) => void;
  onMessageChange: (message: string) => void;
  onOpenUsers: () => void;
  onSend: () => void;
  selectedUsers: UserInfoView[];
  savingAutomationSettings: boolean;
  sending: boolean;
  statusText: string;
}) {
  const manualSendUserIdSet = new Set(manualSendUserIds);

  return (
    <section className="generated-message-screen">
      <div className="generated-message-header">
        <div>
          <h2>メッセージ送信</h2>
          <p className="status-text">
            作成ボタンで今日の一言メッセージを自動生成し、選択中のユーザへ送信します。
          </p>
        </div>
        <div className="generated-message-toolbar">
          <button disabled={generating || sending} onClick={onGenerate} type="button">
            {generating ? "作成中..." : "作成"}
          </button>
          <button
            disabled={!message.trim() || manualSendUsers.length === 0 || generating || sending}
            onClick={onSend}
            type="button"
          >
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      </div>

      <div className="panel generated-message-panel">
        <div className="generated-message-targets">
          <div className="generated-message-target-copy">
            <span>送信先</span>
            {selectedUsers.length ? (
              <div className="manual-send-targets">
                <strong className="manual-send-target-count">{manualSendUsers.length}名：</strong>
                {selectedUsers.map((user) => (
                  <label className="manual-send-target" key={user.userId}>
                    <input
                      checked={manualSendUserIdSet.has(user.userId)}
                      onChange={(event) => onManualSendUserSelectionChange(user.userId, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{user.userName}</span>
                  </label>
                ))}
              </div>
            ) : (
              <strong>未選択</strong>
            )}
          </div>
          <button className="secondary" disabled={loadingUsers} onClick={onOpenUsers} type="button">
            {loadingUsers ? "ユーザ情報を読込中..." : "ユーザ情報を選択"}
          </button>
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
            <p className="status-text">自動送信はユーザ情報で選択中の全ユーザに送信されます。</p>
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
  loading,
  messages,
  onFilterChange,
  onRefresh,
  onSelect,
  selectedId,
  statusText,
  totalCount,
}: {
  filter: MessageFilter;
  loading: boolean;
  messages: MessageView[];
  onFilterChange: (filter: MessageFilter) => void;
  onRefresh: () => void;
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
        <div className="message-list-actions">
          <p className="message-list-status status-text">{statusText}</p>
          <button disabled={loading} onClick={onRefresh} type="button">
            更新
          </button>
        </div>
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
  const confirmationTargets = run.targets.filter((target) => target.status === "success");

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
          <p className="message-modal-text send-run-message-card">{run.messageText || "本文は保存されていません。"}</p>
        </div>
        <div className="send-run-detail-section">
          <h3>送信成功ユーザ（確認状況）</h3>
          {confirmationTargets.length ? (
            <div className="target-status-list">
              {confirmationTargets.map((target) => (
                <div className="target-status-row" key={target.userId}>
                  <strong>{target.userName}</strong>
                  <span>確認状況 {formatConfirmationStatus(target.confirmationStatus)}</span>
                  {target.confirmedAt ? <span>確認日時 {formatTime(target.confirmedAt)}</span> : null}
                  {target.reminderSentAt ? <span>通知日時 {formatTime(target.reminderSentAt)}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="status-text">送信成功ユーザはありません。</p>
          )}
        </div>
        <div className="send-run-detail-section">
          <h3>送信失敗ユーザ</h3>
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
            <p className="status-text">送信失敗ユーザはありません。</p>
          )}
        </div>
      </div>
    </div>
  );
}

function buildLatestHomeConfirmationTargets(runs: SendRunView[]): HomeConfirmationTarget[] {
  const targetsByUserId = new Map<string, HomeConfirmationTarget>();

  for (const run of runs) {
    for (const target of run.targets) {
      if (target.status !== "success" || !target.userId || targetsByUserId.has(target.userId)) {
        continue;
      }

      const confirmationStatus = target.confirmationStatus ?? "not_required";

      if (confirmationStatus === "not_required") {
        continue;
      }

      targetsByUserId.set(target.userId, {
        confirmationStatus,
        reminderSentAt: target.reminderSentAt ?? null,
        runId: run.runId,
        sentAt: run.sentAt,
        userId: target.userId,
        userName: target.userName,
      });
    }
  }

  return Array.from(targetsByUserId.values()).sort(
    (left, right) =>
      right.sentAt.localeCompare(left.sentAt) ||
      left.userName.localeCompare(right.userName, "ja") ||
      left.userId.localeCompare(right.userId),
  );
}

function isHomeUnconfirmedTarget(target: HomeConfirmationTarget) {
  return target.confirmationStatus === "pending" || target.confirmationStatus === "reminded";
}

function formatHomeTargetNames(targets: HomeConfirmationTarget[]) {
  if (!targets.length) {
    return "なし";
  }

  if (targets.length <= 3) {
    return targets.map((target) => target.userName).join("、");
  }

  const [first, ...rest] = targets;

  return `${first.userName}さんほか${rest.length}名`;
}

function isSameDateInJapan(value: string, date: Date) {
  return formatDateKeyInJapan(new Date(value)) === formatDateKeyInJapan(date);
}

function formatDateKeyInJapan(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function formatConfirmationStatus(status: SendRunView["targets"][number]["confirmationStatus"]) {
  if (status === "confirmed") {
    return "確認済み";
  }

  if (status === "reminded") {
    return "未確認（通知済み）";
  }

  if (status === "pending") {
    return "未確認";
  }

  return "対象外";
}

function formatCronHistoryKind(kind: CronHistoryItemView["kind"]) {
  if (kind === "check_unconfirmed_messages") {
    return "確認チェック";
  }

  if (kind === "delete_expired_messages") {
    return "自動削除";
  }

  return "自動送信";
}

function formatCronConfirmationTargets(targets: CronHistoryItemView["confirmedTargets"]) {
  if (!targets?.length) {
    return "なし";
  }

  return targets.map((target) => target.userName).join("、");
}

function formatCronHistoryStatus(status: string) {
  if (status === "success") {
    return "成功";
  }

  if (status === "partial_failed") {
    return "一部失敗";
  }

  if (status === "skipped") {
    return "スキップ";
  }

  return "失敗";
}

function toCalendarEventDraft(event: CalendarEventView): CalendarEventDraft {
  return {
    enabled: event.enabled,
    eventText: event.eventText,
    monthDay: formatCalendarMonthDayForDisplay(event.monthDay),
  };
}

function sortCalendarEventsForDisplay(events: CalendarEventView[]) {
  return [...events].sort(
    (left, right) =>
      left.monthDay.localeCompare(right.monthDay) ||
      left.sortOrder - right.sortOrder ||
      (left.createdAt ?? "").localeCompare(right.createdAt ?? "") ||
      left.eventId.localeCompare(right.eventId),
  );
}

function getTodayCalendarEventsForDisplay(events: CalendarEventView[]) {
  const monthDay = getCalendarMonthDayInJapan(new Date());

  return sortCalendarEventsForDisplay(events.filter((event) => event.enabled && event.monthDay === monthDay));
}

function getCalendarMonthDayInJapan(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatCalendarMonthDayForDisplay(monthDay: string) {
  return monthDay.replace("-", "/");
}

function formatCalendarEventsText(events: CalendarEventView[]) {
  return events.map((event) => event.eventText).filter(Boolean).join("、");
}

function formatAccountEmailLocalPart(email: string) {
  return email.split("@")[0]?.trim() || email;
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
