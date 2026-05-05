function missingSupabaseError() {
  return {
    message:
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
  };
}

function emptyQueryResult() {
  return Promise.resolve({ data: null, error: missingSupabaseError(), count: 0 });
}

function createQueryBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    contains: () => builder,
    is: () => builder,
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    single: emptyQueryResult,
    maybeSingle: emptyQueryResult,
    then: (resolve: (value: unknown) => unknown) => emptyQueryResult().then(resolve),
  };

  return builder;
}

export function createMissingSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: missingSupabaseError() }),
      signUp: async () => ({ data: { user: null, session: null }, error: missingSupabaseError() }),
      signInWithOAuth: async () => ({ data: { provider: null, url: null }, error: missingSupabaseError() }),
      exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: missingSupabaseError() }),
      signOut: async () => ({ error: null }),
    },
    from: () => createQueryBuilder(),
  };
}
