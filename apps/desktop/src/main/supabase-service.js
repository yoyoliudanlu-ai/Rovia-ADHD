const { createClient } = require("@supabase/supabase-js");

const {
  AUTH_MODES,
  TABLES,
  buildFocusSessionRow,
  buildTelemetryRow,
  buildTodoRow,
  mapFocusSessionRow,
  mapTelemetryRow,
  mapTodoRow
} = require("../shared/rovia-schema");

class SupabaseService {
  constructor({ url, anonKey, defaultUserId, authStorage }) {
    this.defaultUserId = defaultUserId || null;
    this.authStorage = authStorage || null;
    this.currentSession = null;
    this.currentUser = null;
    this.compatibility = {
      todosVariant: 0,
      focusVariant: 0,
      appEventsDisabled: false
    };
    this.client =
      url && anonKey
        ? createClient(url, anonKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false
            }
          })
        : null;
  }

  async init() {
    if (!this.client) {
      return;
    }

    await this.restoreSession();
  }

  isConfigured() {
    return Boolean(this.client);
  }

  getUserId() {
    return this.currentUser?.id || this.defaultUserId || null;
  }

  canSync() {
    return Boolean(this.client && this.getUserId());
  }

  getAuthState() {
    const effectiveUserId = this.getUserId();
    const isLoggedIn = Boolean(this.currentUser);

    let mode = AUTH_MODES.local;
    if (this.client) {
      if (isLoggedIn) {
        mode = AUTH_MODES.session;
      } else if (this.defaultUserId) {
        mode = AUTH_MODES.staticUser;
      } else {
        mode = AUTH_MODES.anonymous;
      }
    }

    return {
      configured: Boolean(this.client),
      mode,
      isLoggedIn,
      hasIdentity: Boolean(effectiveUserId),
      needsLogin: Boolean(this.client && !isLoggedIn && !this.defaultUserId),
      email: this.currentUser?.email || null,
      userId: effectiveUserId
    };
  }

  async restoreSession() {
    if (!this.client || !this.authStorage) {
      return;
    }

    const saved = await this.authStorage.load();
    const storedSession = saved?.session;

    if (!storedSession?.access_token || !storedSession?.refresh_token) {
      return;
    }

    const { data, error } = await this.client.auth.setSession({
      access_token: storedSession.access_token,
      refresh_token: storedSession.refresh_token
    });

    if (error || !data.session) {
      await this.persistSession(null);
      return;
    }

    await this.persistSession(data.session);
  }

  async persistSession(session) {
    this.currentSession = session || null;
    this.currentUser = session?.user || null;

    if (!this.authStorage) {
      return;
    }

    await this.authStorage.save(
      session
        ? {
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token
            }
          }
        : {
            session: null
          }
    );
  }

  async signInWithPassword({ email, password }) {
    if (!this.client) {
      throw new Error("Supabase 还没有配置。");
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    await this.persistSession(data.session);
    return this.getAuthState();
  }

  async signUpWithPassword({ email, password }) {
    if (!this.client) {
      throw new Error("Supabase 还没有配置。");
    }

    const { data, error } = await this.client.auth.signUp({
      email,
      password
    });

    if (error) {
      throw error;
    }

    const identities = Array.isArray(data.user?.identities)
      ? data.user.identities
      : [];
    const alreadyRegistered = Boolean(data.user && identities.length === 0);
    const needsEmailConfirmation = Boolean(
      data.user && !alreadyRegistered && !data.session
    );

    if (data.session) {
      await this.persistSession(data.session);
    } else {
      await this.persistSession(null);
    }

    return {
      ...this.getAuthState(),
      alreadyRegistered,
      needsEmailConfirmation,
      registeredUserId: data.user?.id || null
    };
  }

  async signOut() {
    if (!this.client) {
      return this.getAuthState();
    }

    if (this.currentSession) {
      const { error } = await this.client.auth.signOut();
      if (error) {
        throw error;
      }
    }

    await this.persistSession(null);
    return this.getAuthState();
  }

  requireUserId() {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error("Supabase 当前没有可用的用户身份。");
    }
    return userId;
  }

  async selectRowsWithFallbackOrder(table, userId, orderColumns, limit = null) {
    let lastError = null;

    for (const column of orderColumns) {
      let query = this.client
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .order(column, { ascending: false });

      if (typeof limit === "number") {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (!error) {
        return data || [];
      }

      lastError = error;
      if (error.code !== "42703") {
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return [];
  }

  async fetchTodos() {
    if (!this.canSync()) {
      return [];
    }

    const userId = this.requireUserId();
    const data = await this.selectRowsWithFallbackOrder(
      TABLES.todos,
      userId,
      ["updated_at", "created_at"]
    );
    return data.map(mapTodoRow);
  }

  async fetchFocusSessions({ limit = 24 } = {}) {
    if (!this.canSync()) {
      return [];
    }

    const userId = this.requireUserId();
    const data = await this.selectRowsWithFallbackOrder(
      TABLES.focusSessions,
      userId,
      ["updated_at", "created_at", "start_time"],
      limit
    );
    return data.map(mapFocusSessionRow);
  }

  async fetchLatestTelemetry() {
    if (!this.canSync()) {
      return null;
    }

    const userId = this.requireUserId();
    const data = await this.selectRowsWithFallbackOrder(
      TABLES.telemetry,
      userId,
      ["recorded_at", "created_at"],
      1
    );
    return mapTelemetryRow(data?.[0] || null);
  }

  async fetchDashboardSnapshot() {
    const [todos, focusSessions, latestTelemetry] = await Promise.all([
      this.fetchTodos(),
      this.fetchFocusSessions(),
      this.fetchLatestTelemetry()
    ]);

    return {
      todos,
      focusSessions,
      latestTelemetry
    };
  }

  subscribeTodos(onChange) {
    if (!this.canSync()) {
      return async () => {};
    }

    const userId = this.requireUserId();

    const channel = this.client
      .channel(`rovia-todos-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLES.todos,
          filter: `user_id=eq.${userId}`
        },
        async () => {
          try {
            const todos = await this.fetchTodos();
            onChange(todos);
          } catch (error) {
            console.warn("[supabase] todo subscription refresh failed", error);
          }
        }
      )
      .subscribe();

    return async () => {
      await this.client.removeChannel(channel);
    };
  }

  subscribeFocusSessions(onChange) {
    if (!this.canSync()) {
      return async () => {};
    }

    const userId = this.requireUserId();

    const channel = this.client
      .channel(`rovia-focus-sessions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLES.focusSessions,
          filter: `user_id=eq.${userId}`
        },
        async () => {
          try {
            const focusSessions = await this.fetchFocusSessions();
            onChange(focusSessions);
          } catch (error) {
            console.warn(
              "[supabase] focus session subscription refresh failed",
              error
            );
          }
        }
      )
      .subscribe();

    return async () => {
      await this.client.removeChannel(channel);
    };
  }

  async upsertTodo(todo) {
    if (!this.canSync()) {
      return;
    }

    const payload = buildTodoRow(todo, this.requireUserId());
    const variants = [
      payload,
      this.omitKeys(payload, ["is_active"]),
      this.pickKeys(payload, [
        "id",
        "user_id",
        "task_text",
        "status",
        "is_completed",
        "priority",
        "updated_at"
      ]),
      this.pickKeys(payload, ["id", "user_id", "title", "status", "priority", "updated_at"])
    ];

    await this.upsertWithVariants(TABLES.todos, variants, "todosVariant");
  }

  async upsertFocusSession(session) {
    if (!this.canSync()) {
      return;
    }

    const payload = buildFocusSessionRow(session, this.requireUserId());
    const variants = [
      payload,
      this.omitKeys(payload, ["away_count"]),
      this.pickKeys(payload, [
        "id",
        "user_id",
        "todo_id",
        "task_title",
        "start_time",
        "end_time",
        "duration",
        "status",
        "trigger_source",
        "updated_at"
      ])
    ];

    await this.upsertWithVariants(TABLES.focusSessions, variants, "focusVariant");
  }

  omitKeys(payload, keys) {
    return Object.fromEntries(
      Object.entries(payload).filter(([key]) => !keys.includes(key))
    );
  }

  pickKeys(payload, keys) {
    return Object.fromEntries(
      Object.entries(payload).filter(([key]) => keys.includes(key))
    );
  }

  isSchemaMismatch(error) {
    return error?.code === "PGRST204";
  }

  isMissingRelation(error) {
    return error?.code === "PGRST205";
  }

  async upsertWithVariants(table, variants, compatibilityKey) {
    let startIndex = this.compatibility[compatibilityKey] || 0;
    let lastError = null;

    for (let index = startIndex; index < variants.length; index += 1) {
      const { error } = await this.client.from(table).upsert(variants[index]);
      if (!error) {
        this.compatibility[compatibilityKey] = index;
        return;
      }

      lastError = error;
      if (!this.isSchemaMismatch(error)) {
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  async insertWearableSnapshot(snapshot) {
    if (!this.canSync()) {
      return;
    }

    const { error } = await this.client
      .from(TABLES.telemetry)
      .insert(buildTelemetryRow(snapshot, this.requireUserId()));

    if (error) {
      throw error;
    }
  }

  async insertPresenceEvent(event) {
    if (!this.canSync()) {
      return;
    }

    if (this.compatibility.appEventsDisabled) {
      return;
    }

    const { error } = await this.client.from(TABLES.appEvents).insert({
      user_id: this.requireUserId(),
      event_type: "presence_change",
      payload: event,
      created_at: event.recordedAt
    });

    if (error) {
      if (this.isMissingRelation(error) || this.isSchemaMismatch(error)) {
        this.compatibility.appEventsDisabled = true;
        return;
      }
      throw error;
    }
  }

  async insertAppEvent(event) {
    if (!this.canSync()) {
      return;
    }

    if (this.compatibility.appEventsDisabled) {
      return;
    }

    const { error } = await this.client.from(TABLES.appEvents).insert({
      user_id: this.requireUserId(),
      event_type: event.type,
      payload: event.payload || {},
      created_at: event.createdAt || new Date().toISOString()
    });

    if (error) {
      if (this.isMissingRelation(error) || this.isSchemaMismatch(error)) {
        this.compatibility.appEventsDisabled = true;
        return;
      }
      throw error;
    }
  }
}

module.exports = {
  SupabaseService
};
