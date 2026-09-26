export function SetupNotice() {
  return (
    <aside className="rounded-[20px] border border-black/15 bg-off-white p-6">
      <h2 className="font-semibold">Connect your Supabase project</h2>
      <p className="mt-2 text-sm leading-6 text-charcoal">
        Copy <code>.env.example</code> to <code>.env.local</code>, add your
        project URL and publishable key, then apply the database migrations.
        Enable Google under Authentication → Providers in Supabase when you are
        ready to connect your Google OAuth credentials.
      </p>
    </aside>
  );
}
